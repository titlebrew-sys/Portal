/**
 * Expected stock and differences, in plain words:
 *   Expected stock = last count + arrived - used by sales - thrown away
 *   Difference     = counted - expected
 * For each count (Shift 1, Shift 2 or weekly) the window is the time between the previous
 * count and this one, using receipt times, delivery times and waste times.
 */
import type { CountItem, CountRow, Ingredient, Order, Rule, Shift, Supplier, WasteRow } from '../types';
import { parseCountFrom } from './ordering';
import { ROAST_RISE_G, isBeanStock, norm } from './catalog';
import type { LineUsage } from './usage';

export interface Snapshot {
  at: string;
  businessDate: string;
  shift: Shift;
  value: number;
  countedBy: string;
  parts: { itemId: string; name: string; qty: number; factor: number }[];
}

export interface Arrival {
  at: string;
  qty: number;
  supplier: string;
  orderId: string;
  /** "roast": not a delivery. A bean count went up a lot, so a new roast is assumed (nobody enters roasts). */
  kind?: 'roast';
}
export interface WasteBit { at: string; qty: number; item: string; reason: string }
export interface UseBit { at: string; qty: number; receipt: string; item: string; choices: string; why: string; refund: boolean }

export interface Step {
  from: Snapshot;
  to: Snapshot;
  arrived: Arrival[];
  used: UseBit[];
  waste: WasteBit[];
  arrivedTotal: number;
  usedTotal: number;
  wasteTotal: number;
  expected: number;
  counted: number;
  difference: number;
  /** Difference as a percent of expected (null when expected is 0). */
  pct: number | null;
  over: boolean;
}

export interface StockInputs {
  items: CountItem[];
  counts: CountRow[];
  orders: Order[];
  rules: Rule[];
  suppliers: Supplier[];
  waste: WasteRow[];
  usage: LineUsage[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Waste rows only have a date: without a time they count as thrown away at 9pm Dubai. */
export const wasteTime = (w: WasteRow) => w.createdAt ?? `${w.date}T17:00:00.000Z`;

export const hasCount = (ing: Ingredient) => parseCountFrom(ing.countFrom).length > 0;

/** Count snapshots for an ingredient, oldest first. Every count item in its formula must be counted. */
export function snapshots(ing: Ingredient, inp: StockInputs): Snapshot[] {
  const terms = parseCountFrom(ing.countFrom);
  if (!terms.length) return [];
  const names = new Map(inp.items.map((i) => [i.id, i.name]));
  const groups = new Map<string, CountRow[]>();
  for (const c of inp.counts) {
    if (!terms.some((t) => t.id === c.itemId) || c.qty === null) continue;
    const k = `${c.businessDate}|${c.shift}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const out: Snapshot[] = [];
  for (const rows of groups.values()) {
    const parts = terms.map((t) => {
      const r = rows.find((x) => x.itemId === t.id);
      return r ? { itemId: t.id, name: names.get(t.id) ?? t.id, qty: r.qty as number, factor: t.w } : null;
    });
    if (parts.some((p) => !p)) continue;
    const ps = parts as Snapshot['parts'];
    const latest = rows.reduce((a, r) => (r.savedAt > a.savedAt ? r : a), rows[0]);
    out.push({
      at: latest.savedAt, businessDate: latest.businessDate, shift: latest.shift, countedBy: latest.countedBy,
      value: r3(ps.reduce((a, p) => a + p.qty * p.factor, 0)), parts: ps,
    });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1));
}

const inWindow = (t: string, from: string, to: string) => t > from && t <= to;

/** Deliveries confirmed as arrived, turned into this ingredient's unit. */
export function arrivals(ing: Ingredient, inp: StockInputs, from: string, to: string): Arrival[] {
  const terms = parseCountFrom(ing.countFrom);
  const out: Arrival[] = [];
  for (const o of inp.orders) {
    if (!o.receivedAt || !o.received || !inWindow(o.receivedAt, from, to)) continue;
    for (const l of o.received) {
      // Not ordered (bought from a shop, extra from a supplier): amount already in counting units
      if (l.itemId) {
        const t = terms.find((x) => x.id === l.itemId);
        if (t && l.qty) out.push({ at: o.receivedAt, qty: r3(l.qty * t.w), supplier: inp.suppliers.find((s) => s.id === o.supplierId)?.name ?? '', orderId: o.id });
        continue;
      }
      const rule = inp.rules.find((r) => r.id === l.ruleId);
      const first = rule ? parseCountFrom(rule.countFrom)[0] : undefined;
      const t = first && terms.find((x) => x.id === first.id);
      if (!rule || !t || !l.qty) continue;
      out.push({ at: o.receivedAt, qty: r3(l.qty * rule.packSize * t.w), supplier: inp.suppliers.find((s) => s.id === o.supplierId)?.name ?? '', orderId: o.id });
    }
  }
  return out;
}

export function wasteFor(ing: Ingredient, inp: StockInputs, from: string, to: string): WasteBit[] {
  const terms = parseCountFrom(ing.countFrom);
  const byName = new Map(inp.items.map((i) => [norm(i.name), i.id]));
  const out: WasteBit[] = [];
  for (const w of inp.waste) {
    const t = terms.find((x) => x.id === byName.get(norm(w.item)));
    const at = wasteTime(w);
    if (t && inWindow(at, from, to)) out.push({ at, qty: r3(w.qty * t.w), item: w.item, reason: w.reason });
  }
  return out;
}

/** Sales use grouped by ingredient, worked out once per set of sales. */
const indexCache = new WeakMap<LineUsage[], Map<string, UseBit[]>>();
function useIndex(usage: LineUsage[]): Map<string, UseBit[]> {
  let idx = indexCache.get(usage);
  if (!idx) {
    idx = new Map();
    for (const row of usage)
      for (const u of row.uses) {
        const list = idx.get(u.ingredientId) ?? [];
        list.push({ at: row.at, qty: u.qty, receipt: row.receipt, item: row.item, choices: row.choices, why: u.why, refund: row.refund });
        idx.set(u.ingredientId, list);
      }
    indexCache.set(usage, idx);
  }
  return idx;
}

export function usedFor(ing: Ingredient, inp: StockInputs, from: string, to: string): UseBit[] {
  return (useIndex(inp.usage).get(ing.id) ?? []).filter((u) => inWindow(u.at, from, to));
}

const sum = (xs: { qty: number }[]) => r3(xs.reduce((a, x) => a + x.qty, 0));

/** How much more sales used than was counted, when the expected amount is below zero (otherwise 0). */
export const soldMoreThanCounted = (expected: number | null): number => (expected !== null && expected < 0 ? r3(-expected) : 0);

export function isOver(ing: Ingredient, difference: number, expected: number, counted: number): boolean {
  if (ing.unit === 'pcs' || ing.limitPct <= 0) return Math.abs(difference) > 0.01;
  return Math.abs(difference) > (ing.limitPct / 100) * Math.max(Math.abs(expected), Math.abs(counted), 1);
}

/** Every count compared with what was expected since the count before it. */
export function steps(ing: Ingredient, inp: StockInputs): Step[] {
  const snaps = snapshots(ing, inp);
  const out: Step[] = [];
  for (let i = 1; i < snaps.length; i++) {
    const from = snaps[i - 1];
    const to = snaps[i];
    let arrived = arrivals(ing, inp, from.at, to.at);
    const used = usedFor(ing, inp, from.at, to.at);
    const waste = wasteFor(ing, inp, from.at, to.at);
    let expected = r3(from.value + sum(arrived) - sum(used) - sum(waste));
    let difference = r3(to.value - expected);
    // Roasting: nobody enters it. A bean count that rises by more than 4 kg since the last count is a new roast
    // added to stock; what the count shows above the expected amount is the roast. Smaller rises stay differences.
    if (isBeanStock(ing.id) && to.value - from.value > ROAST_RISE_G && difference > 0) {
      arrived = [...arrived, { at: to.at, qty: difference, supplier: 'Roast', orderId: '', kind: 'roast' }];
      expected = r3(expected + difference);
      difference = 0;
    }
    out.push({
      from, to, arrived, used, waste, arrivedTotal: sum(arrived), usedTotal: sum(used), wasteTotal: sum(waste), expected, counted: to.value,
      difference, pct: expected ? Math.round((difference / expected) * 1000) / 10 : null, over: isOver(ing, difference, expected, to.value),
    });
  }
  return out;
}

export interface Level {
  last: Snapshot | null;
  arrivedTotal: number;
  usedTotal: number;
  wasteTotal: number;
  /** Last count + arrived - used - thrown away, up to now. */
  expectedNow: number | null;
  lastStep: Step | null;
}

export function currentLevel(ing: Ingredient, inp: StockInputs, now = new Date().toISOString()): Level {
  const snaps = snapshots(ing, inp);
  const last = snaps[snaps.length - 1] ?? null;
  const all = steps(ing, inp);
  const lastStep = all[all.length - 1] ?? null;
  if (!last) return { last, arrivedTotal: 0, usedTotal: 0, wasteTotal: 0, expectedNow: null, lastStep };
  const a = sum(arrivals(ing, inp, last.at, now));
  const u = sum(usedFor(ing, inp, last.at, now));
  const w = sum(wasteFor(ing, inp, last.at, now));
  return { last, arrivedTotal: a, usedTotal: u, wasteTotal: w, expectedNow: r3(last.value + a - u - w), lastStep };
}
