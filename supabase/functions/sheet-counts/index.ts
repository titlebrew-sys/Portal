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

  const parts = [`${saved} counts saved or changed`];
  if (wasteSaved) parts.push(`${wasteSaved} thrown away`);
  if (unknown.size) parts.push(`names not matched: ${[...unknown].join(', ')}`);
  if (errors.length) parts.push(errors.join('; '));
  const ok = errors.length === 0;
  await db.from('sync_runs').insert({
    location_id: LOCATION, kind: 'sheet', finished_at: new Date().toISOString(), receipts: 0, ok, message: parts.join(' · '),
    details: { unknown: [...unknown], errors },
  });
  return Response.json({ ok, saved, waste: wasteSaved, unknown: [...unknown], errors }, { status: ok ? 200 : 207 });
});
