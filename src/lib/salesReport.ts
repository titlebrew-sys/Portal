import type { Receipt, SalesReport } from '../types';
import { dubaiClock } from './time';

/** Same report as the database's sales_report, worked out from receipts (used in demo mode and tests). */
export function salesFromReceipts(receipts: Receipt[]): SalesReport {
  const day = new Map<string, { sales: number; receipts: number }>();
  const hour = new Map<number, { sales: number; receipts: number }>();
  const item = new Map<string, { qty: number; sales: number }>();
  const mod = new Map<string, { group: string; option: string; qty: number; sales: number }>();
  let sales = 0, count = 0, items = 0;
  for (const r of receipts) {
    if (r.cancelled) continue;
    const sgn = r.type === 'REFUND' ? -1 : 1;
    const total = r.total ?? r.lines.reduce((a, l) => a + (l.total ?? 0), 0);
    sales += sgn * total;
    if (sgn > 0) count++;
    const d = day.get(r.businessDate) ?? { sales: 0, receipts: 0 };
    d.sales += sgn * total; if (sgn > 0) d.receipts++; day.set(r.businessDate, d);
    const h = dubaiClock(new Date(r.at)).hour;
    const hh = hour.get(h) ?? { sales: 0, receipts: 0 };
    hh.sales += sgn * total; if (sgn > 0) hh.receipts++; hour.set(h, hh);
    for (const l of r.lines) {
      items += sgn * l.qty;
      const it = item.get(l.itemName) ?? { qty: 0, sales: 0 };
      it.qty += sgn * l.qty; it.sales += sgn * (l.total ?? 0); item.set(l.itemName, it);
      for (const m of l.modifiers) {
        const k = m.group + '|' + m.option;
        const mm = mod.get(k) ?? { group: m.group, option: m.option, qty: 0, sales: 0 };
        mm.qty += sgn * l.qty; mod.set(k, mm);
      }
    }
  }
  return {
    totals: { receipts: count, sales, items },
    byDay: [...day].map(([date, v]) => ({ date, ...v })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    byHour: [...hour].map(([h, v]) => ({ hour: h, ...v })).sort((a, b) => a.hour - b.hour),
    byItem: [...item].map(([i, v]) => ({ item: i, ...v })).sort((a, b) => b.sales - a.sales),
    byModifier: [...mod.values()].sort((a, b) => b.qty - a.qty),
  };
}
