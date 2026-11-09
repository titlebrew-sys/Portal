import type { AppData, Area, CountItem, CountRow, Shift } from '../types';
import { addDays } from './time';
import { noOrdersOn, plan, type SupplierPlan } from './ordering';

export function countOf(data: AppData, date: string, shift: Shift, itemId: string): CountRow | undefined {
  return data.counts.find((c) => c.businessDate === date && c.shift === shift && c.itemId === itemId);
}

export function sessionOf(data: AppData, date: string, shift: Shift, area: Area) {
  return data.sessions.find((s) => s.businessDate === date && s.shift === shift && s.area === area);
}

export function lastWeekly(data: AppData, today: string) {
  const from = addDays(today, -6);
  return data.sessions
    .filter((s) => s.area === 'Weekly' && s.businessDate >= from && s.businessDate <= today)
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))[0];
}

export const activeItems = (data: AppData, area: Area): CountItem[] =>
  data.items.filter((i) => i.active && i.area === area).sort((a, b) => a.sort - b.sort);

/** Kitchen items whose old batch (still in stock) expires today or earlier. */
export function expiring(data: AppData, today: string) {
  return activeItems(data, 'Kitchen')
    .map((item) => ({ item, c: countOf(data, today, 1, item.id) }))
    .filter(({ c }) => c && c.expOld && c.expOld <= today && (c.oldQty ?? 0) > 0)
    .map(({ item, c }) => ({ item, exp: c!.expOld!, qty: c!.oldQty! }));
}

export function zeroStock(data: AppData, today: string) {
  return activeItems(data, 'Bar').filter((i) => countOf(data, today, 1, i.id)?.qty === 0);
}

/** Bar items that dropped by more than half since last night's closing count. */
export function dropped(data: AppData, today: string) {
  const y = addDays(today, -1);
  return activeItems(data, 'Bar')
    .map((i) => ({ item: i, now: countOf(data, today, 1, i.id)?.qty ?? null, was: countOf(data, y, 2, i.id)?.qty ?? null }))
    .filter((x): x is { item: CountItem; now: number; was: number } => x.now !== null && x.was !== null && x.was > 0 && x.now > 0 && x.now < x.was * 0.5)
    .map((x) => ({ ...x, pct: Math.round((1 - x.now / x.was) * 100) }));
}

/**
 * Suppliers with something suggested today by the Portal's own rules. No screen uses this any more:
 * orders come from the Google Sheet's Today's Orders (see sheetOrders.ts). Kept for its tests.
 */
export function dueToday(data: AppData, today: string): SupplierPlan[] {
  if (noOrdersOn(today)) return [];
  return plan(data, today).filter(
    (p) => p.lines.some((l) => l.qty > 0) && !data.orders.some((o) => o.businessDate === today && o.supplierId === p.supplier.id),
  );
}
