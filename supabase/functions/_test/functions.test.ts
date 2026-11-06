// deno test --allow-env --allow-read supabase/functions/_test/
import { assertEquals, assert } from 'jsr:@std/assert@1';
import { installFetch, loadFunction, tables } from './fake.ts';

const receipt = (n: number, at: string, extra: any = {}) => ({
  receipt_number: `1-${n}`, receipt_type: 'SALE', created_at: at, receipt_date: at, updated_at: at, total_money: 20, dining_option: 'Take-Away',
  line_items: [{ item_id: 'it-latte', item_name: 'Latte', quantity: 1, price: 20, total_money: 20, line_modifiers: [{ name: 'Alternative Milk', option: 'Oat', money_amount: 3 }] }],
  ...extra,
});

Deno.test({ name: 'loyverse-sync: menu, new receipts, and 2-year history in resumable batches', sanitizeOps: false, sanitizeResources: false }, async () => {
  tables.clear();
  // 1000 historic receipts spread from Nov 2024; 3 recent ones
  const history = Array.from({ length: 1000 }, (_, i) => receipt(i, new Date(Date.parse('2024-11-05T06:00:00Z') + i * 17 * 3600_000).toISOString()));
  const recent = [receipt(5001, new Date().toISOString()), receipt(5002, new Date().toISOString(), { cancelled_at: new Date().toISOString() }),
    receipt(5003, new Date().toISOString(), { receipt_type: 'REFUND' })];
  const calls: string[] = [];
  installFetch((path, q) => {
    if (path === 'items') return { items: [{ id: 'it-latte', item_name: 'Latte', is_composite: true, components: [{ variant_id: 'v-coffee', quantity: 18 }], variants: [{ variant_id: 'v-latte' }] }] };
    if (['categories', 'stores', 'employees', 'modifiers'].includes(path)) return { [path]: [{ id: path + '-1', name: path }] };
    if (path === 'receipts') {
      let list = q.get('updated_at_min') ? recent.filter((r) => r.updated_at >= q.get('updated_at_min')!)
        : history.filter((r) => r.created_at >= q.get('created_at_min')! && r.created_at < q.get('created_at_max')!);
      const start = Number(q.get('cursor') || 0);
      const page = list.slice(start, start + 250);
      return { receipts: page, cursor: start + 250 < list.length ? String(start + 250) : null };
    }
    return {};
  }, calls);
  const run = await loadFunction('../loyverse-sync/index.ts', { LOYVERSE_TOKEN: 'x', LOYVERSE_API_BASE: 'http://fake.loyverse/v1.0/' });
  const res = await (await run(new Request('http://x'))).json();
  assert(res.ok, res.message);
  assertEquals(tables.get('loyverse_items')!.length, 1);
  assertEquals(tables.get('receipts')!.length, 1003);
  assertEquals(tables.get('receipt_line_modifiers')!.length, 1003);
  const r = tables.get('receipts')!.find((x) => x.receipt_number === '1-5002')!;
  assert(r.cancelled_at, 'cancelled time kept so it is ignored later');
  assertEquals(tables.get('sync_state')!.find((s) => s.key === 'backfill')!.value.done, true);
  const log = tables.get('sync_runs')!.at(-1)!;
  assertEquals([log.ok, log.receipts], [true, 1003]);
  // Second run: history is done, only new receipts are asked for; saving again does not duplicate
  calls.length = 0;
  await (await run(new Request('http://x'))).json();
  assertEquals(tables.get('receipts')!.length, 1003);
  assert(calls.every((c) => !c.includes('created_at_min')), 'no more history requests');
});

Deno.test({ name: 'loyverse-sync: a failure is logged in plain words', sanitizeOps: false, sanitizeResources: false }, async () => {
  tables.clear();
  installFetch(() => ({}));
  const run = await loadFunction('../loyverse-sync/index.ts', { LOYVERSE_TOKEN: '', LOYVERSE_API_BASE: 'http://fake.loyverse/v1.0/' });
  const res = await run(new Request('http://x'));
  assertEquals(res.status, 500);
  assertEquals(tables.get('sync_runs')!.at(-1)!.message, 'The Loyverse token is missing (Edge Function secret LOYVERSE_TOKEN).');
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
