import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { demoData } from '../data/seed';
import { LPO_ITEMS, fillLpoXlsx, lpoDate, lpoFileName, lpoRows, lpoTotals } from './lpo';

const data = demoData('2026-11-05');
const order = {
  lines: [
    { ruleId: 'rule-the-bakery-avocado-chicken-sandwich', name: 'Avocado Chicken Sandwich', qty: 2, unit: 'pcs', price: 14.25 },
    { ruleId: 'rule-the-bakery-exotic-soy-pudding', name: 'Exotic Soy Pudding', qty: 3, unit: 'pcs', price: null },
  ],
};

describe('The Bakery LPO', () => {
  it('lists all 15 items in the sheet order, 0 when not ordered', () => {
    const rows = lpoRows(order, data.rules);
    expect(rows.map((r) => r.code)).toEqual([94015, 94048, 99003, 99002, 94057, 94072, 94029, 94024, 94073, 95006, 95013, 87071, 87028, 87025, 87023]);
    expect(rows.filter((r) => r.qty > 0).map((r) => [r.code, r.qty])).toEqual([[94015, 2], [87071, 3]]);
  });
  it('every LPO item has a rule with a price', () => {
    for (const it of LPO_ITEMS) {
      const rule = data.rules.find((r) => r.id === it.ruleId);
      expect(rule?.supplierId, it.title).toBe('sup-the-bakery');
      expect(rule?.price, it.title).toBe(it.sheetPrice);
    }
  });
  it('Total = price x qty, VAT 5%, Net = Total + VAT', () => {
    const rows = lpoRows(order, data.rules);
    const soy = rows.find((r) => r.code === 87071)!;
    expect(soy.price).toBe(7.5); // from the rule, since the order line had no price
    expect(soy.total).toBeCloseTo(22.5);
    expect(soy.vat).toBeCloseTo(1.125);
    expect(soy.net).toBeCloseTo(23.625);
    expect(lpoTotals(rows)).toEqual({ qty: 5, total: 51, vat: 2.55, net: 53.55 });
  });
  it('file name and date format', () => {
    expect(lpoFileName(557)).toBe('Title Brew LPO 557.xlsx');
    expect(lpoDate('2026-11-06')).toBe('11/06/2026');
  });
  it('fills the Excel template, keeping formulas', () => {
    const tpl = new Uint8Array(readFileSync('src/assets/bakery-lpo-template.xlsx'));
    const rows = lpoRows(order, data.rules);
    const out = fillLpoXlsx(tpl, { lpoNumber: 557, deliveryDate: '2026-11-06', contact: 'Test Contact +971 00 000 0000', rows });
    const xml = strFromU8(unzipSync(out)['xl/worksheets/sheet1.xml']);
    expect(xml).toContain('<c r="G4" s="5"><v>557</v></c>');
    expect(xml).toContain('<c r="G3" s="7"><v>46332</v></c>'); // 6 Nov 2026
    expect(xml).toContain('Test Contact +971 00 000 0000');
    expect(xml).toContain('<c r="C7" s="13"><v>2</v></c>');
    expect(xml).toContain('<c r="C8" s="13"><v>0</v></c>');
    expect(xml).toMatch(/<c r="E7" s="15"><f t="shared" ref="E7:E21" si="0">D7\*C7<\/f><v>28.5<\/v><\/c>/);
    expect(xml).toMatch(/<c r="G22" s="24"><f>SUM\(G7:G21\)<\/f><v>53.55<\/v><\/c>/);
  });
});
