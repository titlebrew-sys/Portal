import raw from './seed.json';
import type { AppData, CountItem, CountRow, CountSession, Rule, StockBook, Supplier, WasteRow } from '../types';
import { START_INGREDIENTS, START_MODIFIER_RULES } from '../lib/catalog';
import { importRecipes, pieceIngredients } from '../lib/importRecipes';
import { DEMO_LY_ITEMS } from './demoLoyverse';
import { addDays } from '../lib/time';

interface SeedCount {
  day: number;
  shift: number;
  itemId: string;
  qty: number | null;
  oldQty?: number | null;
  newQty?: number | null;
  frozenQty?: number | null;
  expOld?: number | null;
  expNew?: number | null;
}

export const seedItems = raw.items as CountItem[];
export const seedSuppliers = raw.suppliers as Supplier[];
export const seedRules = raw.rules as Rule[];
export const seedLpoNext = raw.lpoNext;

/** Dubai 16:00 on a date as an ISO timestamp. */
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+04:00`).toISOString();

/**
 * Demo data: the prototype's 5 Nov counts, moved so that "5 Nov" is today.
 * Used only when Supabase is not connected yet.
 */
export function demoData(today: string): AppData {
  const d = (n: number | null | undefined) => (n === null || n === undefined ? null : addDays(today, n));
  const counts: CountRow[] = (raw.demo.counts as SeedCount[]).map((c) => ({
    businessDate: addDays(today, c.day),
    shift: c.shift as 1 | 2,
    itemId: c.itemId,
    qty: c.qty,
    oldQty: c.oldQty ?? null,
    newQty: c.newQty ?? null,
    frozenQty: c.frozenQty ?? null,
    expOld: d(c.expOld),
    expNew: d(c.expNew),
    countedBy: 'Prototype data',
    savedAt: at(addDays(today, c.day), c.shift === 1 ? '16:00' : '21:00'),
  }));
  const sessions: CountSession[] = raw.demo.sessions.map((s) => ({
    businessDate: addDays(today, s.day),
    shift: s.shift as 1 | 2,
    area: s.area as CountSession['area'],
    savedBy: s.savedBy,
    savedAt: at(addDays(today, s.day), s.time),
    done: s.done,
    total: s.total,
  }));
  const waste: WasteRow[] = raw.demo.waste.map((w, i) => ({
    id: 'seed-waste-' + i,
    date: addDays(today, w.day),
    item: w.item,
    qty: w.qty,
    reason: w.reason as WasteRow['reason'],
    loggedBy: 'Prototype data',
  }));
  return {
    items: seedItems,
    suppliers: seedSuppliers,
    rules: seedRules,
    counts,
    sessions,
    orders: [],
    waste,
    sales: [],
    salesPeriod: null,
    lpoNext: seedLpoNext,
    book: demoBook(),
  };
}

/** Starting ingredients (shop list + kitchen pieces). */
export const startIngredients = () => [...START_INGREDIENTS, ...pieceIngredients(seedItems)];

/** Demo recipes: the demo Loyverse menu imported with Rimma's corrections. */
export function demoBook(): StockBook {
  const ingredients = startIngredients();
  return {
    ingredients,
    recipes: importRecipes(DEMO_LY_ITEMS, ingredients, 'Demo import').recipes,
    modifierRules: START_MODIFIER_RULES,
    loyverseItems: DEMO_LY_ITEMS.map((i) => ({ id: i.id, name: i.name, category: i.category })),
    syncRuns: [{ id: 'demo', kind: 'loyverse', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), receipts: 0, ok: true,
      message: 'Demo: made-up receipts, Loyverse is not connected yet', latestReceiptAt: null }],
  };
}
