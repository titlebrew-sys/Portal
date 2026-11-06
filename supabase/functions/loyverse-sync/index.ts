// Supabase Edge Function: loyverse-sync
// Copies the Loyverse menu and receipts into the portal database. Runs every 5 minutes.
// - The Loyverse token is the Edge Function secret LOYVERSE_TOKEN (never in code or the browser).
// - First runs fill in the last 3 months of receipts (HISTORY_DAYS) in batches; safe to stop and resume.
// - Each run is written to sync_runs, shown as "Sync status" in the portal.
// Single file on purpose: it can be pasted into the Supabase dashboard editor.
import { createClient } from 'npm:@supabase/supabase-js@2';

const API = Deno.env.get('LOYVERSE_API_BASE') || 'https://api.loyverse.com/v1.0/';
const LOCATION = 'business-bay';
// How far back to fill in past receipts, counted from the first run. 92 days = about 3 months.
// To bring in more later (e.g. 730 for 2 years), change this number and see the README.
const HISTORY_DAYS = 92;
const WINDOW_DAYS = 3;
// Small runs: Supabase stops a function that works too hard in one go. History fills in over several runs.
const TIME_BUDGET_MS = 25_000;
const MAX_PAGES_PER_RUN = 10;
const PAGE = 250;
// Supabase ends a run after 150 seconds. Stop tidily before that and say where it was.
const DEADLINE_MS = Number(Deno.env.get('SYNC_DEADLINE_MS')) || 100_000;
const CALL_TIMEOUT_MS = 20_000;
const MENU_EVERY_MS = 60 * 60_000;

/** What the run is doing, so a slow step can be named. */
let step = 'starting';
function at(s: string) {
  step = s;
  console.log(`[sync] ${new Date().toISOString()} ${s}`);
}

// The portal's "Check Loyverse now" button calls this from the browser, which first asks permission (OPTIONS).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const TOKEN = Deno.env.get('LOYVERSE_TOKEN') ?? '';

type Json = Record<string, any>;

async function lv(path: string, params: Record<string, string> = {}): Promise<Json> {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    } catch (e) {
      if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') throw new Error(`Loyverse took more than 20 seconds to answer (${path})`);
      throw e;
    }
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Loyverse ${path} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return await res.json();
  }
  throw new Error(`Loyverse ${path} is busy, will try again next run`);
}

async function all(path: string, key: string): Promise<Json[]> {
  const out: Json[] = [];
  let cursor = '';
  for (let i = 0; i < 40; i++) {
    const page = await lv(path, { limit: String(PAGE), cursor });
    const list = (page[key] ?? []) as Json[];
    out.push(...list);
    const next = (page.cursor as string) ?? '';
    // Stop on the last page, an empty page, or a "next page" marker that does not move on
    if (!next || next === cursor || list.length === 0) break;
    cursor = next;
  }
  return out;
}

async function upsert(table: string, rows: Json[], onConflict?: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), onConflict ? { onConflict } : undefined);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function getState(key: string): Promise<Json | null> {
  const { data } = await db.from('sync_state').select('value').eq('key', key).maybeSingle();
  return (data?.value as Json) ?? null;
}
async function setState(key: string, value: Json) {
  const { error } = await db.from('sync_state').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(`sync_state: ${error.message}`);
}

// ---------------------------------------------------------------- menu

async function syncCatalog() {
  const [categories, stores, employees, modifiers, items] = await Promise.all([
    all('categories', 'categories'), all('stores', 'stores'), all('employees', 'employees'), all('modifiers', 'modifiers'), all('items', 'items'),
  ]);
  await upsert('loyverse_categories', categories.map((c) => ({ id: c.id, location_id: LOCATION, name: c.name ?? '' })));
  await upsert('loyverse_stores', stores.map((s) => ({ id: s.id, location_id: LOCATION, name: s.name ?? '' })));
  await upsert('loyverse_employees', employees.map((e) => ({ id: e.id, location_id: LOCATION, name: e.name ?? '' })));
  await upsert('loyverse_modifiers', modifiers.map((m) => ({ id: m.id, location_id: LOCATION, name: m.name ?? '', options: m.modifier_options ?? [] })));
  await upsert('loyverse_items', items.map((it) => ({
    id: it.id, location_id: LOCATION, name: it.item_name ?? '', category_id: it.category_id ?? null, is_composite: !!it.is_composite,
    components: it.components ?? [], modifier_ids: it.modifier_ids ?? [], track_stock: !!it.track_stock, deleted_at: it.deleted_at ?? null,
  })));
  await upsert('loyverse_variants', items.flatMap((it) => (it.variants ?? []).map((v: Json) => ({
    variant_id: v.variant_id, location_id: LOCATION, item_id: it.id, name: [v.option1_value, v.option2_value, v.option3_value].filter(Boolean).join(' / ') || null,
    sku: v.sku ?? null, cost: v.cost ?? null, default_price: v.default_price ?? null,
  }))));
  return items.length;
}

// ---------------------------------------------------------------- receipts

/** Dubai is UTC+4 and the business day starts at 4am, so the business date is the UTC date. */
const businessDate = (iso: string) => new Date(iso).toISOString().slice(0, 10);

async function saveReceipts(receipts: Json[]): Promise<string | null> {
  if (!receipts.length) return null;
  let latest: string | null = null;
  const heads = receipts.map((r) => {
    const at = r.receipt_date ?? r.created_at;
    if (!latest || at > latest) latest = at;
    return {
      receipt_number: r.receipt_number, location_id: LOCATION, store_id: r.store_id ?? null, receipt_type: r.receipt_type ?? 'SALE',
      refund_for: r.refund_for ?? null, created_at: r.created_at, receipt_date: at, updated_at: r.updated_at ?? null, business_date: businessDate(at),
      cancelled_at: r.cancelled_at ?? null, total_money: r.total_money ?? 0, total_discount: r.total_discount ?? 0, employee_id: r.employee_id ?? null,
      dining_option: r.dining_option ?? null,
    };
  });
  const lines: Json[] = [];
  const mods: Json[] = [];
  for (const r of receipts)
    (r.line_items ?? []).forEach((l: Json, i: number) => {
      lines.push({
        receipt_number: r.receipt_number, line_idx: i, location_id: LOCATION, item_id: l.item_id ?? null, variant_id: l.variant_id ?? null,
        item_name: l.item_name ?? '', variant_name: l.variant_name ?? null, sku: l.sku ?? null, quantity: l.quantity ?? 0, price: l.price ?? 0,
        total_money: l.total_money ?? 0, cost_total: l.cost_total ?? null, total_discount: l.total_discount ?? 0, line_note: l.line_note ?? null,
      });
      (l.line_modifiers ?? []).forEach((m: Json, k: number) =>
        mods.push({
          receipt_number: r.receipt_number, line_idx: i, mod_idx: k, location_id: LOCATION, modifier_option_id: m.modifier_option_id ?? null,
          grp: m.name ?? '', opt: m.option ?? '', price: m.price ?? 0, money_amount: m.money_amount ?? 0,
        }));
    });
  at(`saving ${heads.length} receipts`);
  await upsert('receipts', heads, 'receipt_number');
  await upsert('receipt_lines', lines, 'receipt_number,line_idx');
  await upsert('receipt_line_modifiers', mods, 'receipt_number,line_idx,mod_idx');
  return latest;
}

/** One page of receipts. Returns the next cursor ('' when finished). */
async function receiptPage(params: Record<string, string>, cursor: string) {
  const page = await lv('receipts', { ...params, limit: String(PAGE), cursor });
  const latest = await saveReceipts(page.receipts ?? []);
  return { count: (page.receipts ?? []).length, cursor: (page.cursor as string) ?? '', latest };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const started = Date.now();
  let pages = 0;
  step = 'starting';
  const startedAt = new Date().toISOString();
  const { data: run } = await db.from('sync_runs').insert({ location_id: LOCATION, kind: 'loyverse', started_at: startedAt, message: 'Running' }).select('id').single();
  let fetched = 0;
  let latest: string | null = null;
  const notes: string[] = [];
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - started);
  let timer = 0;
  const deadline = new Promise<Response>((resolve) => {
    timer = setTimeout(async () => {
      const message = `Stopped after ${Math.round(DEADLINE_MS / 1000)} seconds while ${step}. The next run carries on.`;
      console.log('[sync] ' + message);
      await db.from('sync_runs').update({ finished_at: new Date().toISOString(), receipts: fetched, ok: false, message, latest_receipt_at: latest }).eq('id', run?.id);
      resolve(Response.json({ ok: false, message }, { headers: CORS }));
    }, DEADLINE_MS);
  });
  const work = (async (): Promise<Response> => {
  try {
    if (!TOKEN) throw new Error('The Loyverse token is missing (Edge Function secret LOYVERSE_TOKEN).');

    // 1. Menu, once an hour (small: one page of items)
    const menu = await getState('catalog');
    if (!menu || Date.now() - Date.parse(menu.at) > MENU_EVERY_MS) {
      at('reading the menu from Loyverse');
      const items = await syncCatalog();
      await setState('catalog', { at: new Date().toISOString(), items });
      notes.push(`${items} menu items`);
    }

    // 2. New and changed receipts since the last run (2 minutes overlap; saving twice is harmless)
    const live = (await getState('live')) ?? { since: startedAt, firstRun: startedAt };
    const since = new Date(Date.parse(live.since) - 2 * 60_000).toISOString();
    let cursor = '';
    for (let i = 0; i < 40; i++) {
      at(`reading new receipts, page ${i + 1}`);
      const p = await receiptPage({ updated_at_min: since }, cursor);
      pages++;
      fetched += p.count;
      if (p.latest && (!latest || p.latest > latest)) latest = p.latest;
      cursor = p.cursor;
      if (!cursor || timeLeft() < 5000 || pages >= MAX_PAGES_PER_RUN) break;
    }
    if (!cursor) await setState('live', { ...live, since: startedAt });
    else await setState('live', live); // remember the first run time even if this run stopped early

    // 3. Past receipts (last HISTORY_DAYS), a few days at a time, picking up where the last run stopped
    const historyFrom = new Date(Date.parse(live.firstRun) - HISTORY_DAYS * 864e5).toISOString();
    const back = (await getState('backfill')) ?? { windowStart: historyFrom, cursor: '', done: false };
    // Never go further back than HISTORY_DAYS, even if an earlier run started from an older date
    if (back.windowStart < historyFrom) Object.assign(back, { windowStart: historyFrom, cursor: '' });
    let backCount = 0;
    while (!back.done && timeLeft() > 8000 && pages < MAX_PAGES_PER_RUN) {
      const until = live.firstRun as string;
      const windowEnd = new Date(Math.min(Date.parse(back.windowStart) + WINDOW_DAYS * 864e5, Date.parse(until))).toISOString();
      at(`reading past receipts from ${back.windowStart.slice(0, 10)}`);
      const p = await receiptPage({ created_at_min: back.windowStart, created_at_max: windowEnd }, back.cursor);
      pages++;
      backCount += p.count;
      back.cursor = p.cursor;
      if (!p.cursor) {
        back.windowStart = windowEnd;
        if (windowEnd >= until) back.done = true;
      }
      await setState('backfill', back);
    }
    fetched += backCount;
    if (!back.done) notes.push(`history filled up to ${back.windowStart.slice(0, 10)}`);

    at('finished');
    const message = `${fetched} receipts${notes.length ? ' · ' + notes.join(' · ') : ''}`;
    await db.from('sync_runs').update({ finished_at: new Date().toISOString(), receipts: fetched, ok: true, message, latest_receipt_at: latest }).eq('id', run?.id);
    return Response.json({ ok: true, receipts: fetched, message }, { headers: CORS });
  } catch (e) {
    const message = (e as Error).message;
    console.log('[sync] problem: ' + message);
    await db.from('sync_runs').update({ finished_at: new Date().toISOString(), receipts: fetched, ok: false, message, latest_receipt_at: latest }).eq('id', run?.id);
    return Response.json({ ok: false, message }, { status: 500, headers: CORS });
  } finally {
    clearTimeout(timer);
  }
  })();
  return Promise.race([work, deadline]);
});
