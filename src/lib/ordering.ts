/**
 * Order suggestions. This is the same logic as the order spreadsheet:
 *
 * TARGET  Tops up to a target every day. The target is either a fixed number
 *         (e.g. 2 sandwiches) or daily use x days until the next-but-one delivery.
 *         Daily use is learned from the counts once there are 3+ days of data,
 *         otherwise your own estimate is used.
 * TOPUP   When stock is at or below the minimum, order back up to the maximum.
 * FIXED   When stock is at or below the minimum, order a set quantity.
 * TRACK   Counted only. Never ordered.
 *
 * Daily suppliers read today's Shift 1 count. Weekly suppliers (packaging)
 * read the latest count from the last 7 days.
 */
import type { AppData, CountItem, CountRow, Order, Rule, Supplier } from '../types';
import { addDays, businessDate, daysBetween, weekdayOf } from './time';

export const MIN_LEARN_DAYS = 3;
export const LEARN_WINDOW_DAYS = 14;

export interface Suggestion {
  rule: Rule;
  have: number | null;
  /** Suggested quantity in order units. */
  qty: number;
  note: string;
  missing: boolean;
}

export interface SupplierPlan {
  supplier: Supplier;
  deliveryDate: string;
  lines: Suggestion[];
}

const round = (v: number, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;
export const fmtNum = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? '' : (Math.round(v * 100) / 100).toLocaleString('en-US');

/** "a + 1.5*b" -> [{id:'a',w:1},{id:'b',w:1.5}] */
export function parseCountFrom(expr: string): { id: string; w: number }[] {
  return expr
    .split('+')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = t.match(/^([0-9.]+)\s*\*\s*(.+)$/);
      return m ? { id: m[2].trim(), w: Number(m[1]) } : { id: t, w: 1 };
    });
}

/** First delivery date for an order placed on orderDate. */
export function deliveryDate(s: Supplier, orderDate: string): string {
  let d = addDays(orderDate, Math.max(1, s.leadDays));
  for (let i = 0; i < 7 && s.noDeliveryDays.includes(weekdayOf(d)); i++) d = addDays(d, 1);
  return d;
}

/** The delivery after that: what tomorrow's order would bring. */
export function followingDelivery(s: Supplier, orderDate: string): string {
  const first = deliveryDate(s, orderDate);
  for (let k = 1; k < 10; k++) {
    const d = deliveryDate(s, addDays(orderDate, k));
    if (d > first) return d;
  }
  return addDays(first, 1);
}

/** Days of stock a TARGET item needs, counted from today's Shift 1. */
export function coverDays(s: Supplier, orderDate: string, extraDays: number): number {
  return daysBetween(orderDate, followingDelivery(s, orderDate)) - 1 + extraDays;
}

type CountIndex = Map<string, CountRow[]>; // itemId -> rows, newest first

export function indexCounts(counts: CountRow[]): CountIndex {
  const idx: CountIndex = new Map();
  for (const c of counts) {
    if (!idx.has(c.itemId)) idx.set(c.itemId, []);
    idx.get(c.itemId)!.push(c);
  }
  for (const rows of idx.values())
    rows.sort((a, b) => (a.businessDate === b.businessDate ? b.shift - a.shift : a.businessDate < b.businessDate ? 1 : -1));
  return idx;
}

function s1On(idx: CountIndex, itemId: string, date: string): number | null {
  const r = idx.get(itemId)?.find((c) => c.businessDate === date && c.shift === 1);
  return r && r.qty !== null ? r.qty : null;
}

function latestWithin(idx: CountIndex, itemId: string, date: string, days: number): number | null {
  const from = addDays(date, -days + 1);
  const r = idx.get(itemId)?.find((c) => c.businessDate <= date && c.businessDate >= from && c.qty !== null);
  return r ? r.qty : null;
}

/** Stock on hand in count units for a rule, or null when something was not counted. */
export function haveFor(rule: Rule, idx: CountIndex, date: string, weekly: boolean): number | null {
  let total = 0;
  for (const t of parseCountFrom(rule.countFrom)) {
    const v = weekly ? latestWithin(idx, t.id, date, 7) : s1On(idx, t.id, date);
    if (v === null) return null;
    total += v * t.w;
  }
  return round(total, 2);
}

/** Received quantity in count units, by business date the delivery was booked. */
function receivedByDate(rule: Rule, orders: Order[], receivedDate: (o: Order) => string | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of orders) {
    const d = receivedDate(o);
    if (!d || !o.received) continue;
    const line = o.received.find((l) => l.ruleId === rule.id);
    if (line) m.set(d, (m.get(d) || 0) + line.qty * rule.packSize);
  }
  return m;
}

/**
 * Learned daily use: yesterday's Shift 1 + what arrived - today's Shift 1,
 * averaged over the last 14 days that have both counts.
 */
export function learnedUse(
  rule: Rule,
  idx: CountIndex,
  orders: Order[],
  date: string,
  receivedDate: (o: Order) => string | null,
): { perDay: number | null; days: number } {
  const recv = receivedByDate(rule, orders, receivedDate);
  const uses: number[] = [];
  for (let k = 0; k < LEARN_WINDOW_DAYS; k++) {
    const d = addDays(date, -k);
    const prev = addDays(d, -1);
    const a = haveFor(rule, idx, prev, false);
    const b = haveFor(rule, idx, d, false);
    if (a === null || b === null) continue;
    const use = a + (recv.get(d) || 0) - b;
    if (use >= 0) uses.push(use);
  }
  if (!uses.length) return { perDay: null, days: 0 };
  return { perDay: round(uses.reduce((x, y) => x + y, 0) / uses.length, 1), days: uses.length };
}

export function suggest(
  rule: Rule,
  supplier: Supplier,
  have: number | null,
  date: string,
  learned: { perDay: number | null; days: number },
  unit = '',
): Suggestion {
  const base = { rule, have };
  if (rule.rule === 'TRACK') return { ...base, qty: 0, note: 'Track only, never ordered.', missing: false };
  if (have === null)
    return { ...base, qty: 0, missing: true, note: supplier.weekly ? 'Needs this week’s count.' : 'Not counted in Shift 1 yet.' };
  const pack = rule.packSize > 0 ? rule.packSize : 1;
  const packs = (need: number) => Math.max(0, Math.ceil(need / pack - 1e-9));

  if (rule.rule === 'TARGET') {
    const delivery = deliveryDate(supplier, date);
    const sat = weekdayOf(delivery) === 6;
    const fixed = sat && rule.satTarget !== null ? rule.satTarget : rule.fixedTarget;
    if (fixed !== null) {
      const why = sat && rule.satTarget !== null ? `Saturday target ${fixed}` : `Fixed target ${fixed}`;
      return { ...base, qty: packs(fixed - have), missing: false, note: `${why}${learned.days < MIN_LEARN_DAYS ? ' (no usage data yet)' : ''}.` };
    }
    const useLearned = learned.perDay !== null && learned.days >= MIN_LEARN_DAYS;
    const perDay = useLearned ? learned.perDay! : rule.estDailyUse ?? 0;
    const days = coverDays(supplier, date, rule.extraDays);
    const need = round(perDay * days, 1);
    return {
      ...base,
      qty: packs(need - have),
      missing: false,
      note: `Uses about ${fmtNum(perDay)} ${unit}/day (${useLearned ? `learned from ${learned.days} days` : 'your estimate'}). Needs ${fmtNum(need)} ${unit} to last until the next delivery.`,
    };
  }
  const min = rule.minLevel ?? 0;
  if (rule.rule === 'TOPUP') {
    if (have > min) return { ...base, qty: 0, missing: false, note: `Above minimum ${fmtNum(min)}.` };
    const max = rule.maxLevel ?? min;
    return { ...base, qty: packs(max - have), missing: false, note: `At or below minimum ${fmtNum(min)}, topping up to ${fmtNum(max)}.` };
  }
  // FIXED
  if (have > min) return { ...base, qty: 0, missing: false, note: `Above minimum ${fmtNum(min)}.` };
  return { ...base, qty: rule.fixedQty ?? 0, missing: false, note: `At or below minimum ${fmtNum(min)}, ordering the set ${fmtNum(rule.fixedQty)}.` };
}


export function plan(data: AppData, date: string): SupplierPlan[] {
  const idx = indexCounts(data.counts);
  const byId = new Map<string, CountItem>(data.items.map((i) => [i.id, i]));
  const recvDate = (o: Order) => (o.receivedAt ? businessDate(new Date(o.receivedAt)) : null);
  return data.suppliers
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .map((supplier) => {
      const rules = data.rules.filter((r) => r.active && r.supplierId === supplier.id).sort((a, b) => a.sort - b.sort);
      const lines = rules.map((r) => {
        const have = haveFor(r, idx, date, supplier.weekly);
        const learned = r.rule === 'TARGET' ? learnedUse(r, idx, data.orders, date, recvDate) : { perDay: null, days: 0 };
        const unit = byId.get(parseCountFrom(r.countFrom)[0]?.id ?? '')?.unit ?? '';
        return suggest(r, supplier, have, date, learned, unit);
      });
      return { supplier, deliveryDate: deliveryDate(supplier, date), lines };
    });
}
