import { describe, expect, it } from 'vitest';
import type { Order } from '../types';
import { toView } from './Deliveries';

const base: Order = { id: 'o', businessDate: '2026-11-08', supplierId: 'sup-the-bakery', lines: [], message: 'From the Google Sheet', lpoNumber: null,
  sentBy: 'Google Sheet', sentAt: '2026-11-08T13:00:00Z', receivedAt: null, receivedBy: null, received: null };
const line = { ruleId: 'rule-turkey', name: 'Turkey Cheese Croissant', qty: 2, unit: 'pcs', price: 12.2 };

describe('Deliveries page', () => {
  it('confirmed by staff, with what actually came', () => {
    const v = toView({ ...base, lines: [line], received: [{ ruleId: 'rule-turkey', qty: 1 }], receivedAt: '2026-11-09T03:42:00Z', receivedBy: 'Arsen (confirmed)' }, 'The Bakery');
    expect([v.kind, v.by, v.day, v.lines]).toEqual(['confirmed', 'Arsen', '2026-11-09', [{ name: 'Turkey Cheese Croissant', ordered: 2, arrived: 1 }]]);
  });
  it('nobody confirmed: assumed from the order', () => {
    const v = toView({ ...base, lines: [line], received: [{ ruleId: 'rule-turkey', qty: 2 }], receivedAt: '2026-11-09T04:00:00Z', receivedBy: 'Google Sheet (taken as delivered next morning)' }, 'The Bakery');
    expect(v.kind).toBe('assumed');
  });
  it('bought from a shop: price and reason', () => {
    const v = toView({ ...base, supplierId: 'sup-shop', lines: [{ ruleId: '', name: 'Full fat milk', qty: 6, unit: '', price: null }],
      message: 'Bought from a shop · AED 48 · Ran out · for the weekend', receivedAt: '2026-11-09T07:20:00Z', receivedBy: 'Rhobel (not ordered)' }, 'Bought from a shop');
    expect([v.kind, v.paid, v.why, v.by, v.supplier]).toEqual(['shop', 48, 'Ran out · for the weekend', 'Rhobel', 'Bought from a shop']);
  });
});
