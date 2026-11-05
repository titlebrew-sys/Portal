import { describe, expect, it } from 'vitest';
import type { CountItem, CountRow } from '../types';
import { countTotal, referenceText } from './count';

const croissant: CountItem = { id: 'kit-almond-croissant', area: 'Kitchen', section: 'Croissants', name: 'Almond croissant', unit: 'pcs', hint: null, sort: 0, hasBatches: true, hasFrozen: true, active: true };
const sandwich: CountItem = { ...croissant, id: 'kit-falafel', name: 'Falafel sandwich', hasFrozen: false };
const beans: CountItem = { ...croissant, id: 'bar-brazil', area: 'Bar', name: 'Brazil beans', unit: 'g', hasBatches: false, hasFrozen: false };

const row = (p: Partial<CountRow>): CountRow => ({
  businessDate: '2026-11-04', shift: 2, itemId: 'x', qty: null, oldQty: null, newQty: null, frozenQty: null,
  expOld: null, expNew: null, countedBy: 'Test', savedAt: '2026-11-04T17:00:00Z', ...p,
});

describe('kitchen totals', () => {
  it('qty is always old + new + frozen', () => {
    expect(countTotal(croissant, { qty: 99, oldQty: 0, newQty: 2, frozenQty: 22 })).toBe(24);
    expect(countTotal(croissant, { qty: null, oldQty: null, newQty: 3, frozenQty: null })).toBe(3);
    expect(countTotal(croissant, { qty: null, oldQty: 0.5, newQty: 0.25, frozenQty: null })).toBe(0.75);
  });
  it('frozen is ignored for items without frozen stock', () => {
    expect(countTotal(sandwich, { qty: null, oldQty: 1, newQty: 2, frozenQty: 50 })).toBe(3);
  });
  it('all blank means not counted', () => {
    expect(countTotal(croissant, { qty: null, oldQty: null, newQty: null, frozenQty: null })).toBeNull();
  });
  it('bar items save the number typed', () => {
    expect(countTotal(beans, { qty: 11605, oldQty: null, newQty: null, frozenQty: null })).toBe(11605);
  });
});

describe('reference line', () => {
  it('shows last night old, new, frozen and expiry dates', () => {
    expect(referenceText('Last night', croissant, row({ qty: 24, oldQty: 0, newQty: 2, frozenQty: 22, expOld: '2026-11-04', expNew: '2026-11-06' }))).toBe(
      'Last night 0 old, 2 new, 22 frozen · Old expires 4 Nov · New expires 6 Nov',
    );
  });
  it('Shift 2 uses the same format', () => {
    expect(referenceText('Shift 1 today', sandwich, row({ qty: 1, oldQty: 0, newQty: 1 }))).toBe('Shift 1 today 0 old, 1 new');
  });
  it('not counted, and bar items', () => {
    expect(referenceText('Last night', croissant, undefined)).toBe('Last night not counted');
    expect(referenceText('Last night', beans, row({ qty: 13200 }))).toBe('Last night 13,200 g');
  });
});
