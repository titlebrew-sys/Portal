import { describe, expect, it } from 'vitest';
import type { AppData, SheetOrders, SheetOrderRow, SheetSupplierOrder } from '../types';
import { ageText, copyAgeMinutes, itemsToOrder, sheetDue, sheetNothing, sheetSent } from './sheetOrders';

const row = (item: string, final: number, over: Partial<SheetOrderRow> = {}): SheetOrderRow => ({
  item, count: '199', unit: 'g', suggested: String(final), change: '', final, orderUnit: 'bag of 500g', notes: '', coming: 0, ...over,
});
const sup = (name: string, rows: SheetOrderRow[], done = ''): SheetSupplierOrder => ({
  name, how: 'WhatsApp group', status: '', done, message: 'Hello', rows, toOrder: rows.some((r) => r.final > 0),
});
const data = (m: Partial<SheetOrders> | null): AppData =>
  ({ sheetOrders: m ? { updatedAt: '2026-11-10T10:00:00Z', countDate: '', delivery: '', note: '', notCounted: '', saturday: false, suppliers: [], ...m } : null }) as unknown as AppData;

describe('Orders page copies the sheet', () => {
  const matcha = sup('Matcha', [row('Matcha', 0)]);
  const almarai = sup('Almarai', [row('Full Fat Milk 2L', 6), row('Low Fat Milk 2L', 0)]);
  const bakery = sup('The Bakery', [row('Brownie', 9)], 'Draft saved by Rhobel at 5:10pm');

  it('matcha is suggested only when the sheet says so', () => {
    expect(sheetDue(data({ suppliers: [matcha, almarai] })).map((s) => s.name)).toEqual(['Almarai']);
    const needs = sup('Matcha', [row('Matcha', 1)]);
    expect(sheetDue(data({ suppliers: [needs, almarai] })).map((s) => s.name)).toEqual(['Matcha', 'Almarai']);
  });
  it('splits suppliers into to send, sent and nothing to order', () => {
    const d = data({ suppliers: [matcha, almarai, bakery] });
    expect(sheetDue(d).map((s) => s.name)).toEqual(['Almarai']);
    expect(sheetSent(d).map((s) => s.name)).toEqual(['The Bakery']);
    expect(sheetNothing(d).map((s) => s.name)).toEqual(['Matcha']);
  });
  it('lists only the items the sheet orders', () => {
    expect(itemsToOrder(almarai).map((r) => r.item)).toEqual(['Full Fat Milk 2L']);
  });
  it('shows nothing before the sheet has sent a copy, and nothing on Saturday', () => {
    expect(sheetDue(data(null))).toEqual([]);
    expect(sheetDue(data({ saturday: true, suppliers: [almarai] }))).toEqual([]);
    expect(sheetSent(data({ saturday: true, suppliers: [bakery] }))).toEqual([]);
  });
  it('says how old the copy is in plain words', () => {
    const now = Date.parse('2026-11-10T10:00:00Z');
    expect(copyAgeMinutes('2026-11-10T09:57:00Z', now)).toBe(3);
    expect(ageText(0)).toBe('just now');
    expect(ageText(1)).toBe('1 minute ago');
    expect(ageText(12)).toBe('12 minutes ago');
    expect(ageText(120)).toBe('2 hours ago');
    expect(ageText(3000)).toBe('2 days ago');
  });
});
