import { describe, expect, it } from 'vitest';
import { DEMO_LY_ITEMS } from '../data/demoLoyverse';
import { seedItems } from '../data/seed';
import { START_INGREDIENTS, START_MODIFIER_RULES } from './catalog';
import { importRecipes, pieceIngredients } from './importRecipes';
import { lineUses, makeBook, receiptUsage, recipeSentence, ruleSentence, totalsByIngredient } from './usage';
import { updateRecipes, updateRules } from './recipeUpdate';
import type { Receipt, SaleModifier } from '../types';

const ingredients = [...START_INGREDIENTS, ...pieceIngredients(seedItems)];
const { recipes, notes } = importRecipes(DEMO_LY_ITEMS, ingredients);
const book = makeBook(ingredients, recipes, START_MODIFIER_RULES);
const recipe = (n: string) => recipes.find((r) => r.itemName === n)!;

/** Uses as { ingredient: qty } for one line. */
function uses(item: string, mods: SaleModifier[] = [], takeaway = false) {
  const it = DEMO_LY_ITEMS.find((i) => i.name === item);
  const out: Record<string, number> = {};
  for (const u of lineUses(book, { itemId: it?.id ?? null, itemName: item, modifiers: mods }, takeaway).uses)
    out[u.ingredientId] = Math.round(((out[u.ingredientId] ?? 0) + u.qty) * 1000) / 1000;
  return out;
}

describe('starting recipes from Loyverse with Rimma’s corrections', () => {
  it('converts Loyverse units to g and ml and sets coffee to 18 g', () => {
    expect(recipe('Cappuccino').lines).toEqual([
      { ingredientId: 'bean-brazil', qty: 18, role: 'coffee' },
      { ingredientId: 'milk-full-fat', qty: 214, role: 'milk' },
    ]);
    expect(recipe('Cold Brew').lines[0].qty).toBe(32);
    expect(uses('Spanish Latte')['condensed-milk']).toBe(25); // Arsen: 25 g dine-in
  });
  it('applies the corrections', () => {
    expect(uses('Ice RAF')['syrup-vanilla']).toBe(30);
    expect(uses('Fizzie')['syrup-sugar']).toBeUndefined();
    expect(uses('Mocha Belgian')['condensed-milk']).toBe(15);
    expect(uses('Bumble')).toEqual({ 'bean-brazil': 18, 'orange-juice': 200 }); // dried orange removed
    expect(uses('Shaken Ice Tea (Peach)')).toEqual({ 'tea-peach': 4 });
    expect(uses('Hibiscus Fizz')).toEqual({ 'hibiscus-flowers': 0.96, 'syrup-sugar': 3.6, 'tonic-water': 100, 'lemon-squash': 30, 'syrup-hazelnut': 10 });
    expect(uses('Brazil 250g')).toEqual({});
    expect(uses('Salted Brownie')).toEqual({ 'kit-brownie': 1, 'ice-cream': 60 });
  });
  it('items sold as pieces use 1 piece', () => {
    expect(uses('Falafel Sandwhich')).toEqual({ 'kit-falafel-sandwich': 1 });
    expect(uses('Almond Croissant')).toEqual({ 'kit-almond-croissant': 1 });
  });
  it('reads as a sentence', () => {
    expect(recipeSentence(recipe('Latte'), book)).toBe(
      'Latte: 18 g coffee (Brazil beans unless another bean is chosen), 214 ml full fat milk (or the milk chosen).',
    );
    expect(ruleSentence(START_MODIFIER_RULES.find((r) => r.option === 'Oat')!, book)).toBe(
      'Alternative Milk: Oat: uses oat milk instead of the drink’s milk (50 ml splash if the drink has no milk).'.replace('’', "'"),
    );
  });
  it('lists what it could not match', () => {
    expect(notes.join(' ')).toContain('not found in Loyverse');
  });
});

describe('acceptance: exact ingredients for known sales', () => {
  it('Cappuccino Large with Oat and Brazil, take-away', () => {
    expect(uses('Cappuccino', [{ group: 'Alternative Milk', option: 'Oat' }, { group: 'Beans', option: 'Brazil' }, { group: 'Size', option: 'Cappucino Large' }], true)).toEqual({
      'bean-brazil': 18, 'milk-oat': 322, 'cup-12oz-paper': 1, 'lid-flip': 1,
    });
  });
  it('Latte with Ethiopia beans uses Ethiopia, not Brazil', () => {
    expect(uses('Latte', [{ group: 'Beans', option: 'Ethiopia' }])).toEqual({ 'bean-ethiopia': 18, 'milk-full-fat': 214 });
  });
  it('Ice Long Black with Oat gets a 50 ml splash', () => {
    expect(uses('Ice Long Black', [{ group: 'Alternative Milk', option: 'Oat' }])).toEqual({ 'bean-ethiopia': 18, 'milk-oat': 50 });
  });
  it('Breakfast Set: full Latte recipe with the milk chosen + 1 croissant', () => {
    expect(uses('Breakfast Set', [{ group: 'Classic Coffee', option: 'Latte' }, { group: 'Croissant', option: 'Almond' }, { group: 'Alternative Milk', option: 'Oat' }])).toEqual({
      'bean-brazil': 18, 'milk-oat': 214, 'kit-almond-croissant': 1,
    });
  });
  it('Coffee bundle ignores the Classic Coffee choice', () => {
    expect(uses('Coffee and Brownie', [{ group: 'Classic Coffee', option: 'Cappuccino' }])).toEqual({ 'bean-brazil': 18, 'kit-brownie': 1 });
  });
  it('Loyverse names: Extra Shot (Ethiopia / Brazil) 18 g, Colombia (Filter) beans 20 g on V60', () => {
    expect(uses('Flat White', [{ group: 'Extra Shot', option: 'Extra Shot (Ethiopia)' }])['bean-ethiopia']).toBe(18);
    expect(uses('Flat White', [{ group: 'Extra Shot', option: 'Extra Shot (Brazil)' }])['bean-brazil']).toBe(36);
    expect(uses('Latte', [{ group: 'Beans', option: 'Ethiopia Sidamo (Filter)' }])['bean-sidamo']).toBe(18);
  });
  it('Milk: 214 ml dine-in; take-away Latte and Spanish Latte 322 ml; Cortado 214; Spanish condensed 25 / 35 g', () => {
    expect(uses('Latte')['milk-full-fat']).toBe(214);
    expect(uses('Latte', [], true)['milk-full-fat']).toBe(322);
    expect(uses('Latte', [{ group: 'Alternative Milk', option: 'Oat' }], true)['milk-oat']).toBe(322);
    expect(uses('Spanish Latte', [], true)['milk-full-fat']).toBe(322);
    expect(uses('Spanish Latte')['condensed-milk']).toBe(25);
    expect(uses('Spanish Latte', [], true)['condensed-milk']).toBe(35);
    expect(uses('Ice Latte', [], true)['milk-full-fat']).toBe(214);
    expect(uses('Flat White', [], true)['milk-full-fat']).toBe(214);
  });
  it('Extra shot, syrups, RAF extra pump', () => {
    expect(uses('Flat White', [{ group: 'Extra Shot', option: 'Ethiopia' }])).toEqual({ 'bean-brazil': 18, 'bean-ethiopia': 18, 'milk-full-fat': 214 });
    expect(uses('Ice Latte', [{ group: 'Syrup', option: 'Vanilla (3pmp)' }])['syrup-vanilla']).toBe(30);
    expect(uses('RAF', [{ group: 'Extra Pump RAF/TOFFEE', option: '2' }])['syrup-vanilla']).toBe(40);
  });
  it('Flat White Large take-away: 8oz cup with flip lid', () => {
    expect(uses('Flat White', [{ group: 'Size', option: 'Flat White Large 8oz' }], true)).toEqual({
      'bean-brazil': 18, 'milk-full-fat': 214, 'cup-8oz': 1, 'lid-flip': 1,
    });
  });
  it('Shaken ice tea: syrup only with sweetener', () => {
    expect(uses('Shaken Ice Tea (Peach)', [{ group: 'Ice Tea Sweetner', option: 'Yes' }])).toEqual({ 'tea-peach': 4, 'syrup-peach': 25 });
  });
});

const receipt = (lines: [string, SaleModifier[]][], over: Partial<Receipt> = {}): Receipt => ({
  number: 'R1', type: 'SALE', at: '2026-11-06T08:00:00Z', businessDate: '2026-11-06', dining: 'Take-Away', cancelled: false, total: null, employee: null,
  lines: lines.map(([name, mods], idx) => ({ idx, itemId: DEMO_LY_ITEMS.find((i) => i.name === name)?.id ?? null, itemName: name, variantName: null, qty: 1, total: null, modifiers: mods })),
  ...over,
});

describe('receipts', () => {
  it('+ Size cold drink swaps the 12oz clear cup for 16oz and adds its own choice', () => {
    const t = totalsByIngredient(receiptUsage(book, [receipt([['Ice Latte', []], ['+ Size cold drink', [{ group: 'Matcha or Coffee', option: 'Coffee' }]]])]));
    expect(t.get('cup-16oz-pet')).toBe(1);
    expect(t.get('cup-12oz-pet') ?? 0).toBe(0);
    expect(t.get('bean-brazil')).toBe(36); // 18 + 18
    expect(t.get('milk-full-fat')).toBe(300); // 200 + 100
  });
  it('dine in uses no packaging; refunds give usage back; cancelled is ignored', () => {
    expect(totalsByIngredient(receiptUsage(book, [receipt([['Ice Latte', []]], { dining: 'Dine in' })])).get('cup-12oz-pet')).toBeUndefined();
    expect(totalsByIngredient(receiptUsage(book, [receipt([['Latte', []]], { type: 'REFUND' })])).get('bean-brazil')).toBe(-18);
    expect(receiptUsage(book, [receipt([['Latte', []]], { cancelled: true })])).toEqual([]);
  });
  it('extra pump with unknown syrup is shared by how often each syrup is chosen', () => {
    const t = totalsByIngredient(receiptUsage(book, [
      receipt([['Ice Latte', [{ group: 'Syrup', option: 'Vanilla (3pmp)' }]], ['Latte', [{ group: 'Syrup', option: 'Extra Pump (1pmp)' }]]], { dining: 'Dine in' }),
    ]));
    expect(t.get('syrup-vanilla')).toBe(40); // only vanilla was chosen elsewhere, so the 10 ml pump is vanilla
  });
});

describe('menu vs ingredient items', () => {
  it('Brownie sold in Desserts is 1 piece; Loyverse ingredient items get no recipe', () => {
    expect(uses('Brownie')).toEqual({ 'kit-brownie': 1 });
    expect(recipes.find((r) => r.itemName === 'Milk')).toBeUndefined();
    expect(recipes.find((r) => r.itemName === 'Coffee')).toBeUndefined();
  });
});

describe('live update with Arsen answers', () => {
  it('filter drinks 20 g Ethiopia, espresso 18 g, nitro 0.33; skips what is already right', () => {
    const mk = (itemName: string, qty: number, ingredientId = 'bean-brazil') => ({ id: itemName, itemName, lines: [{ ingredientId, qty, role: 'coffee' as const }], takeaway: [], ignoreGroups: [], note: null, updatedBy: '', updatedAt: '' });
    const out = updateRecipes([mk('V60', 22), mk('Espresso', 22), mk('Latte', 18), mk('Cold Brew', 32), { ...mk('Nitro Cold Brew', 32), lines: [] }], 'Arsen');
    const by = (n: string) => out.find((r) => r.itemName === n);
    expect(by('V60')!.lines[0]).toMatchObject({ qty: 20, ingredientId: 'bean-ethiopia' });
    expect(by('Espresso')!.lines[0]).toMatchObject({ qty: 18, ingredientId: 'bean-ethiopia' });
    expect(by('Latte')).toBeUndefined();
    expect(by('Cold Brew')).toBeUndefined();
    expect(by('Nitro Cold Brew')!.lines).toEqual([{ ingredientId: 'nitro-cartridge', qty: 0.33 }]);
  });
  it('adds the missing choice rules once', () => {
    expect(updateRules([], 'Arsen').length).toBe(9);
    expect(updateRules(START_MODIFIER_RULES, 'Arsen')).toEqual([]);
  });
});
