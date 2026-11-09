/**
 * Starting ingredients, modifier rules, take-away packaging and Rimma's recipe corrections.
 * These are the defaults copied into the database once; after that the owner edits them
 * on the Recipes and Items and rules screens.
 */
import type { Ingredient, IngredientUnit, ModifierRule, RecipeLine } from '../types';

const ing = (id: string, name: string, unit: IngredientUnit, countFrom = '', note: string | null = null): Ingredient => ({
  id, name, unit, countFrom, limitPct: unit === 'pcs' ? 0 : 5, note, active: true, sort: 0,
});

/** Ingredients in g, ml or pieces, each tied to what staff count. */
export const START_INGREDIENTS: Ingredient[] = [
  // Beans: tracked separately (Loyverse has a single "Coffee" item)
  ing('bean-brazil', 'Brazil beans', 'g', 'bar-brazil-beans'),
  ing('bean-ethiopia', 'Ethiopia beans', 'g', 'bar-ethiopia-beans'),
  ing('bean-colombia-watermelon', 'Colombia beans (watermelon)', 'g', 'bar-watermelon'),
  ing('bean-sidamo', 'Sidamo beans', 'g', 'bar-sidamo'),
  // Milk and cream: counted in litres, used in ml
  ing('milk-full-fat', 'Full fat milk', 'ml', '1000*bar-full-fat-milk'),
  ing('milk-low-fat', 'Low fat milk', 'ml', '1000*bar-low-fat-milk'),
  ing('milk-lactose-free', 'Lactose free milk', 'ml', '1000*bar-lactose-free-milk'),
  ing('milk-almond', 'Almond milk', 'ml', '1000*bar-almond-milk'),
  ing('milk-coconut', 'Coconut milk', 'ml', '1000*bar-coconut-milk'),
  ing('milk-soy', 'Soy milk', 'ml', '1000*bar-soy-milk'),
  ing('milk-oat', 'Oat milk', 'ml', '1000*bar-oat-milk'),
  ing('whipping-cream', 'Whipping cream', 'ml', '1000*bar-whipping-cream'),
  // 1 can = 397 g; 1 bottle in use is about 1.5 cans
  ing('condensed-milk', 'Condensed milk', 'g', '397*bar-condensed-milk-unopened-cans + 595.5*bar-condensed-milk-bottles'),
  ing('ice-cream', 'Ice cream', 'g'),
  // Drinks
  ing('orange-juice', 'Orange juice', 'ml', '1000*bar-orange-juice'),
  ing('tonic-water', 'Tonic water', 'ml', '', 'Fill in the ml in one can to compare with counts.'),
  ing('complimentary-sparkling', 'Complimentary sparkling water', 'ml', '1000*bar-complimentary-sparkling-water'),
  ing('still-water', 'Still water', 'pcs', 'bar-still-water'),
  ing('sparkling-water', 'Sparkling water', 'pcs', 'bar-sparkling-water'),
  ing('pomegranate-juice', 'Pomegranate juice', 'pcs', 'bar-pomegranate-juice'),
  ing('blackberry-juice', 'Blackberry juice', 'pcs', 'bar-blackberry-juice'),
  ing('lemon-squash', 'Lemon squash', 'ml'),
  // Syrups: counted in litres, used in ml
  ing('syrup-vanilla', 'Vanilla syrup', 'ml', '1000*bar-vanilla-syrup'),
  ing('syrup-hazelnut', 'Hazelnut syrup', 'ml', '1000*bar-hazelnut-syrup'),
  ing('syrup-salted-caramel', 'Salted caramel syrup', 'ml', '1000*bar-salted-caramel-syrup'),
  ing('syrup-strawberry', 'Strawberry syrup', 'ml', '1000*bar-strawberry-syrup'),
  ing('syrup-peach', 'Peach syrup', 'ml', '1000*bar-peach-syrup'),
  ing('syrup-sugar', 'Sugar syrup', 'ml', 'bar-sugar-syrup'),
  ing('syrup-grapefruit', 'Grapefruit syrup', 'ml'),
  ing('syrup-grenadine', 'Grenadine', 'ml'),
  // Powders and teas, in grams
  ing('matcha', 'Matcha', 'g', 'bar-matcha'),
  ing('chocolate-powder', 'Chocolate powder', 'g', 'bar-chocolate-powder'),
  ing('toffee-frappe-powder', 'Toffee frappe powder', 'g', 'bar-toffee-frappe-powder'),
  ing('tea-earl-grey', 'Earl grey tea', 'g', 'bar-earl-grey-tea'),
  ing('tea-strawberry-kiwi', 'Strawberry kiwi tea', 'g', 'bar-strawberry-kiwi-tea'),
  ing('tea-milky-oolong', 'Milky oolong tea', 'g', 'bar-milky-oolong-tea'),
  ing('tea-peach', 'Peach tea', 'g', 'bar-peach-tea'),
  ing('hibiscus-flowers', 'Hibiscus flowers', 'g', 'bar-hibiscus-flowers-dry'),
  // Other
  ing('nitro-cartridge', 'Nitrogen cartridge', 'pcs', 'bar-nitro-cartridges'),
  ing('v60-filter', 'V60 filter', 'pcs'),
  // Take-away packaging: cups are counted weekly in sleeves
  ing('cup-4oz', '4oz paper cup', 'pcs', '', 'Fill in the cups in one sleeve.'),
  ing('cup-6oz', '6.5oz paper cup', 'pcs', '', 'Fill in the cups in one sleeve.'),
  ing('cup-8oz', '8oz paper cup', 'pcs', '', 'Fill in the cups in one sleeve.'),
  ing('cup-12oz-paper', '12oz paper cup', 'pcs', '', 'Fill in the cups in one sleeve.'),
  ing('cup-12oz-pet', '12oz clear cup', 'pcs', '', 'Fill in the cups in one sleeve.'),
  ing('cup-16oz-pet', '16oz clear cup', 'pcs', '', 'Fill in the cups in one sleeve.'),
  ing('lid-flat', 'Flat lid', 'pcs'),
  ing('lid-flip', 'Black flip lid', 'pcs'),
  ing('lid-black', 'Black lid', 'pcs'),
  ing('straw', 'Straw', 'pcs', '', 'Fill in the straws in one pack.'),
].map((x, i) => ({ ...x, sort: i }));

/** Count item -> piece ingredient for kitchen items sold one piece per sale. */
export const PIECE_FROM_COUNT_PREFIX = 'kit-';

/** Count items that hold cups/straws and the ingredient they feed, for the "pieces per sleeve" setting. */
export const PER_SLEEVE: Record<string, string> = {
  'cup-4oz': 'wk-cups-4oz',
  'cup-6oz': 'wk-cups-6-5oz',
  'cup-8oz': 'wk-cups-8oz',
  'cup-12oz-paper': 'wk-cups-12oz-paper',
  'cup-12oz-pet': 'wk-cups-12oz-pet',
  'cup-16oz-pet': 'wk-cups-16oz-pet',
  straw: 'wk-black-straws',
  'tonic-water': 'bar-tonic-water',
};

/**
 * Loyverse ingredient items -> portal ingredient, with the unit change.
 * Matched on the Loyverse item name (lower case, letters and digits only).
 */
export const LOYVERSE_INGREDIENTS: { match: RegExp; ingredientId: string | null; factor: number; role?: 'milk' | 'coffee' }[] = [
  { match: /^coffee(beans?)?$/, ingredientId: 'bean-brazil', factor: 1, role: 'coffee' },
  { match: /^(full ?fat ?)?milk$/, ingredientId: 'milk-full-fat', factor: 1000, role: 'milk' },
  { match: /^coconutmilk$/, ingredientId: 'milk-coconut', factor: 1000 },
  { match: /^condensedmilk/, ingredientId: 'condensed-milk', factor: 397 },
  { match: /^whippingcream|^cream$/, ingredientId: 'whipping-cream', factor: 1000 },
  { match: /^icecream/, ingredientId: 'ice-cream', factor: 1000 },
  { match: /^tonic/, ingredientId: 'tonic-water', factor: 100 },
  { match: /^complimentary/, ingredientId: 'complimentary-sparkling', factor: 1000 },
  { match: /^hibiscus(flowers?)?(dry)?$/, ingredientId: 'hibiscus-flowers', factor: 100 },
  { match: /^sugarsyrup/, ingredientId: 'syrup-sugar', factor: 1000 },
  { match: /^grapefruit/, ingredientId: 'syrup-grapefruit', factor: 1000 },
  { match: /^grenadine/, ingredientId: 'syrup-grenadine', factor: 1000 },
  { match: /^orangejuice|^oj$/, ingredientId: 'orange-juice', factor: 1000 },
  { match: /^vanil+asyrup|^vanil+a$/, ingredientId: 'syrup-vanilla', factor: 1 },
  { match: /^hazelnutsyrup|^hazelnut$/, ingredientId: 'syrup-hazelnut', factor: 1 },
  { match: /^strawberrysyrup/, ingredientId: 'syrup-strawberry', factor: 1 },
  { match: /^saltedcaramel/, ingredientId: 'syrup-salted-caramel', factor: 1 },
  { match: /^peachsyrup/, ingredientId: 'syrup-peach', factor: 1 },
  { match: /^lemonsquash/, ingredientId: 'lemon-squash', factor: 1 },
  { match: /^matcha$/, ingredientId: 'matcha', factor: 1 },
  { match: /^chocolatepowder|^chocopowder|^cocoa/, ingredientId: 'chocolate-powder', factor: 1 },
  { match: /^toffee(frappe)?powder|^frappe/, ingredientId: 'toffee-frappe-powder', factor: 1 },
  { match: /^earlgrey/, ingredientId: 'tea-earl-grey', factor: 1 },
  { match: /^milkyoolong/, ingredientId: 'tea-milky-oolong', factor: 1 },
  { match: /^strawberrykiwi/, ingredientId: 'tea-strawberry-kiwi', factor: 1 },
  { match: /^peach(ice)?tea/, ingredientId: 'tea-peach', factor: 1 },
  { match: /^nitro/, ingredientId: 'nitro-cartridge', factor: 1 },
  { match: /^v60filter|^filterpaper|^filter$/, ingredientId: 'v60-filter', factor: 1 },
  { match: /^brownie$/, ingredientId: 'kit-brownie', factor: 1 },
  // No longer used: removed from every recipe
  { match: /^driedorange/, ingredientId: null, factor: 0 },
];

/** Lower case letters and digits only: "Ice RAF (Large)" -> "iceraflarge". */
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------- take-away packaging

const PET = [{ ingredientId: 'cup-12oz-pet', qty: 1 }, { ingredientId: 'lid-flat', qty: 1 }, { ingredientId: 'straw', qty: 1 }];
const P12 = [{ ingredientId: 'cup-12oz-paper', qty: 1 }, { ingredientId: 'lid-flip', qty: 1 }];
const P8 = [{ ingredientId: 'cup-8oz', qty: 1 }, { ingredientId: 'lid-flip', qty: 1 }];
const P6 = [{ ingredientId: 'cup-6oz', qty: 1 }, { ingredientId: 'lid-black', qty: 1 }];
const P4 = [{ ingredientId: 'cup-4oz', qty: 1 }, { ingredientId: 'lid-black', qty: 1 }];

const pack = (names: string[], p: { ingredientId: string; qty: number }[]) => names.map((n) => [n, p] as const);
export const TAKEAWAY: Map<string, { ingredientId: string; qty: number }[]> = new Map(
  [
    ...pack(['Ice Latte', 'Ice Spanish Latte', 'Iced Spanish Latte', 'Ice Matcha Latte', 'Ice Long Black', 'Cold Brew', 'Ice V60',
      'Shaken Ice Tea (Peach)', 'Shaken Ice Tea (Strawberry/Kiwi)', 'Ice Matcha Strawberry', 'Fizzie', 'Ice RAF', 'Matcha Grey', 'Bumble',
      'Nitro Cold Brew', 'Ice Toffee Coffee', 'Hibiscus Fizz', 'Hibiscus Iced', 'Espresso Sour', 'Ice Belgian Mocha', 'Affogato',
      'Matcha Affogato', 'Ice Chocolate', 'Choco Toffee'], PET),
    ...pack(['Latte', 'Spanish Latte', 'Matcha Latte', 'Mocha Belgian', 'Latte Macchiato'], P12),
    ...pack(['Cappuccino', 'Cappucino', 'Long Black', 'V60', 'RAF', 'Milky Oolong', 'Earl Grey Tea Special', 'Toffee Coffee', 'Hot Chocolate',
      'AeroPress', 'Babyccino'], P8),
    ...pack(['Flat White', 'Cortado', 'Lungo'], P6),
    ...pack(['Espresso', 'Macchiato', 'Piccolo', 'Ristretto'], P4),
  ].map(([n, p]) => [norm(n), p]),
);

/** The separate "+ Size cold drink" item swaps one 12oz clear cup for a 16oz one on take-away. */
export const SIZE_COLD_DRINK = norm('+ Size cold drink');

// ---------------------------------------------------------------- modifier rules

/** Milk in one cup: every dine-in cup 214 ml; take-away Latte family and Cappuccino Large 322 ml. */
export const MILK_ML = 214;
export const MILK_LARGE = 322;
/** Milk drinks that keep their own milk amount (not 214). */
export const MILK_EXCEPTIONS = ['Matcha Grey', 'Babyccino'];
/** Spanish Latte condensed milk: dine-in 25 g, take-away 35 g. */
export const SPANISH_CONDENSED = 25;
export const SPANISH_CONDENSED_TAKEAWAY = 35;
/** Hot lattes (all kinds, incl. Latte Macchiato) are 322 ml take-away. Iced ones stay 214. */
export const isHotLatte = (name: string) => /latte/i.test(name) && !/^ice/i.test(name.trim());

/**
 * "+ Size cold drink" (16oz clear cup): what the iced drink on the same receipt uses on top.
 * Iced coffee and matcha get theirs from the "Matcha or Coffee" choice on the size item (rules below).
 */
export const SIZE_EXTRAS: { match: RegExp; extraMilk?: number; coffee?: number; matcha?: number; tea?: number; pumps?: number }[] = [
  { match: /^shakenicetea/, tea: 4, pumps: 2 },
];

const now = () => new Date().toISOString();
const rule = (group: string, option: string, effects: ModifierRule['effects'], note: string | null = null): ModifierRule => ({
  id: `mod-${norm(group) || 'any'}-${norm(option) || 'any'}`, group, option, effects, note, updatedBy: 'Starting rules', updatedAt: now(),
});

const MILKS: [string, string][] = [
  ['Soy', 'milk-soy'], ['Almond', 'milk-almond'], ['Oat', 'milk-oat'], ['Coconut', 'milk-coconut'],
  ['Low Fat', 'milk-low-fat'], ['Full Fat', 'milk-full-fat'], ['Lactose Free', 'milk-lactose-free'],
];
const BEANS: [string, string][] = [
  ['Brazil', 'bean-brazil'], ['Ethiopia', 'bean-ethiopia'], ['Colombia (Watermelon)', 'bean-colombia-watermelon'],
  ['Ethiopia Sidamo (Filter)', 'bean-sidamo'],
];
const CLASSIC = ['Espresso', 'Long Black', 'Cappuccino', 'Flat White', 'Latte', 'Spanish Latte', 'Hibiscus', 'Affogato', 'Ice Long Black',
  'Iced Spanish Latte', 'Ice Latte', 'Matcha Latte', 'Ice Matcha Latte', 'Mocha Belgian'];

export const START_MODIFIER_RULES: ModifierRule[] = [
  ...MILKS.map(([o, id]) => rule('Alternative Milk', o, [{ type: 'milk', ingredientId: id }])),
  ...BEANS.map(([o, id]) => rule('Beans', o, [{ type: 'bean', ingredientId: id }])),
  rule('Extra Shot', 'Brazil', [{ type: 'add', qty: 18, ingredientId: 'bean-brazil' }]),
  rule('Extra Shot', 'Ethiopia', [{ type: 'add', qty: 18, ingredientId: 'bean-ethiopia' }]),
  rule('Extra Shot', 'Extra Shot (Brazil)', [{ type: 'add', qty: 18, ingredientId: 'bean-brazil' }]),
  rule('Extra Shot', 'Extra Shot (Ethiopia)', [{ type: 'add', qty: 18, ingredientId: 'bean-ethiopia' }]),
  rule('Extra Shot', 'Matcha', [{ type: 'add', qty: 3, ingredientId: 'matcha' }]),
  rule('Syrup', 'Salted Caramel (3pmp)', [{ type: 'add', qty: 30, ingredientId: 'syrup-salted-caramel' }]),
  rule('Syrup', 'Hazelnut (3pmp)', [{ type: 'add', qty: 30, ingredientId: 'syrup-hazelnut' }]),
  rule('Syrup', 'Vanilla (3pmp)', [{ type: 'add', qty: 30, ingredientId: 'syrup-vanilla' }]),
  rule('Syrup', 'Extra Pump (1pmp)', [{ type: 'spread', qty: 10, among: ['syrup-salted-caramel', 'syrup-hazelnut', 'syrup-vanilla'] }],
    'Syrup not known: 10 ml shared across the syrups in line with how often each is chosen.'),
  rule('Syrup', 'Chocolate Powder (>5g)', [{ type: 'add', qty: 15, ingredientId: 'chocolate-powder' }]),
  rule('*', 'Cappucino Large', [{ type: 'add', qty: MILK_LARGE - MILK_ML, role: 'milk' }, { type: 'swapCup', from: 'cup-8oz', to: 'cup-12oz-paper' }]),
  rule('*', 'RAF Large', [{ type: 'add', qty: 50, role: 'milk' }, { type: 'swapCup', from: 'cup-8oz', to: 'cup-12oz-paper' }]),
  rule('*', 'Toffee Coffee Large', [{ type: 'add', qty: 50, role: 'milk' }, { type: 'swapCup', from: 'cup-8oz', to: 'cup-12oz-paper' }]),
  rule('*', 'Flat White Large 8oz', [{ type: 'swapCup', from: 'cup-6oz', to: 'cup-8oz' }, { type: 'swapCup', from: 'lid-black', to: 'lid-flip' }]),
  rule('Extra Pump RAF/TOFFEE', '1', [{ type: 'add', qty: 10, byItem: { raf: 'syrup-vanilla', toffee: 'syrup-hazelnut' } }]),
  rule('Extra Pump RAF/TOFFEE', '2', [{ type: 'add', qty: 20, byItem: { raf: 'syrup-vanilla', toffee: 'syrup-hazelnut' } }]),
  rule('Ice Tea Sweetner', '*', [{ type: 'add', qty: 25, byItem: { peach: 'syrup-peach', strawberry: 'syrup-strawberry' } }]),
  rule('Croissant', 'Chocolate', [{ type: 'add', qty: 1, ingredientId: 'kit-chocolate-croissant' }]),
  rule('Croissant', 'Almond', [{ type: 'add', qty: 1, ingredientId: 'kit-almond-croissant' }]),
  rule('Croissant', 'Raisin/Cinnamon Swirl', [{ type: 'add', qty: 1, ingredientId: 'kit-cinnamon-swirl' }]),
  rule('Croissant', 'Plain', [{ type: 'add', qty: 1, ingredientId: 'kit-plain-croissant' }]),
  ...CLASSIC.map((o) => rule('Classic Coffee', o, [{ type: 'recipeOf' }])),
  rule('Matcha or Coffee', 'Coffee', [{ type: 'add', qty: 18, role: 'coffee' }, { type: 'add', qty: 300 - MILK_ML, role: 'milk' }]),
  rule('Matcha or Coffee', 'Matcha', [{ type: 'add', qty: 3, ingredientId: 'matcha' }, { type: 'add', qty: 312 - MILK_ML, role: 'milk' }]),
];

// ---------------------------------------------------------------- recipe corrections from Rimma

/** Espresso-based drinks use 18 g; filter drinks (V60, Ice V60, AeroPress) use 20 g. */
export const COFFEE_GRAMS = 18;
export const FILTER_GRAMS = 20;
export const FILTER_DRINKS = ['V60', 'Ice V60', 'AeroPress'];
/** Drinks whose default beans are Ethiopia (everything else defaults to Brazil). Filter drinks too. */
export const ETHIOPIA_DEFAULT = ['Espresso', 'Long Black', 'Ice Long Black', 'Americano', 'Ice Americano', ...FILTER_DRINKS];
/** One nitrogen cartridge makes 1 L of nitro cold brew; a serving is 330 ml. */
export const NITRO_PER_SERVING = 0.33;
export const COLD_BREW_GRAMS = 32;
/** Coffee drinks that must have the coffee grams even if Loyverse has none. */
export const COFFEE_DRINKS = ['Espresso', 'Long Black', 'Lungo', 'Macchiato', 'Cortado', 'Piccolo', 'Latte Macchiato', 'V60', 'AeroPress', 'Ristretto',
  'Cappuccino', 'Cappucino', 'Flat White', 'Latte', 'Spanish Latte', 'Ice Latte', 'Ice Spanish Latte', 'Iced Spanish Latte', 'Ice Long Black', 'Ice V60',
  'RAF', 'Ice RAF', 'Toffee Coffee', 'Ice Toffee Coffee', 'Mocha Belgian', 'Ice Belgian Mocha', 'Affogato', 'Espresso Sour'];
export const COLD_BREWS = ['Cold Brew', 'Nitro Cold Brew'];
export const BUNDLES: [string, string][] = [
  ['Coffee and Cookie', 'kit-nutella-cookie'], ['Coffee and Ferrero Tart', ''], ['Coffee and Lemon Cake', 'kit-lemon-cake'],
  ['Coffee and Brownie', 'kit-brownie'], ['Coffee and Truffles', 'kit-coconut-truffles'],
];
export const BEAN_BAGS = ['Brazil 250g', 'Ethiopia 250g'];

/** Recipes set exactly by Rimma. Replace whatever Loyverse has. */
export const FIXED_RECIPES: Record<string, RecipeLine[]> = {
  'Hibiscus Iced': [{ ingredientId: 'hibiscus-flowers', qty: 9.6 }, { ingredientId: 'syrup-sugar', qty: 36 }],
  'Hibiscus Fizz': [{ recipeOf: 'Hibiscus Iced', qty: 0.1 }, { ingredientId: 'tonic-water', qty: 100 }, { ingredientId: 'lemon-squash', qty: 30 }, { ingredientId: 'syrup-hazelnut', qty: 10 }],
  'Matcha Grey': [{ ingredientId: 'milk-coconut', qty: 250, role: 'milk' }, { ingredientId: 'matcha', qty: 3 }, { ingredientId: 'tea-earl-grey', qty: 3 }, { ingredientId: 'condensed-milk', qty: 12 }],
  'Salted Brownie': [{ ingredientId: 'kit-brownie', qty: 1 }, { ingredientId: 'ice-cream', qty: 60 }],
  'Shaken Ice Tea (Peach)': [{ ingredientId: 'tea-peach', qty: 4 }],
  'Shaken Ice Tea (Strawberry/Kiwi)': [{ ingredientId: 'tea-strawberry-kiwi', qty: 4 }],
  'Breakfast Set': [],
  '+ Size cold drink': [],
};

/** Single ingredient amounts Rimma corrected: [item, ingredient, amount] (0 removes it). */
export const SET_AMOUNTS: [string, string, number][] = [
  ['Ice RAF', 'syrup-vanilla', 30],
  ['Fizzie', 'syrup-sugar', 0],
  ['Mocha Belgian', 'condensed-milk', 15],
  ['Ice Belgian Mocha', 'condensed-milk', 15],
  ['Bumble', 'orange-juice', 200],
];
