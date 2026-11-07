// Test helpers: an in-memory stand-in for the Supabase database API and for Loyverse.
// Used only by the function tests (deno test), never deployed.
export type Row = Record<string, any>;
export const tables = new Map<string, Row[]>();
const keys: Record<string, string[]> = {
  receipts: ['receipt_number'], receipt_lines: ['receipt_number', 'line_idx'], receipt_line_modifiers: ['receipt_number', 'line_idx', 'mod_idx'],
  sync_state: ['key'], counts: ['business_date', 'shift', 'item_id'], count_sessions: ['business_date', 'shift', 'area'], waste: ['source_key'],
  loyverse_variants: ['variant_id'],
};
const keyOf = (t: string, conflict: string | null) => (conflict ? conflict.split(',') : keys[t] ?? ['id']);
let ids = 0;

function rest(url: URL, method: string, body: any, headers: Headers): Response {
  const t = url.pathname.split('/').pop()!;
  const rows = tables.get(t) ?? [];
  tables.set(t, rows);
  const filters = [...url.searchParams].filter(([k]) => !['select', 'on_conflict', 'columns', 'order', 'limit'].includes(k));
  const match = (r: Row) => filters.every(([k, v]) => (v.startsWith('eq.') ? String(r[k]) === v.slice(3) : true));
  const single = (headers.get('accept') ?? '').includes('vnd.pgrst.object');
  const reply = (data: Row[] | null) =>
    new Response(single ? JSON.stringify(data?.[0] ?? null) : JSON.stringify(data ?? []), { status: 200, headers: { 'content-type': 'application/json' } });
  if (method === 'GET') return reply(rows.filter(match));
  if (method === 'POST') {
    const list = Array.isArray(body) ? body : [body];
    const upsert = (headers.get('prefer') ?? '').includes('resolution=merge-duplicates');
    const k = keyOf(t, url.searchParams.get('on_conflict'));
    const out: Row[] = [];
    for (const r of list) {
      const row = { ...r };
      if (!row.id && !keys[t]) row.id = 'id-' + ++ids;
      const i = upsert ? rows.findIndex((x) => k.every((c) => String(x[c]) === String(row[c]))) : -1;
      if (i >= 0) rows[i] = { ...rows[i], ...row };
      else rows.push(row);
      out.push(row);
    }
    return reply(out);
  }
  if (method === 'PATCH') {
    const hit = rows.filter(match);
    hit.forEach((r) => Object.assign(r, body));
    return reply(hit);
  }
  return new Response('?', { status: 400 });
}

export type LvHandler = (path: string, params: URLSearchParams) => any;
export function installFetch(loyverse: LvHandler, calls: string[] = []) {
  globalThis.fetch = async (input: any, init?: any) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    if (url.host === 'fake.loyverse') {
      calls.push(url.pathname.replace('/v1.0/', '') + url.search);
      return Response.json(await loyverse(url.pathname.replace('/v1.0/', ''), url.searchParams));
    }
    if (url.pathname === '/auth/v1/user') {
      const ok = req.headers.get('authorization') === 'Bearer owner-jwt';
      return ok ? Response.json({ id: 'u-owner', aud: 'authenticated', role: 'authenticated' }) : Response.json({ msg: 'bad jwt' }, { status: 401 });
    }
    const text = req.method === 'GET' ? '' : await req.text();
    return rest(url, req.method, text ? JSON.parse(text) : null, req.headers);
  };
}

/** Load a function file and return its request handler. */
export async function loadFunction(path: string, env: Record<string, string>) {
  for (const [k, v] of Object.entries({ SUPABASE_URL: 'http://fake.supabase', SUPABASE_SERVICE_ROLE_KEY: 'test', ...env })) Deno.env.set(k, v);
  let handler: ((r: Request) => Promise<Response>) | null = null;
  (Deno as any).serve = (h: any) => { handler = h; return {} as any; };
  await import(path + '?v=' + Math.random());
  return handler!;
}
