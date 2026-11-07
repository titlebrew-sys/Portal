// deno test --allow-env --allow-read supabase/functions/_test/
import { assertEquals, assert } from 'jsr:@std/assert@1';
import { installFetch, loadFunction, tables } from './fake.ts';

const receipt = (n: number, at: string, extra: any = {}) => ({
  receipt_number: `1-${n}`, receipt_type: 'SALE', created_at: at, receipt_date: at, updated_at: at, total_money: 20, dining_option: 'Take-Away',
  line_items: [{ item_id: 'it-latte', item_name: 'Latte', quantity: 1, price: 20, total_money: 20, line_modifiers: [{ name: 'Alternative Milk', option: 'Oat', money_amount: 3 }] }],
  ...extra,
});

const nowIso = () => new Date().toISOString();
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
function fakeLoyverse(receipts: any[], status = 200) {
  return (path: string) => {
    if (status !== 200) return Promise.reject(new Error('unused'));
    if (path === 'merchant') return { business_name: 'Title Brew' };
    if (path === 'stores') return { stores: [{ id: 's1', name: 'Title Brew Bay Square' }] };
    if (path === 'employees') return { employees: [{ id: 'e1', name: 'Arsen' }] };
    if (path === 'receipts') return { receipts, cursor: null };
    return {};
  };
}
const sale = (n: number, at: string, extra: any = {}) => ({
  receipt_number: `1-${n}`, receipt_type: 'SALE', created_at: at, receipt_date: at, total_money: 23, total_discount: 0, employee_id: 'e1', store_id: 's1',
  dining_option: 'Take-Away', payments: [{ name: 'Card', money_amount: 23 }],
  line_items: [{ item_id: 'it1', item_name: 'Cappuccino', quantity: 1, price: 20, total_money: 23, total_discount: 0,
    line_modifiers: [{ name: 'Alternative Milk', option: 'Oat', money_amount: 3 }] }],
  ...extra,
});

Deno.test({ name: 'loyverse-sync live: the owner gets every receipt for yesterday and today, with the till check', sanitizeOps: false, sanitizeResources: false }, async () => {
  tables.clear();
  tables.set('profiles', [{ id: 'u-owner', role: 'owner', active: true }]);
  const yesterdayNoon = new Date(Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z') - 12 * 3600_000).toISOString();
  installFetch(fakeLoyverse([sale(1, minsAgo(3)), sale(2, yesterdayNoon), sale(3, minsAgo(30), { receipt_type: 'REFUND' }), sale(4, minsAgo(40), { cancelled_at: nowIso() }),
    sale(5, '2020-01-01T08:00:00Z')]));
  const run = await loadFunction('../loyverse-sync/index.ts', { LOYVERSE_TOKEN: 'x', LOYVERSE_API_BASE: 'http://fake.loyverse/v1.0/' });
  const res = await (await run(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer owner-jwt' } }))).json();
  assertEquals(res.ok, true);
  assertEquals(res.owner, true);
  assertEquals(res.receipts.map((r: any) => r.number).sort(), ['1-1', '1-2', '1-3', '1-4']); // old one left out
  const r1 = res.receipts.find((r: any) => r.number === '1-1');
  assertEquals([r1.employee, r1.store, r1.dining, r1.payments[0].name, r1.lines[0].modifiers[0].option], ['Arsen', 'Title Brew Bay Square', 'Take-Away', 'Card', 'Oat']);
  const text = res.checks.map((c: any) => c.text).join(' | ');
  assert(text.includes('Connected to Loyverse (Title Brew)'), text);
  assert(text.includes('Last sale 3 minutes ago (receipt 1-1)'), text);
  assert(text.includes('1 refund, 1 cancelled receipt'), text);
  // The check is saved for the portal's Sync status
  assertEquals(tables.get('sync_runs')!.at(-1)!.ok, true);
});

Deno.test({ name: 'loyverse-sync live: the 5-minute schedule only checks; no sales or money without the owner login', sanitizeOps: false, sanitizeResources: false }, async () => {
  tables.clear();
  installFetch(fakeLoyverse([sale(1, minsAgo(3))]));
  const run = await loadFunction('../loyverse-sync/index.ts', { LOYVERSE_TOKEN: 'x', LOYVERSE_API_BASE: 'http://fake.loyverse/v1.0/' });
  const res = await (await run(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer public-anon-key' } }))).json();
  assertEquals([res.ok, res.owner, res.receipts.length], [true, false, 0]);
  assertEquals(tables.get('sync_runs')!.length, 1);
  const pre = await run(new Request('http://x', { method: 'OPTIONS' }));
  assertEquals([pre.status, pre.headers.get('access-control-allow-origin')], [200, '*']);
});

Deno.test({ name: 'loyverse-sync live: warnings in plain words', sanitizeOps: false, sanitizeResources: false }, async () => {
  tables.clear();
  // Sale reached Loyverse 40 minutes after it was made: the till was offline
  installFetch(fakeLoyverse([sale(1, minsAgo(45), { created_at: minsAgo(5) })]));
  let run = await loadFunction('../loyverse-sync/index.ts', { LOYVERSE_TOKEN: 'x', LOYVERSE_API_BASE: 'http://fake.loyverse/v1.0/' });
  let res = await (await run(new Request('http://x', { method: 'POST' }))).json();
  assert(res.checks.some((c: any) => c.level === 'warn' && c.text.includes('reached Loyverse late')), JSON.stringify(res.checks));
  // A refused key
  installFetch(() => ({}));
  globalThis.fetch = ((orig) => async (input: any, init?: any) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.host === 'fake.loyverse') return new Response('no', { status: 401 });
    return orig(input, init);
  })(globalThis.fetch);
  res = await (await run(new Request('http://x', { method: 'POST' }))).json();
  assertEquals(res.ok, false);
  assert(res.checks[0].text.startsWith('Loyverse refused the key'), res.checks[0].text);
  // No key at all
  installFetch(() => ({}));
  run = await loadFunction('../loyverse-sync/index.ts', { LOYVERSE_TOKEN: '', LOYVERSE_API_BASE: 'http://fake.loyverse/v1.0/' });
  res = await (await run(new Request('http://x', { method: 'POST' }))).json();
  assert(res.checks[0].text.includes('Loyverse key is missing'), res.checks[0].text);
});

Deno.test({ name: 'sheet-counts: secret required, counts saved once, kitchen total, waste, unknown names', sanitizeOps: false, sanitizeResources: false }, async () => {
  tables.clear();
  tables.set('count_items', [
    { id: 'bar-brazil-beans', name: 'Brazil beans', area: 'Bar', has_batches: false, has_frozen: false },
    { id: 'kit-almond-croissant', name: 'Almond croissant', area: 'Kitchen', has_batches: true, has_frozen: true },
  ]);
  tables.set('count_item_aliases', [{ name: 'Brazil', item_id: 'bar-brazil-beans' }]);
  installFetch(() => ({}));
  const run = await loadFunction('../sheet-counts/index.ts', { BRIDGE_SECRET: 's3cret' });
  const body = {
    batches: [
      { business_date: '2026-11-06', shift: 1, area: 'Bar', saved_by: 'Arsen', saved_at: '2026-11-06T12:10:00Z', rows: [{ item: 'Brazil', qty: 11605 }, { item: 'Mystery syrup', qty: 1 }] },
      { business_date: '2026-11-06', shift: 2, area: 'Kitchen', saved_by: 'Rhobel', saved_at: '2026-11-06T17:00:00Z',
        rows: [{ item: 'Almond croissant', qty: 99, old: 1, new: 2, frozen: 20, old_expiry: '2026-11-06', cleared_qty: 1, cleared_reason: 'Expired' }] },
    ],
  };
  const post = (secret: string) => run(new Request('http://x', { method: 'POST', headers: { 'x-bridge-secret': secret }, body: JSON.stringify(body) }));
  assertEquals((await post('wrong')).status, 401);
  const res = await (await post('s3cret')).json();
  assertEquals([res.saved, res.waste, res.unknown], [2, 1, ['Mystery syrup']]);
  const firstTime = tables.get('counts')!.find((c) => c.item_id === 'bar-brazil-beans')!.saved_at;
  // Sent again later (5pm re-save) with the same numbers: nothing doubles and the time is kept
  body.batches[0].saved_at = '2026-11-06T13:00:00Z';
  const again = await (await post('s3cret')).json();
  assertEquals(again.saved, 0);
  assertEquals(tables.get('counts')!.find((c) => c.item_id === 'bar-brazil-beans')!.saved_at, firstTime);
  // A changed number is saved with the new time
  body.batches[0].rows[0].qty = 11500;
  assertEquals((await (await post('s3cret')).json()).saved, 1);
  assertEquals(tables.get('counts')!.find((c) => c.item_id === 'bar-brazil-beans')!.saved_at, '2026-11-06T13:00:00.000Z');
  const counts = tables.get('counts')!;
  assertEquals(counts.length, 2);
  assertEquals(counts.find((c) => c.item_id === 'kit-almond-croissant')!.qty, 23);
  assertEquals(tables.get('waste')!.length, 1);
  assert(tables.get('sync_runs')!.at(-1)!.message.includes('names not matched: Mystery syrup'));
});

