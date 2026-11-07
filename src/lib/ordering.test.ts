import { describe, expect, it } from 'vitest';
import { demoData } from '../data/seed';
import { coverDays, deliveryDate, plan } from './ordering';
import { orderMessage } from './messages';
import { businessDate, isShift1Locked } from './time';

// 5 Nov 2026 is a Thursday: the day the prototype data was taken.
const DAY = '2026-11-05';

function suggested(supplier: string) {
  const p = plan(demoData(DAY), DAY).find((x) => x.supplier.name === supplier)!;
  return Object.fromEntries(p.lines.filter((l) => l.qty > 0).map((l) => [l.rule.orderItem, l.qty]));
}

describe('order suggestions match the prototype', () => {
  it('Almarai (TARGET, learned/estimated use)', () => {
    expect(suggested('Almarai')).toEqual({ 'Full Fat Milk 2L': 6, 'Low Fat Milk 2L': 1 });
  });
  it('The Bakery (TARGET, fixed targets)', () => {
    expect(suggested('The Bakery')).toEqual({
      'Avocado Chicken Sandwich': 2,
      'Turkey Cheese Croissant': 2,
      'Halloumi Fajita Wrap': 1,
      'Chicken Caesar Wrap': 1,
      'Falafel Sandwich': 2,
      'Chicken Power Wrap': 1,
      'Exotic Soy Pudding': 2,
      'Banana Walnut Oats': 3,
    });
  });
  it("L's Boutique Bakery (FIXED)", () => {
    expect(suggested("L's Boutique Bakery")).toEqual({ Brownie: 9, 'Nutella Cookie': 5, 'Cinnamon Roll Frozen': 20 });
  });
  it('Emirates Snack Food (TOPUP)', () => {
    expect(suggested('Emirates Snack Food')).toEqual({ 'Soy Milk': 1 });
  });
  it('suppliers with nothing to order', () => {
    for (const s of ['SAFCO', 'Tealand', 'Classic Fine Foods', 'Global Beverages', 'Matcha', 'Khotot Al Emdad', 'New Country Home'])
      expect(suggested(s)).toEqual({});
  });
  it('weekly suppliers wait for the weekly count', () => {
    const p = plan(demoData(DAY), DAY).find((x) => x.supplier.name === 'Hotpack')!;
    expect(p.lines.every((l) => l.missing)).toBe(true);
  });
});

describe('delivery days', () => {
  const almarai = demoData(DAY).suppliers.find((s) => s.name === 'Almarai')!;
  it('Thursday order arrives Friday, covers 2 days', () => {
    expect(deliveryDate(almarai, DAY)).toBe('2026-11-06');
    expect(coverDays(almarai, DAY, 1)).toBe(2);
  });
  it('Saturday order skips Sunday and covers 3 days', () => {
    expect(deliveryDate(almarai, '2026-11-07')).toBe('2026-11-09');
    expect(coverDays(almarai, '2026-11-07', 1)).toBe(3);
  });
});

describe('messages', () => {
  it('WhatsApp message uses opening and closing lines', () => {
    const data = demoData(DAY);
    const p = plan(data, DAY).find((x) => x.supplier.name === 'Almarai')!;
    const lines = p.lines.filter((l) => l.qty > 0).map((l) => ({ ruleId: l.rule.id, name: l.rule.orderItem, qty: l.qty, unit: l.rule.orderUnit, price: l.rule.price }));
    expect(orderMessage(p.supplier, lines, p.deliveryDate)).toBe(
      'Hello\nFor tomorrow I need\n6 pcs Full Fat Milk 2L\n1 pcs Low Fat Milk 2L\nChange for 200aed please\nThank you',
    );
  });
  it('The Bakery email names the delivery time, 10am on Saturday', () => {
    const bakery = demoData(DAY).suppliers.find((s) => s.name === 'The Bakery')!;
    const line = [{ ruleId: 'x', name: 'x', qty: 1, unit: 'pcs', price: 1 }];
    expect(orderMessage(bakery, line, '2026-11-06')).toBe('Hello\nPFA order for 7.30am delivery\nThank you');
    expect(orderMessage(bakery, line, '2026-11-07')).toBe('Hello\nPFA order for 10am delivery\nThank you');
  });
});

describe('Dubai clock', () => {
  it('new day starts at 4am Dubai', () => {
    expect(businessDate(new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-05'); // 3:30am Dubai on 6 Nov
    expect(businessDate(new Date('2026-11-06T00:05:00Z'))).toBe('2026-11-06'); // 4:05am Dubai
  });
  it('Shift 1 locks at 5pm Dubai', () => {
    expect(isShift1Locked('2026-11-05', new Date('2026-11-05T12:59:00Z'))).toBe(false); // 4:59pm
    expect(isShift1Locked('2026-11-05', new Date('2026-11-05T13:00:00Z'))).toBe(true); // 5:00pm
    expect(isShift1Locked('2026-11-05', new Date('2026-11-05T22:00:00Z'))).toBe(true); // 2am next night
  });
});

describe('Title Brew order days', () => {
  const data = demoData(DAY);
  const lsb = data.suppliers.find((s) => s.name === "L's Boutique Bakery")!;
  const tealand = data.suppliers.find((s) => s.name === 'Tealand')!;
  it('no supplier delivers on Sunday', () => {
    expect(deliveryDate(lsb, '2026-11-07')).toBe('2026-11-09'); // Saturday -> Monday, even with no Sunday rule
    expect(deliveryDate(tealand, '2026-11-06')).toBe('2026-11-09'); // Friday + 2 days lands on Sunday -> Monday
  });
  it('Friday orders arrive Saturday, Sunday orders arrive Monday', () => {
    expect(deliveryDate(lsb, '2026-11-06')).toBe('2026-11-07');
    expect(deliveryDate(lsb, '2026-11-08')).toBe('2026-11-09');
  });
  it('nothing is ordered on Saturday', async () => {
    const { dueToday } = await import('./derive');
    expect(dueToday(demoData('2026-11-07'), '2026-11-07')).toEqual([]);
    expect(dueToday(demoData('2026-11-08'), '2026-11-08').length).toBeGreaterThan(0);
  });
});
