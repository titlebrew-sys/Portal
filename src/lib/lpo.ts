/**
 * The Bakery LPO, in The Bakery's own Excel format (src/assets/bakery-lpo-template.xlsx).
 * All 15 items are always listed in this order with their codes; quantity 0 when not ordered.
 * Unit price comes from the rules. Total = price x qty, VAT 5%, Net = Total + VAT.
 */
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import type { Order, Rule } from '../types';

export const LPO_ADDRESS = 'Coffee shop - Building 8, Bay Square, Business Bay, Dubai';
export const LPO_VAT = 0.05;
/** First item row in the sheet (row 7) */
const FIRST_ROW = 7;

export interface LpoItem {
  code: number;
  title: string;
  /** Size note printed next to the title, e.g. "(50G - 5 BALLS EACH 10G)-CUP" */
  size?: string;
  desc: string;
  ruleId: string;
  /** Price in The Bakery's sheet, used only if the rule has no price. */
  sheetPrice: number;
}

export const LPO_ITEMS: LpoItem[] = [
  { code: 94015, title: 'S/W AIOLI AVOCADO CHICKEN', desc: '- grilled chicken breast, avocado slices, provolone cheese, rocket, aioli lemon sauce', ruleId: 'rule-the-bakery-avocado-chicken-sandwich', sheetPrice: 14.25 },
  { code: 94048, title: 'S/W TURKEY CHEESE CROISSANT', desc: '- smoked turkey ham, emental cheese, rocket leave, mustard sauce', ruleId: 'rule-the-bakery-turkey-cheese-croissant', sheetPrice: 12.2 },
  { code: 99003, title: 'S/W HALLOUMI CHEESE FAJITAS WRAP IN GREEN BREAD', desc: '- spinach tortilla wrap halloumi cheese, mushrooms, fajitas mix (smokey green bell pepper, smokey red bell pepper), sour cream', ruleId: 'rule-the-bakery-halloumi-fajita-wrap', sheetPrice: 13.4 },
  { code: 99002, title: 'S/W WRAP CHICKEN CAESAR', desc: '- grilled chicken breast, red bell peper, black olives, lettuce, shredded cheese, caesar sauce', ruleId: 'rule-the-bakery-chicken-caesar-wrap', sheetPrice: 13.4 },
  { code: 94057, title: 'S/W PESTO CHICKEN MOZZARELLA PANINI', desc: '- panini bread, roasted chicken breast, mozarella slice, sun dried tomatoes, rocket leaves, pesto sauce', ruleId: 'rule-the-bakery-pesto-chicken-mozzarella-panini', sheetPrice: 13.4 },
  { code: 94072, title: 'S/W FALAFEL BROWN TOAST BREAD', desc: '- brown multigrain toast bread, baked falafel, tahini lemon sauce, cucumer slices, tomatoes, green lettuce, red onion slice', ruleId: 'rule-the-bakery-falafel-sandwich', sheetPrice: 13.95 },
  { code: 94029, title: 'S/W VEGGIE', desc: '- Brown multigrain toast bread, slice cucumber long, shredded carrots, slice red onion, basil, kalamata olives, feta cheese spread,', ruleId: 'rule-the-bakery-veggie-sandwich', sheetPrice: 13.4 },
  { code: 94024, title: 'S/W WRAP PROTEIN BREAD ASIAN CHICKEN', desc: '- grilled chicken breast, sesame white seeds, shredded carrots, red caggage, white cabbage, Singletone white mild Cheddar asian peanut sauce', ruleId: 'rule-the-bakery-chicken-power-wrap', sheetPrice: 14.9 },
  { code: 94073, title: 'SALAD ASIAN SESAME', desc: '- Grilled chicken breast, red cabbage, white cabbage, shreded carrots, red marinated ginger, green beans, red bell peper, sesame seeds, lettuce, rocket leaves, peanuts, asian peanut dressing', ruleId: 'rule-the-bakery-asian-sesame-salad', sheetPrice: 14.9 },
  { code: 95006, title: 'SALAD CHICKEN KALE', desc: '- Grilled chicken breast, kale, mix letuce, cucmbers, raddish, peanuts, peanut gigner dressing', ruleId: 'rule-the-bakery-chicken-kale-salad', sheetPrice: 14.9 },
  { code: 95013, title: 'SALAD CHICKEN AVOCADO', desc: '- grilled chicken breast slice, avocado diced chunk, cherry tomatoes halved, sweet corn, red onion, romanie letuce, coriander, lime slice,dressing (lemon juice, honey, olive oil,salt/peper)', ruleId: 'rule-the-bakery-chicken-avocado-salad', sheetPrice: 15.6 },
  { code: 87071, title: 'EXOTIC SOY PUDDING WITH MANGOES AND PASSION FRUIT-CUP', desc: '- chia seeds, honey, soy milk, mango and passion fruit pure', ruleId: 'rule-the-bakery-exotic-soy-pudding', sheetPrice: 7.5 },
  { code: 87028, title: 'BANANA WALNUT PROTEIN OATS WITH BERRIES-CUP', desc: '- Overnight oats, banana, blueberries, walnuts, vanilla protein powder', ruleId: 'rule-the-bakery-banana-walnut-oats', sheetPrice: 9.5 },
  { code: 87025, title: 'DARK CHOCO ENERGY BALL WITH CHIA', size: '(50G - 5 BALLS EACH 10G)-CUP', desc: '- Oats, peanut butter, date paste, chia seeds, coconut oil, honey, dark coco powder, pomegranate molasses, cinnamon powder', ruleId: 'rule-the-bakery-choco-balls', sheetPrice: 6.5 },
  { code: 87023, title: 'MATCHA CASHEW BOWL', size: '(50G- 5 BALLS EACH 10G)-CUP', desc: '- coconut powder, matcha powder, cashew nuts, coconut flour, honey, almond, coconut oil, fine salt', ruleId: 'rule-the-bakery-matcha-balls', sheetPrice: 6.75 },
];

export interface LpoRow extends LpoItem {
  qty: number;
  price: number;
  total: number;
  vat: number;
  net: number;
  /** True when no rule price was found and the sheet price was used. */
  sheetPriceUsed: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** All 15 rows for an order. Price: price saved on the order line, else the rule, else the sheet. */
export function lpoRows(order: Pick<Order, 'lines'>, rules: Rule[]): LpoRow[] {
  return LPO_ITEMS.map((it) => {
    const line = order.lines.find((l) => l.ruleId === it.ruleId);
    const rulePrice = rules.find((r) => r.id === it.ruleId)?.price ?? null;
    const known = line?.price ?? rulePrice;
    const price = known ?? it.sheetPrice;
    const qty = line?.qty ?? 0;
    const total = price * qty;
    const vat = total * LPO_VAT;
    return { ...it, qty, price, total, vat, net: total + vat, sheetPriceUsed: known === null };
  });
}

/** Order lines for The Bakery that are not one of the 15 LPO items (should not happen). */
export function linesNotOnLpo(order: Pick<Order, 'lines'>) {
  return order.lines.filter((l) => !LPO_ITEMS.some((it) => it.ruleId === l.ruleId));
}

export function lpoTotals(rows: LpoRow[]) {
  return {
    qty: rows.reduce((a, r) => a + r.qty, 0),
    total: r2(rows.reduce((a, r) => a + r.total, 0)),
    vat: r2(rows.reduce((a, r) => a + r.vat, 0)),
    net: r2(rows.reduce((a, r) => a + r.net, 0)),
  };
}

/** "2026-11-06" -> "11/06/2026", the month/day/year format of The Bakery's sheet. */
export function lpoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

export function lpoFileName(n: number): string {
  return `Title Brew LPO ${n}.xlsx`;
}

/** Excel's day number for a date (1900 date system). */
function excelSerial(iso: string): number {
  return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 864e5);
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Sets one cell in sheet XML, keeping its style and any formula. */
function setCell(xml: string, ref: string, value: { num: number } | { text: string }): string {
  const re = new RegExp(`<c r="${ref}"((?: [a-z]+="[^"]*")*?)(?:/>|>(.*?)</c>)`);
  const m = xml.match(re);
  if (!m) throw new Error(`LPO template: cell ${ref} missing`);
  const attrs = (m[1] || '').replace(/ t="[^"]*"/, '');
  const formula = (m[2] || '').match(/<f[^>]*\/>|<f[^>]*>.*?<\/f>/)?.[0] ?? '';
  const cell =
    'num' in value
      ? `<c r="${ref}"${attrs}>${formula}<v>${Number.isFinite(value.num) ? +value.num.toFixed(10) : 0}</v></c>`
      : `<c r="${ref}"${attrs} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value.text)}</t></is></c>`;
  return xml.replace(re, cell);
}

export interface LpoFill {
  lpoNumber: number;
  deliveryDate: string;
  contact: string;
  rows: LpoRow[];
}

/** Fills The Bakery's template and returns the .xlsx file bytes. */
export function fillLpoXlsx(template: Uint8Array, f: LpoFill): Uint8Array {
  const files = unzipSync(template);
  const path = 'xl/worksheets/sheet1.xml';
  let xml = strFromU8(files[path]);
  xml = setCell(xml, 'G3', { num: excelSerial(f.deliveryDate) });
  xml = setCell(xml, 'G4', { num: f.lpoNumber });
  xml = setCell(xml, 'B4', { text: f.contact ? ' ' + f.contact.trim() : '' });
  f.rows.forEach((r, i) => {
    const n = FIRST_ROW + i;
    xml = setCell(xml, `C${n}`, { num: r.qty });
    xml = setCell(xml, `D${n}`, { num: r.price });
    xml = setCell(xml, `E${n}`, { num: r.total });
    xml = setCell(xml, `F${n}`, { num: r.vat });
    xml = setCell(xml, `G${n}`, { num: r.net });
  });
  const t = lpoTotals(f.rows);
  xml = setCell(xml, 'C22', { num: t.qty });
  xml = setCell(xml, 'G22', { num: t.net });
  files[path] = strToU8(xml);
  return zipSync(files, { level: 6 });
}
