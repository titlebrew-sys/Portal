import { describe, expect, it } from 'vitest';
import type { CountRow, Ingredient, Order, Rule, WasteRow } from '../types';
import { seedItems } from '../data/seed';
import { currentLevel, isMissing, isOver, snapshots, soldMoreThanCounted, steps, type StockInputs } from './stock';
import type { LineUsage } from './usage';

const milk: Ingredient = { id: 'milk-full-fat', name: 'Full fat milk', unit: 'ml', countFrom: '1000*bar-full-fat-milk', limitPct: 5, note: null, active: true, sort: 0 };
const brazil: Ingredient = { id: 'bean-brazil', name: 'Brazil beans', unit: 'g', countFrom: 'bar-brazil-beans', limitPct: 5, note: null, active: true, sort: 0 };
const croissant: Ingredient = { id: 'kit-almond-croissant', name: 'Almond croissant', unit: 'pcs', countFrom: 'kit-almond-croissant', limitPct: 0, note: null, active: true, sort: 0 };
const condensed: Ingredient = { id: 'condensed-milk', name: 'Condensed milk', unit: 'g', countFrom: '397*bar-condensed-milk-unopened-cans + 595.5*bar-condensed-milk-bottles', limitPct: 5, note: null, active: true, sort: 0 };

const count = (itemId: string, date: string, shift: 1 | 2, qty: number, savedAt: string): CountRow => ({
  businessDate: date, shift, itemId, qty, oldQty: null, newQty: null, frozenQty: null, expOld: null, expNew: null, countedBy: 'Arsen', savedAt,
});
const use = (at: string, ingredientId: string, qty: number, receipt = 'R'): LineUsage => ({
  receipt, at, businessDate: at.slice(0, 10), lineIdx: 0, item: 'Latte', choices: '', qty: 1, refund: false, takeaway: false, noRecipe: false,
  uses: [{ ingredientId, qty, why: 'Latte' }],
});
const milkRule = { id: 'rule-milk', countFrom: 'bar-full-fat-milk', packSize: 2 } as Rule;
const delivery: Order = {
  id: 'o1', businessDate: '2026-11-05', supplierId: 'sup-almarai', lines: [], message: '', lpoNumber: null, sentBy: 'x', sentAt: '2026-11-05T12:00:00Z',
  receivedAt: '2026-11-06T04:00:00Z', receivedBy: 'x', received: [{ ruleId: 'rule-milk', qty: 6 }],
};

function inputs(p: Partial<StockInputs>): StockInputs {
  return { items: seedItems, counts: [], orders: [], rules: [milkRule], suppliers: [], waste: [], usage: [], ...p };
}

describe('Expected stock = last count + arrived - used by sales - thrown away', () => {
  const inp = inputs({
    counts: [
      count('bar-full-fat-milk', '2026-11-05', 2, 12.2, '2026-11-05T17:00:00Z'), // last night 12.2 L
      count('bar-full-fat-milk', '2026-11-06', 1, 18.0, '2026-11-06T12:00:00Z'), // today Shift 1: 18 L
    ],
    orders: [delivery], // 6 x 2 L arrived in the morning
    usage: [use('2026-11-06T05:00:00Z', 'milk-full-fat', 3000), use('2026-11-06T08:00:00Z', 'milk-full-fat', 3150), use('2026-11-06T13:00:00Z', 'milk-full-fat', 999)],
  });
  it('works out the expected amount and the difference for each count', () => {
    const [s] = steps(milk, inp);
    expect([s.from.value, s.arrivedTotal, s.usedTotal, s.wasteTotal]).toEqual([12200, 12000, 6150, 0]);
    expect(s.expected).toBe(18050);
    expect(s.counted).toBe(18000);
    expect(s.difference).toBe(-50); // -0.3%: inside the 5% limit
    expect(s.over).toBe(false);
    expect(s.used.map((u) => u.at)).not.toContain('2026-11-06T13:00:00Z'); // sold after the count: next window
  });
  it('current expected level adds everything since the last count', () => {
    expect(currentLevel(milk, inp, '2026-11-06T14:00:00Z').expectedNow).toBe(17001);
  });
});

describe('limits and waste', () => {
  it('pieces: any difference alerts; thrown away is taken off', () => {
    const waste: WasteRow[] = [{ id: 'w', date: '2026-11-06', item: 'Almond croissant', qty: 1, reason: 'Expired', loggedBy: 'x', createdAt: '2026-11-06T17:00:00Z' }];
    const inp = inputs({
      counts: [count('kit-almond-croissant', '2026-11-06', 1, 10, '2026-11-06T12:00:00Z'), count('kit-almond-croissant', '2026-11-06', 2, 5, '2026-11-06T17:00:00Z')],
      usage: [use('2026-11-06T14:00:00Z', 'kit-almond-croissant', 3)],
      waste,
    });
    const [s] = steps(croissant, inp);
    expect([s.expected, s.counted, s.difference, s.over]).toEqual([6, 5, -1, true]);
  });
  it('weighed and poured items allow 5% by default', () => {
    expect(isOver(milk, -400, 10000, 9600)).toBe(false);
    expect(isOver(milk, -600, 10000, 9400)).toBe(true);
  });
  it('a count made of two items needs both counted (condensed milk: cans + bottles)', () => {
    const inp = inputs({
      counts: [
        count('bar-condensed-milk-unopened-cans', '2026-11-06', 1, 8, '2026-11-06T12:00:00Z'),
        count('bar-condensed-milk-bottles', '2026-11-06', 1, 1, '2026-11-06T12:00:00Z'),
        count('bar-condensed-milk-unopened-cans', '2026-11-06', 2, 8, '2026-11-06T17:00:00Z'), // bottles not counted
      ],
    });
    const snaps = snapshots(condensed, inp);
    expect(snaps.map((s) => s.value)).toEqual([3771.5]); // 8 x 397 + 1 x 595.5
  });
});

describe('deliveries not ordered (shop purchases)', () => {
  it('count as arrived at the time they were logged, in counting units', () => {
    const shop: Order = {
      id: 'x1', businessDate: '2026-11-06', supplierId: 'sup-shop', lines: [], message: 'Bought from a shop · AED 48', lpoNumber: null, sentBy: 'Rhobel',
      sentAt: '2026-11-06T07:20:00Z', receivedAt: '2026-11-06T07:20:00Z', receivedBy: 'Rhobel (not ordered)', received: [{ ruleId: '', itemId: 'bar-full-fat-milk', qty: 6 }],
    };
    const inp = inputs({
      counts: [count('bar-full-fat-milk', '2026-11-05', 2, 2, '2026-11-05T17:00:00Z'), count('bar-full-fat-milk', '2026-11-06', 1, 8, '2026-11-06T12:00:00Z')],
      orders: [shop],
    });
    const [s] = steps(milk, inp);
    expect([s.arrivedTotal, s.expected, s.difference]).toEqual([6000, 8000, 0]); // 2 L + 6 L bought = 8 L counted
  });
});

describe('roasting: a big rise in a bean count is a new roast', () => {
  const beans = (to: number, usedG = 1000) => inputs({
    counts: [count('bar-brazil-beans', '2026-11-05', 2, 3000, '2026-11-05T17:00:00Z'), count('bar-brazil-beans', '2026-11-06', 1, to, '2026-11-06T12:00:00Z')],
    usage: [use('2026-11-06T05:00:00Z', 'bean-brazil', usedG)],
  });
  it('a rise of more than 4 kg is added as a roast and the difference is zero', () => {
    const [s] = steps(brazil, beans(9000)); // 3 kg - 1 kg used = 2 kg expected, 9 kg counted: +6 kg
    expect(s.arrived).toEqual([{ at: '2026-11-06T12:00:00Z', qty: 7000, supplier: 'Roast', orderId: '', kind: 'roast' }]);
    expect([s.arrivedTotal, s.expected, s.difference, s.over]).toEqual([7000, 9000, 0, false]);
  });
  it('a rise of 4 kg or less stays a difference', () => {
    const [s] = steps(brazil, beans(7000)); // +4 kg exactly: not more than 4 kg
    expect([s.arrived, s.expected, s.difference]).toEqual([[], 2000, 5000]);
  });
  it('a count that is lower than expected is never a roast; other ingredients are not touched', () => {
    const [s] = steps(brazil, beans(1000));
    expect([s.arrived, s.difference]).toEqual([[], -1000]);
    const [m] = steps(milk, inputs({ counts: [count('bar-full-fat-milk', '2026-11-05', 2, 2, '2026-11-05T17:00:00Z'), count('bar-full-fat-milk', '2026-11-06', 1, 20, '2026-11-06T12:00:00Z')] }));
    expect([m.arrived, m.difference]).toEqual([[], 18000]);
  });
});

describe('expected below zero', () => {
  it('says how much more sales used than was counted', () => {
    expect(soldMoreThanCounted(-450.25)).toBe(450.25);
    expect(soldMoreThanCounted(0)).toBe(0);
    expect(soldMoreThanCounted(1200)).toBe(0);
    expect(soldMoreThanCounted(null)).toBe(0);
  });
});

describe('missing stock', () => {
  it('a count lower than expected is missing, even inside the limit; equal or higher is not', () => {
    expect(isMissing(-50)).toBe(true);
    expect(isMissing(-0.01)).toBe(false); // rounding
    expect(isMissing(0)).toBe(false);
    expect(isMissing(300)).toBe(false);
  });
});
