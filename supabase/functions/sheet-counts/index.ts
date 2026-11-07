// Supabase Edge Function: sheet-counts
// Receives counts from the Google Sheet (Apps Script) and saves them as portal counts.
// - Protected by the secret BRIDGE_SECRET, sent in the "x-bridge-secret" header. Anything without it is rejected.
// - Saving the same count again never doubles it: counts are keyed by (date, shift, item), waste by a source key.
// - Unknown sheet item names are reported in the Sync status log.
// Deploy with "Verify JWT" turned OFF (the secret header protects it instead).
import { createClient } from 'npm:@supabase/supabase-js@2';

const LOCATION = 'business-bay';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SECRET = Deno.env.get('BRIDGE_SECRET') ?? '';

type Row = {
  item: string;
  qty?: number | null;
  old?: number | null;
  new?: number | null;
  frozen?: number | null;
  old_expiry?: string | null;
  new_expiry?: string | null;
  cleared_qty?: number | null;
  cleared_reason?: string | null;
};
type Batch = { business_date: string; shift: 1 | 2 | 'W' | '1' | '2'; area: 'Bar' | 'Kitchen' | 'Weekly'; saved_by: string; saved_at: string; rows: Row[] };
/** A delivery from the staff app's Deliveries screen. */
type Delivery = {
  id: string; business_date: string; kind: 'order' | 'shop' | 'supplier'; supplier: string; order_date: string; at: string; by: string;
  paid: number | null; why: string; note: string;
  items: { order_item: string; count_item: string; ordered: number | null; qty: number; count_qty: number }[];
};
/** A day's final orders from the sheet, in count units (what staff count: L, g, pcs...). */
type SheetOrders = { business_date: string; items: { order_item: string; count_qty: number }[]; partial?: boolean };

/** Same id every time for the same day and supplier, so re-sending replaces instead of adding. */
async function stableId(text: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** Like the sheet: an order is taken as delivered on the supplier's next delivery morning (8am Dubai). */
function deliveredAt(orderDate: string, leadDays: number, noDeliveryDays: number[]): string {
  let d = addDays(orderDate, Math.max(1, leadDays || 1));
  // Nothing is delivered on Sunday, for any supplier
  const closed = [...new Set([0, ...noDeliveryDays])];
  for (let i = 0; i < 7 && closed.includes(new Date(d + 'T00:00:00Z').getUTCDay()); i++) d = addDays(d, 1);
  return new Date(Date.parse(d + 'T08:00:00+04:00')).toISOString();
}

const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const REASONS: Record<string, string> = { expired: 'Expired', damaged: 'Damaged', notsold: 'Not sold' };

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Use POST', { status: 405 });
  if (!sameSecret(req.headers.get('x-bridge-secret') ?? '', SECRET)) return new Response('Not allowed', { status: 401 });

  let body: Batch | { batches: Batch[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, message: 'Not valid JSON' }, { status: 400 });
  }
  const batches: Batch[] = 'batches' in body ? body.batches : [body as Batch];
  const sheetOrders: SheetOrders[] = ('orders' in body && Array.isArray((body as any).orders)) ? (body as any).orders : [];

  const [{ data: items }, { data: aliases }] = await Promise.all([
    db.from('count_items').select('id, name, area, has_batches, has_frozen'),
    db.from('count_item_aliases').select('name, item_id'),
  ]);
  const byName = new Map<string, any>();
  for (const i of items ?? []) byName.set(norm(i.name), i);
  for (const a of aliases ?? []) {
    const it = (items ?? []).find((i: any) => i.id === a.item_id);
    if (it) byName.set(norm(a.name), it);
  }

  const unknown = new Set<string>();
  let saved = 0;
  let wasteSaved = 0;
  const errors: string[] = [];

  for (const b of batches) {
    const d = date(b.business_date);
    const shift = String(b.shift) === 'W' || b.area === 'Weekly' ? 1 : Number(b.shift);
    if (!d || ![1, 2].includes(shift) || !['Bar', 'Kitchen', 'Weekly'].includes(b.area)) {
      errors.push(`Skipped a batch with date "${b.business_date}", shift "${b.shift}", area "${b.area}"`);
      continue;
    }
    const savedAt = b.saved_at && !Number.isNaN(Date.parse(b.saved_at)) ? new Date(b.saved_at).toISOString() : new Date().toISOString();
    const who = String(b.saved_by || 'Google Sheet');
    const counts: any[] = [];
    const waste: any[] = [];
    for (const r of b.rows ?? []) {
      const it = byName.get(norm(r.item));
      if (!it) { if (String(r.item ?? '').trim()) unknown.add(String(r.item).trim()); continue; }
      const old = num(r.old), nw = num(r.new), fr = num(r.frozen);
      const batchItem = it.has_batches || it.has_frozen;
      const qty = batchItem && (old !== null || nw !== null || fr !== null) ? (old ?? 0) + (nw ?? 0) + (fr ?? 0) : num(r.qty);
      if (qty !== null)
        counts.push({
          business_date: d, shift, item_id: it.id, qty, old_qty: it.has_batches ? old : null, new_qty: it.has_batches ? nw : null,
          frozen_qty: it.has_frozen ? fr : null, exp_old: date(r.old_expiry), exp_new: date(r.new_expiry), counted_by: who, saved_at: savedAt, location_id: LOCATION,
        });
      const cleared = num(r.cleared_qty);
      if (cleared && cleared > 0)
        waste.push({
          date: d, item: it.name, qty: cleared, reason: REASONS[norm(r.cleared_reason ?? '')] ?? 'Expired', logged_by: who, created_at: savedAt,
          location_id: LOCATION, source_key: `sheet|${d}|${shift}|${it.id}`,
        });
    }
    // The sheet re-sends at 5pm and 11pm. A count whose numbers did not change keeps the time it was
    // first saved, so sales between the real count and the re-send are not counted against it.
    const { data: before } = await db.from('counts').select('*').eq('business_date', d).eq('shift', shift);
    const same = (a: any, c: any) =>
      a && ['qty', 'old_qty', 'new_qty', 'frozen_qty'].every((k) => (a[k] === null || a[k] === undefined ? null : Number(a[k])) === (c[k] ?? null)) &&
      (a.exp_old ?? null) === c.exp_old && (a.exp_new ?? null) === c.exp_new;
    const changed = counts.filter((c) => !same((before ?? []).find((x: any) => x.item_id === c.item_id), c));
    if (changed.length) {
      const { error } = await db.from('counts').upsert(changed, { onConflict: 'business_date,shift,item_id' });
      if (error) errors.push(`${b.area} shift ${b.shift}: ${error.message}`);
      else saved += changed.length;
    }
    if (counts.length) {
      const total = (items ?? []).filter((i: any) => i.area === b.area).length;
      await db.from('count_sessions').upsert(
        { business_date: d, shift, area: b.area, saved_by: who, saved_at: savedAt, done: counts.length, total, location_id: LOCATION },
        { onConflict: 'business_date,shift,area' },
      );
    }
    if (waste.length) {
      const { error } = await db.from('waste').upsert(waste, { onConflict: 'source_key' });
      if (error) errors.push(`Waste: ${error.message}`);
      else wasteSaved += waste.length;
    }
  }

  // Orders from the sheet become deliveries, one per supplier per day
  let ordersSaved = 0;
  const unknownOrders = new Set<string>();
  if (sheetOrders.length) {
    const [{ data: rules }, { data: sups }] = await Promise.all([
      db.from('rules').select('id, supplier_id, order_item, order_unit, pack_size, price'),
      db.from('suppliers').select('id, lead_days, no_delivery_days'),
    ]);
    for (const o of sheetOrders) {
      const d = date(o.business_date);
      // No orders are placed on Saturday (nothing is delivered on Sunday)
      if (!d || new Date(d + 'T00:00:00Z').getUTCDay() === 6) continue;
      const bySupplier = new Map<string, any[]>();
      for (const it of o.items ?? []) {
        const qty = num(it.count_qty);
        if (!qty || qty <= 0) continue;
        const rule = (rules ?? []).find((r: any) => norm(r.order_item) === norm(it.order_item));
        if (!rule || !rule.supplier_id) { unknownOrders.add(String(it.order_item)); continue; }
        const line = { ruleId: rule.id, name: rule.order_item, qty: Math.round((qty / (Number(rule.pack_size) || 1)) * 1000) / 1000, unit: rule.order_unit, price: rule.price === null ? null : Number(rule.price) };
        bySupplier.set(rule.supplier_id, [...(bySupplier.get(rule.supplier_id) ?? []), line]);
      }
      // Suppliers taken off the order since the last send: remove their earlier sheet order for that day
      const { data: earlier } = await db.from('orders').select('id, supplier_id').eq('business_date', d).eq('sent_by', 'Google Sheet');
      if (!o.partial) for (const e of earlier ?? []) if (!bySupplier.has(e.supplier_id)) await db.from('orders').delete().eq('id', e.id);
      for (const [supplierId, lines] of bySupplier) {
        const s = (sups ?? []).find((x: any) => x.id === supplierId);
        const id = await stableId(`sheet-order|${d}|${supplierId}`);
        // Once staff have confirmed what arrived, keep their numbers
        const { data: had } = await db.from('orders').select('received_by').eq('id', id).maybeSingle();
        const confirmed = String(had?.received_by ?? '').includes('(confirmed)');
        const { error } = await db.from('orders').upsert({
          id, business_date: d, supplier_id: supplierId, lines,
          message: 'From the Google Sheet', sent_by: 'Google Sheet', sent_at: new Date(Date.parse(d + 'T17:00:00+04:00')).toISOString(),
          ...(confirmed ? {} : {
            received: lines.map((l: any) => ({ ruleId: l.ruleId, qty: l.qty })), received_by: 'Google Sheet (taken as delivered next morning)',
            received_at: deliveredAt(d, s?.lead_days ?? 1, s?.no_delivery_days ?? []),
          }),
          location_id: LOCATION,
        }, { onConflict: 'id' });
        if (error) errors.push(`Orders: ${error.message}`);
        else ordersSaved++;
      }
    }
  }

  // Deliveries confirmed by staff, and things that arrived without an order
  let deliveriesSaved = 0;
  const deliveries: Delivery[] = ('deliveries' in body && Array.isArray((body as any).deliveries)) ? (body as any).deliveries : [];
  if (deliveries.length) {
    const [{ data: rules }, { data: sups }] = await Promise.all([
      db.from('rules').select('id, supplier_id, order_item, order_unit, pack_size, price'),
      db.from('suppliers').select('id, name'),
    ]);
    const supplierId = (name: string) => (sups ?? []).find((s: any) => norm(s.name) === norm(name))?.id ?? null;
    for (const dv of deliveries) {
      const at = dv.at && !Number.isNaN(Date.parse(dv.at)) ? new Date(dv.at).toISOString() : new Date().toISOString();
      const day = date(dv.business_date);
      if (!day) continue;
      if (dv.kind === 'order') {
        const sid = supplierId(dv.supplier);
        const orderDate = date(dv.order_date);
        if (!sid || !orderDate) { unknownOrders.add(dv.supplier); continue; }
        const lines: any[] = [], received: any[] = [];
        for (const it of dv.items ?? []) {
          const rule = (rules ?? []).find((r: any) => norm(r.order_item) === norm(it.order_item) && r.supplier_id === sid)
            ?? (rules ?? []).find((r: any) => norm(r.order_item) === norm(it.order_item));
          if (!rule) { unknownOrders.add(String(it.order_item)); continue; }
          lines.push({ ruleId: rule.id, name: rule.order_item, qty: num(it.ordered) ?? num(it.qty) ?? 0, unit: rule.order_unit, price: rule.price === null ? null : Number(rule.price) });
          received.push({ ruleId: rule.id, qty: num(it.qty) ?? 0 });
        }
        const { error } = await db.from('orders').upsert({
          id: await stableId(`sheet-order|${orderDate}|${sid}`), business_date: orderDate, supplier_id: sid, lines, message: 'From the Google Sheet',
          sent_by: 'Google Sheet', sent_at: new Date(Date.parse(orderDate + 'T17:00:00+04:00')).toISOString(),
          received, received_at: at, received_by: `${dv.by || 'Staff'} (confirmed)`, location_id: LOCATION,
        }, { onConflict: 'id' });
        if (error) errors.push(`Deliveries: ${error.message}`);
        else deliveriesSaved++;
      } else {
        // Bought from a shop, or extra from a supplier: amounts are in counting units of each item
        let sid = dv.kind === 'supplier' ? supplierId(dv.supplier) : null;
        if (!sid) {
          sid = 'sup-shop';
          await db.from('suppliers').upsert({ id: 'sup-shop', name: 'Bought from a shop', how: 'Shop', cutoff: '', delivery: '', lead_days: 0, no_delivery_days: [],
            open_text: '', weekly: false, uses_lpo: false, sort: 999 }, { onConflict: 'id', ignoreDuplicates: true });
        }
        const received: any[] = [], lines: any[] = [];
        for (const it of dv.items ?? []) {
          const item = byName.get(norm(it.count_item));
          if (!item) { unknown.add(String(it.count_item)); continue; }
          received.push({ itemId: item.id, ruleId: '', qty: num(it.count_qty) ?? 0 });
          lines.push({ ruleId: '', name: item.name, qty: num(it.count_qty) ?? 0, unit: '', price: null });
        }
        const label = dv.kind === 'shop' ? 'Bought from a shop' : `Extra from ${dv.supplier}`;
        const message = [label, dv.paid !== null && dv.paid !== undefined ? `AED ${dv.paid}` : '', dv.why, dv.note].filter((x) => x && String(x).trim()).join(' · ');
        const { error } = await db.from('orders').upsert({
          id: await stableId(`sheet-extra|${dv.id}`), business_date: day, supplier_id: sid, lines, message, sent_by: dv.by || 'Staff', sent_at: at,
          received, received_at: at, received_by: `${dv.by || 'Staff'} (not ordered)`, location_id: LOCATION,
        }, { onConflict: 'id' });
        if (error) errors.push(`Deliveries: ${error.message}`);
        else deliveriesSaved++;
      }
    }
  }

  const parts = [`${saved} counts saved or changed`];
  if (deliveriesSaved) parts.push(`${deliveriesSaved} deliveries`);
  if (ordersSaved) parts.push(`${ordersSaved} supplier orders`);
  if (unknownOrders.size) parts.push(`order items not matched: ${[...unknownOrders].join(', ')}`);
  if (wasteSaved) parts.push(`${wasteSaved} thrown away`);
  if (unknown.size) parts.push(`names not matched: ${[...unknown].join(', ')}`);
  if (errors.length) parts.push(errors.join('; '));
  const ok = errors.length === 0;
  await db.from('sync_runs').insert({
    location_id: LOCATION, kind: 'sheet', finished_at: new Date().toISOString(), receipts: 0, ok, message: parts.join(' · '),
    details: { unknown: [...unknown], errors },
  });
  return Response.json({ ok, saved, waste: wasteSaved, orders: ordersSaved, deliveries: deliveriesSaved, unknown: [...unknown], unknownOrders: [...unknownOrders], errors }, { status: ok ? 200 : 207 });
});
