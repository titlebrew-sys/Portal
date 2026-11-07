// Supabase Edge Function: loyverse-sync (simple live version)
//
// Reads yesterday's and today's sales straight from Loyverse. Nothing is copied into the database.
// - Called by the portal (owner login): returns every receipt for yesterday and today, plus a
//   "Is the till live?" check in plain words.
// - Called every 5 minutes by the schedule (no login): runs the same check and saves one line to
//   sync_runs, so the portal can show whether the till stayed live all day. No sales are returned.
// - The Loyverse token is the Edge Function secret LOYVERSE_TOKEN (never in code or the browser).
// Single file on purpose: it can be pasted into the Supabase dashboard editor.
import { createClient } from 'npm:@supabase/supabase-js@2';

const API = Deno.env.get('LOYVERSE_API_BASE') || 'https://api.loyverse.com/v1.0/';
const TOKEN = Deno.env.get('LOYVERSE_TOKEN') ?? '';
const LOCATION = 'business-bay';
const DAY = 864e5;
const CALL_TIMEOUT_MS = 20_000;
/**
 * Opening hours in Dubai, for the "no sale for a while" warning.
 * Weekdays 7am to 9pm, weekends (Saturday and Sunday) 10am to 8pm.
 */
const HOURS = { weekday: { open: 7, close: 21 }, weekend: { open: 10, close: 20 } };
function hoursOn(d: Date) {
  const dubai = new Date(d.getTime() + 4 * 3600_000);
  const day = dubai.getUTCDay(); // 0 Sunday ... 6 Saturday
  return day === 0 || day === 6 ? HOURS.weekend : HOURS.weekday;
}
const QUIET_MINUTES = 90;
const LATE_MINUTES = 15;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Json = Record<string, any>;
type Level = 'ok' | 'warn' | 'bad';
type Check = { level: Level; text: string };

class LoyverseError extends Error {}

async function lv(path: string, params: Record<string, string> = {}): Promise<Json> {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    } catch (e) {
      const name = (e as Error).name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new LoyverseError('Loyverse did not answer within 20 seconds. It may be down; try again in a few minutes.');
      throw new LoyverseError('Could not reach Loyverse. Try again in a few minutes.');
    }
    if (res.status === 401 || res.status === 403) throw new LoyverseError('Loyverse refused the key. It may have been changed or deleted in Loyverse (Settings > Access tokens).');
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new LoyverseError(`Loyverse answered with an error (${res.status}) when asked for ${path}.`);
    return await res.json();
  }
  throw new LoyverseError('Loyverse is busy right now. Try again in a minute.');
}

/** All pages of a list, with guards so it can never loop forever. */
async function pages(path: string, key: string, params: Record<string, string> = {}, max = 20): Promise<Json[]> {
  const out: Json[] = [];
  let cursor = '';
  for (let i = 0; i < max; i++) {
    const page = await lv(path, { ...params, limit: '250', cursor });
    const list = (page[key] ?? []) as Json[];
    out.push(...list);
    const next = (page.cursor as string) ?? '';
    if (!next || next === cursor || list.length === 0) break;
    cursor = next;
  }
  return out;
}

/** Dubai is UTC+4 and a shop day starts at 4am, so the shop day is the UTC date. */
const shopDay = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const dubaiHour = (d: Date) => new Date(d.getTime() + 4 * 3600_000).getUTCHours();
const dubaiTime = (iso: string) => new Date(Date.parse(iso) + 4 * 3600_000).toISOString().slice(11, 16);
const minutes = (ms: number) => Math.round(ms / 60_000);

/** True when the request comes from the owner's portal login. */
async function isOwner(req: Request): Promise<boolean> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  try {
    const { data } = await db.auth.getUser(token);
    if (!data?.user) return false;
    const { data: p } = await db.from('profiles').select('role, active').eq('id', data.user.id).maybeSingle();
    return p?.role === 'owner' && p?.active !== false;
  } catch {
    return false;
  }
}

export async function readLoyverse(now = new Date()) {
  const today = shopDay(now.toISOString());
  const yesterday = shopDay(new Date(now.getTime() - DAY).toISOString());
  // From 6 hours before yesterday started, so sales that reached Loyverse late are included
  const from = new Date(Date.parse(`${yesterday}T00:00:00Z`) - 6 * 3600_000).toISOString();
  const [merchant, stores, employees, raw] = await Promise.all([
    lv('merchant'),
    pages('stores', 'stores'),
    pages('employees', 'employees'),
    pages('receipts', 'receipts', { created_at_min: from }),
  ]);
  const storeName = new Map(stores.map((s) => [s.id, s.name ?? '']));
  const staffName = new Map(employees.map((e) => [e.id, e.name ?? '']));

  const receipts = raw
    .map((r) => {
      const at = r.receipt_date ?? r.created_at;
      return {
        number: String(r.receipt_number),
        type: r.receipt_type === 'REFUND' ? 'REFUND' : 'SALE',
        at,
        createdAt: r.created_at,
        businessDate: shopDay(at),
        dining: r.dining_option ?? null,
        cancelled: !!r.cancelled_at,
        total: Number(r.total_money ?? 0),
        discount: Number(r.total_discount ?? 0),
        employee: staffName.get(r.employee_id) ?? null,
        store: storeName.get(r.store_id) ?? null,
        payments: (r.payments ?? []).map((p: Json) => ({ name: p.name ?? p.type ?? 'Payment', amount: Number(p.money_amount ?? 0) })),
        lines: (r.line_items ?? []).map((l: Json) => ({
          item: l.item_name ?? '',
          itemId: l.item_id ?? null,
          inMenu: !!l.item_id,
          variant: l.variant_name ?? null,
          qty: Number(l.quantity ?? 0),
          price: Number(l.price ?? 0),
          total: Number(l.total_money ?? 0),
          discount: Number(l.total_discount ?? 0),
          note: l.line_note ?? null,
          modifiers: (l.line_modifiers ?? []).map((m: Json) => ({ group: m.name ?? '', option: m.option ?? '', amount: Number(m.money_amount ?? 0) })),
        })),
      };
    })
    .filter((r) => r.businessDate === today || r.businessDate === yesterday)
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  // ---- "Is the till live?" in plain words
  const checks: Check[] = [];
  checks.push({ level: 'ok', text: `Connected to Loyverse${merchant.business_name ? ` (${merchant.business_name})` : ''}.` });
  if (stores.length) checks.push({ level: 'ok', text: `Shop${stores.length > 1 ? 's' : ''} in Loyverse: ${stores.map((s) => s.name).join(', ')}.` });

  const todays = receipts.filter((r) => r.businessDate === today && !r.cancelled);
  const last = todays.find((r) => r.type === 'SALE');
  const hour = dubaiHour(now);
  const hrs = hoursOn(now);
  const open = hour >= hrs.open && hour < hrs.close;
  if (last) {
    const ago = minutes(now.getTime() - Date.parse(last.at));
    const text = `Last sale ${ago <= 1 ? 'just now' : ago < 120 ? `${ago} minutes ago` : `at ${dubaiTime(last.at)}`} (receipt ${last.number}).`;
    checks.push({ level: open && ago > QUIET_MINUTES ? 'warn' : 'ok', text: open && ago > QUIET_MINUTES ? `${text} No sale for ${Math.round(ago / 6) / 10} hours: check the till is online.` : text });
  } else {
    const late = open && hour >= hrs.open + 2;
    checks.push({ level: late ? 'warn' : 'ok', text: late ? 'No sales in Loyverse yet today: check the till is online.' : open ? 'No sales yet today.' : `No sales yet today. The shop opens at ${hrs.open}am.` });
  }

  const lags = todays.map((r) => Date.parse(r.createdAt) - Date.parse(r.at)).filter((x) => Number.isFinite(x));
  const late = lags.filter((x) => x > LATE_MINUTES * 60_000);
  if (late.length) checks.push({ level: 'warn', text: `${late.length} sale${late.length > 1 ? 's' : ''} reached Loyverse late today (up to ${minutes(Math.max(...late))} minutes). The till may have been offline for a while.` });
  else if (lags.length) checks.push({ level: 'ok', text: `Sales reach Loyverse within ${Math.max(1, minutes(Math.max(...lags)))} minute${minutes(Math.max(...lags)) > 1 ? 's' : ''}.` });

  const noPay = todays.filter((r) => r.type === 'SALE' && r.total > 0 && !r.payments.length);
  if (noPay.length) checks.push({ level: 'warn', text: `${noPay.length} receipt${noPay.length > 1 ? 's' : ''} today with no payment recorded.` });
  const custom = todays.reduce((a, r) => a + r.lines.filter((l: Json) => !l.inMenu).length, 0);
  if (custom) checks.push({ level: 'warn', text: `${custom} item${custom > 1 ? 's' : ''} sold today that ${custom > 1 ? 'are' : 'is'} not on the Loyverse menu (typed in by hand).` });
  const refunds = todays.filter((r) => r.type === 'REFUND').length;
  const cancelled = receipts.filter((r) => r.businessDate === today && r.cancelled).length;
  if (refunds || cancelled) checks.push({ level: 'ok', text: `Today: ${refunds} refund${refunds === 1 ? '' : 's'}, ${cancelled} cancelled receipt${cancelled === 1 ? '' : 's'} (left out of the totals).` });

  return { today, yesterday, account: merchant.business_name ?? null, checks, receipts, last: last?.at ?? null, todayCount: todays.filter((r) => r.type === 'SALE').length };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const startedAt = new Date().toISOString();
  const owner = await isOwner(req);
  const ask = await req.clone().json().catch(() => ({}));
  // The Loyverse menu with recipes (components), so the portal can set up its own recipes. Owner only.
  if (ask?.action === 'menu') {
    if (!owner) return Response.json({ ok: false, message: 'Only the owner can read the menu.' }, { status: 403, headers: CORS });
    try {
      const [items, categories] = await Promise.all([pages('items', 'items'), pages('categories', 'categories')]);
      const cat = new Map(categories.map((c) => [c.id, c.name ?? null]));
      const menu = items.filter((i) => !i.deleted_at).map((i) => ({
        id: i.id, name: i.item_name ?? '', category: cat.get(i.category_id) ?? null, isComposite: !!i.is_composite,
        components: (i.components ?? []).map((c: Json) => ({ variantId: c.variant_id, qty: Number(c.quantity ?? 0) })),
        variantIds: (i.variants ?? []).map((v: Json) => v.variant_id),
      }));
      return Response.json({ ok: true, menu }, { headers: CORS });
    } catch (e) {
      return Response.json({ ok: false, message: (e as Error).message }, { status: 500, headers: CORS });
    }
  }
  let result: Awaited<ReturnType<typeof readLoyverse>> | null = null;
  let problem: string | null = null;
  try {
    if (!TOKEN) throw new LoyverseError('The Loyverse key is missing in Supabase (Edge Functions > Secrets > LOYVERSE_TOKEN).');
    result = await readLoyverse();
  } catch (e) {
    problem = e instanceof LoyverseError ? e.message : `Something went wrong: ${(e as Error).message}`;
  }
  const checks: Check[] = result ? result.checks : [{ level: 'bad', text: problem! }];
  const ok = !!result && !checks.some((c) => c.level === 'bad');
  const message = result
    ? `${result.todayCount} sales today${result.last ? `, last at ${dubaiTime(result.last)}` : ''}. ${checks.filter((c) => c.level === 'warn').map((c) => c.text).join(' ')}`.trim()
    : problem!;
  // One line per check, so the portal can show whether the till stayed live all day
  await db.from('sync_runs').insert({
    location_id: LOCATION, kind: 'loyverse', started_at: startedAt, finished_at: new Date().toISOString(),
    receipts: result?.todayCount ?? 0, ok, message, latest_receipt_at: result?.last ?? null,
  });
  const body = {
    ok, checkedAt: startedAt, checks, account: result?.account ?? null, today: result?.today ?? null, yesterday: result?.yesterday ?? null,
    // Sales and money only for the owner's login
    receipts: owner && result ? result.receipts : [],
    owner,
  };
  return Response.json(body, { headers: CORS });
});
