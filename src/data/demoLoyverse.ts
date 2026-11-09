/**
 * Demo Loyverse data: a small menu with components and made-up receipts, used only before
 * Supabase is connected. The real menu and receipts come from the Loyverse sync.
 */
import type { Receipt, SaleLine, SaleModifier } from '../types';
import type { LyItem } from '../lib/importRecipes';
import { addDays } from '../lib/time';

let n = 0;
const item = (name: string, category: string, components: [string, number][] = []): LyItem & { comp: [string, number][] } => ({
  id: 'demo-' + ++n, name, category, isComposite: components.length > 0, components: [], variantIds: ['v-' + name], comp: components,
});

const RAW = [
  // Loyverse ingredient items (mixed units, as in Loyverse)
  item('Coffee', 'Ingredients'), item('Milk', 'Ingredients'), item('Condensed Milk', 'Ingredients'), item('Whipping cream', 'Ingredients'),
  item('Vanilla syrup', 'Ingredients'), item('Hazelnut syrup', 'Ingredients'), item('Chocolate powder', 'Ingredients'), item('Matcha', 'Ingredients'),
  item('Sugar Syrup', 'Ingredients'), item('Orange Juice', 'Ingredients'), item('Tonic water', 'Ingredients'), item('Dried Orange', 'Ingredients'),
  item('Ice cream', 'Ingredients'), item('Hibiscus', 'Ingredients'), item('Lemon squash', 'Ingredients'),
  // Menu
  item('Espresso', 'Hot Drinks', [['Coffee', 18]]),
  item('Long Black', 'Hot Drinks', [['Coffee', 18]]),
  item('Cappuccino', 'Hot Drinks', [['Coffee', 18], ['Milk', 0.18]]),
  item('Flat White', 'Hot Drinks', [['Coffee', 18], ['Milk', 0.15]]),
  item('Latte', 'Hot Drinks', [['Coffee', 18], ['Milk', 0.25]]),
  item('Spanish Latte', 'Hot Drinks', [['Coffee', 18], ['Milk', 0.2], ['Condensed Milk', 0.05]]),
  item('Mocha Belgian', 'Hot Drinks', [['Coffee', 18], ['Milk', 0.2], ['Chocolate powder', 15], ['Condensed Milk', 0.03]]),
  item('RAF', 'Hot Drinks', [['Coffee', 18], ['Milk', 0.15], ['Whipping cream', 0.05], ['Vanilla syrup', 20]]),
  item('Matcha Latte', 'Hot Drinks', [['Matcha', 3], ['Milk', 0.25]]),
  item('Ice Latte', 'Cold Drinks', [['Coffee', 18], ['Milk', 0.2]]),
  item('Ice Long Black', 'Cold Drinks', [['Coffee', 18]]),
  item('Ice RAF', 'Cold Drinks', [['Coffee', 18], ['Milk', 0.15], ['Whipping cream', 0.05], ['Vanilla syrup', 20]]),
  item('Cold Brew', 'Cold Drinks', [['Coffee', 30]]),
  item('Bumble', 'Cold Drinks', [['Coffee', 18], ['Orange Juice', 0.15], ['Dried Orange', 1]]),
  item('Fizzie', 'Cold Drinks', [['Coffee', 18], ['Tonic water', 1.5], ['Sugar Syrup', 0.02]]),
  item('Hibiscus Iced', 'Cold Drinks', [['Hibiscus', 0.096], ['Sugar Syrup', 0.036]]),
  item('Hibiscus Fizz', 'Cold Drinks', [['Hibiscus Iced', 0.1], ['Tonic water', 1], ['Lemon squash', 30], ['Hazelnut syrup', 10]]),
  item('Shaken Ice Tea (Peach)', 'Cold Drinks', [['Sugar Syrup', 0.02]]),
  item('+ Size cold drink', 'Cold Drinks'),
  item('Breakfast Set', 'Breakfast'),
  item('Coffee and Brownie', 'Bundles', [['Coffee', 18]]),
  item('Brazil 250g', 'Beans'),
  item('Ethiopia 250g', 'Beans'),
  item('Avocado Chicken Sandwich', 'Sandwich'),
  item('Falafel Sandwhich', 'Sandwich'),
  item('Almond Croissant', 'Desserts'),
  item('Brownie', 'Desserts'),
  item('Salted Brownie', 'Desserts', [['Brownie', 1], ['Ice cream', 0.06]]),
  item('Aniol Water Still', 'Soft Drinks'),
];

export const DEMO_LY_ITEMS: LyItem[] = RAW.map(({ comp, ...it }) => ({
  ...it,
  components: comp.map(([name, qty]) => ({ variantId: 'v-' + name, qty })),
}));

// ---------------------------------------------------------------- demo receipts

/** Small fixed random generator so the demo shows the same receipts every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const MENU: [string, number, (SaleModifier[] | null)[]][] = [
  ['Cappuccino', 14, [null, [{ group: 'Alternative Milk', option: 'Oat' }, { group: 'Beans', option: 'Brazil' }], [{ group: 'Size', option: 'Cappucino Large' }]]],
  ['Latte', 12, [null, [{ group: 'Alternative Milk', option: 'Almond' }], [{ group: 'Beans', option: 'Ethiopia' }]]],
  ['Flat White', 8, [null, [{ group: 'Beans', option: 'Ethiopia' }]]],
  ['Spanish Latte', 9, [null, [{ group: 'Syrup', option: 'Extra Pump (1pmp)' }]]],
  ['Espresso', 4, [null]],
  ['Ice Latte', 10, [null, [{ group: 'Alternative Milk', option: 'Oat' }], [{ group: 'Syrup', option: 'Vanilla (3pmp)' }]]],
  ['Ice Long Black', 4, [null, [{ group: 'Alternative Milk', option: 'Oat' }]]],
  ['Matcha Latte', 5, [null, [{ group: 'Extra Shot', option: 'Matcha' }]]],
  ['RAF', 3, [null, [{ group: 'Extra Pump RAF/TOFFEE', option: '1' }]]],
  ['Mocha Belgian', 3, [null]],
  ['Cold Brew', 2, [null]],
  ['Hibiscus Fizz', 2, [null]],
  ['Breakfast Set', 3, [[{ group: 'Classic Coffee', option: 'Latte' }, { group: 'Croissant', option: 'Almond' }, { group: 'Alternative Milk', option: 'Oat' }]]],
  ['Coffee and Brownie', 2, [[{ group: 'Classic Coffee', option: 'Cappuccino' }]]],
  ['Avocado Chicken Sandwich', 2, [null]],
  ['Almond Croissant', 4, [null]],
  ['Brownie', 2, [null]],
  ['Aniol Water Still', 4, [null]],
];
const WEIGHT = MENU.reduce((a, m) => a + m[1], 0);

/** Receipts for one business day: about 140 between 7am and 10pm Dubai time. */
export function demoReceiptsFor(date: string, upTo = new Date().toISOString()): Receipt[] {
  const r = rng(Number(date.replace(/-/g, '')));
  const out: Receipt[] = [];
  const count = 120 + Math.floor(r() * 40);
  for (let k = 0; k < count; k++) {
    const minute = 7 * 60 + Math.floor(r() * 15 * 60);
    const at = new Date(Date.parse(`${date}T00:00:00+04:00`) + minute * 60_000).toISOString();
    if (at > upTo) continue;
    const lines: SaleLine[] = [];
    const nLines = 1 + Math.floor(r() * 2.2);
    for (let i = 0; i < nLines; i++) {
      let x = r() * WEIGHT;
      const m = MENU.find((e) => (x -= e[1]) < 0) ?? MENU[0];
      const mods = m[2][Math.floor(r() * m[2].length)] ?? [];
      lines.push({ idx: i, itemId: DEMO_LY_ITEMS.find((it) => it.name === m[0])?.id ?? null, itemName: m[0], variantName: null, qty: 1, total: 18 + Math.round(r() * 10), modifiers: mods });
    }
    const takeaway = r() < 0.45;
    if (takeaway && lines.some((l) => /^Ice|Cold/.test(l.itemName)) && r() < 0.3)
      lines.push({ idx: lines.length, itemId: null, itemName: '+ Size cold drink', variantName: null, qty: 1, total: 6, modifiers: [{ group: 'Matcha or Coffee', option: 'Coffee' }] });
    out.push({
      number: `${date.slice(5).replace('-', '')}-${String(k + 1).padStart(4, '0')}`, type: 'SALE', at, businessDate: date,
      dining: takeaway ? 'Take-Away' : 'Dine in', cancelled: false, total: lines.reduce((a, l) => a + (l.total ?? 0), 0), employee: 'Demo', lines,
    });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1));
}

export function demoReceipts(fromIso: string, toIso: string): Receipt[] {
  const out: Receipt[] = [];
  let d = new Date(Date.parse(fromIso)).toISOString().slice(0, 10);
  const last = new Date(Date.parse(toIso)).toISOString().slice(0, 10);
  for (let i = 0; i < 800 && d <= last; i++, d = addDays(d, 1)) out.push(...demoReceiptsFor(d).filter((x) => x.at > fromIso && x.at <= toIso));
  return out;
}

/** Demo version of the live check: made-up receipts shaped like Loyverse's. */
export function demoLive(): import('../types').LiveSales {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = addDays(today, -1);
  const toLive = (r: Receipt): import('../types').LiveReceipt => ({
    number: r.number, type: r.type, at: r.at, createdAt: r.at, businessDate: r.businessDate, dining: r.dining, cancelled: r.cancelled,
    total: r.total ?? 0, discount: 0, employee: 'Demo', store: 'Title Brew (demo)', payments: [{ name: 'Card', amount: r.total ?? 0 }],
    lines: r.lines.map((l) => ({ item: l.itemName, inMenu: true, variant: null, qty: l.qty, price: l.total ?? 0, total: l.total ?? 0, discount: 0, note: null,
      modifiers: l.modifiers.map((m) => ({ ...m, amount: 0 })) })),
  });
  const receipts = [...demoReceiptsFor(yesterday), ...demoReceiptsFor(today, now.toISOString())].map(toLive).sort((a, b) => (a.at < b.at ? 1 : -1));
  const last = receipts.find((r) => r.businessDate === today);
  return {
    ok: true, checkedAt: now.toISOString(), account: 'Demo', today, yesterday, receipts,
    checks: [
      { level: 'warn', text: 'Demo: these are made-up sales. Loyverse is not connected in demo mode.' },
      ...(last ? [{ level: 'ok' as const, text: `Last sale ${Math.max(1, Math.round((now.getTime() - Date.parse(last.at)) / 60000))} minutes ago (receipt ${last.number}).` }] : []),
    ],
  };
}
