/**
 * Starting recipes: Loyverse components converted to g / ml / pieces, then Rimma's corrections.
 * Runs once (and later only for new items). Existing recipes the owner edited are kept.
 */
import type { CountItem, Ingredient, Recipe, RecipeLine } from '../types';
import {
  BEAN_BAGS, BUNDLES, COFFEE_DRINKS, COFFEE_GRAMS, COLD_BREWS, COLD_BREW_GRAMS, ETHIOPIA_DEFAULT, FILTER_DRINKS, FILTER_GRAMS, FIXED_RECIPES, LOYVERSE_INGREDIENTS, SET_AMOUNTS, TAKEAWAY, norm,
} from './catalog';

export interface LyItem {
  id: string;
  name: string;
  category: string | null;
  isComposite: boolean;
  components: { variantId: string; qty: number }[];
  variantIds: string[];
}

export interface ImportResult {
  recipes: Recipe[];
  /** Plain-language notes for the owner: what could not be matched. */
  notes: string[];
}

/** Every kitchen count item is also an ingredient sold one piece at a time. */
export function pieceIngredients(items: CountItem[]): Ingredient[] {
  return items
    .filter((i) => i.area === 'Kitchen' && i.section !== 'Track only')
    .map((i, k) => ({ id: i.id, name: i.name, unit: 'pcs' as const, countFrom: i.id, limitPct: 0, note: null, active: i.active, sort: 1000 + k }));
}

const PIECE_CATEGORY = /sandwich|dessert|croissant|pastr|bakery|cake|cookie|salad|snack|water|juice|soft ?drink|food/i;
const WORD_FIX: Record<string, string> = { sandwhich: 'sandwich', mozarella: 'mozzarella', 'cinnamon': 'cinnamon', butter: 'plain' };
const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['the', 'and', 'with'].includes(w)).map((w) => WORD_FIX[w] ?? w);

/** Closest ingredient by shared words (e.g. "Falafel Sandwhich" -> "Falafel sandwich"). */
export function bestMatch(name: string, candidates: Ingredient[]): Ingredient | null {
  const a = new Set(words(name));
  let best: Ingredient | null = null;
  let score = 0;
  for (const c of candidates) {
    const b = new Set(words(c.name));
    const shared = [...a].filter((w) => b.has(w)).length;
    const s = shared / Math.max(1, Math.min(a.size, b.size));
    if (s > score) { score = s; best = c; }
  }
  return score >= 0.6 ? best : null;
}

const has = (list: string[], item: string) => list.some((n) => norm(n) === norm(item));

/**
 * Loyverse items that are only ingredients (Coffee, Milk, Vanilla syrup...), not things sold.
 * An item sold as a piece (e.g. Brownie in Desserts) is still a menu item.
 */
export function isIngredientOnly(it: { name: string; category: string | null; isComposite?: boolean }): boolean {
  if (it.isComposite) return false;
  if (!LOYVERSE_INGREDIENTS.some((m) => m.match.test(norm(it.name)))) return false;
  return !PIECE_CATEGORY.test(it.category ?? '');
}

export function importRecipes(items: LyItem[], ingredients: Ingredient[], by = 'Imported from Loyverse'): ImportResult {
  const notes: string[] = [];
  const byVariant = new Map<string, LyItem>();
  for (const it of items) for (const v of it.variantIds) byVariant.set(v, it);
  const pieceCandidates = ingredients.filter((i) => i.unit === 'pcs');
  const missing = new Set<string>();
  const at = new Date().toISOString();

  const recipes: Recipe[] = [];
  for (const it of items) {
    if (isIngredientOnly(it)) continue;
    let lines: RecipeLine[] = [];
    let ignoreGroups: string[] = [];
    let note: string | null = null;

    if (it.isComposite) {
      for (const c of it.components) {
        const comp = byVariant.get(c.variantId);
        if (!comp) continue;
        if (comp.isComposite) { lines.push({ recipeOf: comp.name, qty: c.qty }); continue; }
        const m = LOYVERSE_INGREDIENTS.find((x) => x.match.test(norm(comp.name)));
        if (m) {
          if (m.ingredientId) lines.push({ ingredientId: m.ingredientId, qty: Math.round(c.qty * m.factor * 1000) / 1000, ...(m.role ? { role: m.role } : {}) });
          continue;
        }
        const p = bestMatch(comp.name, pieceCandidates);
        if (p) lines.push({ ingredientId: p.id, qty: c.qty });
        else missing.add(comp.name);
      }
    } else if (PIECE_CATEGORY.test(it.category ?? '') || PIECE_CATEGORY.test(it.name)) {
      const p = bestMatch(it.name, pieceCandidates);
      if (p) lines = [{ ingredientId: p.id, qty: 1 }];
      else note = 'Sold as a piece, but no matching count item. Pick the ingredient.';
    }

    // ---- Rimma's corrections
    const fixed = Object.entries(FIXED_RECIPES).find(([n]) => norm(n) === norm(it.name));
    if (fixed) lines = fixed[1].map((l) => ({ ...l }));
    const coffee = has(COLD_BREWS, it.name) ? COLD_BREW_GRAMS : has(FILTER_DRINKS, it.name) ? FILTER_GRAMS : COFFEE_GRAMS;
    const bean = has(ETHIOPIA_DEFAULT, it.name) ? 'bean-ethiopia' : 'bean-brazil';
    lines = lines.map((l) => (l.role === 'coffee' ? { ...l, qty: coffee, ingredientId: bean } : l));
    if ((has(COFFEE_DRINKS, it.name) || has(COLD_BREWS, it.name)) && !lines.some((l) => l.role === 'coffee'))
      lines.unshift({ ingredientId: bean, role: 'coffee', qty: coffee });
    for (const [n, id, qty] of SET_AMOUNTS) {
      if (norm(n) !== norm(it.name)) continue;
      const l = lines.find((x) => x.ingredientId === id);
      if (qty === 0) lines = lines.filter((x) => x.ingredientId !== id);
      else if (l) l.qty = qty;
      else lines.push({ ingredientId: id, qty });
    }
    const bundle = BUNDLES.find(([n]) => norm(n) === norm(it.name));
    if (bundle) {
      lines = [{ ingredientId: 'bean-brazil', role: 'coffee', qty: COFFEE_GRAMS }];
      if (bundle[1]) lines.push({ ingredientId: bundle[1], qty: 1 });
      else note = 'Pick the dessert piece for this bundle.';
      ignoreGroups = ['Classic Coffee'];
    }
    if (norm(it.name) === norm('Breakfast Set')) note = 'Uses the full recipe of the coffee chosen plus 1 croissant of the type chosen.';
    if (has(BEAN_BAGS, it.name)) { lines = []; note = 'Bag of beans for sale: not taken from bar bean stock.'; }

    recipes.push({
      id: it.id, itemName: it.name, lines, takeaway: TAKEAWAY.get(norm(it.name))?.map((p) => ({ ...p })) ?? [],
      ignoreGroups, note, updatedBy: by, updatedAt: at,
    });
  }
  if (missing.size) notes.push(`These Loyverse ingredients have no match yet, so they were left out: ${[...missing].join(', ')}.`);
  const named = new Set(items.map((i) => norm(i.name)));
  const notFound = [...Object.keys(FIXED_RECIPES), ...COLD_BREWS, ...BUNDLES.map((b) => b[0]), ...BEAN_BAGS].filter((n) => !named.has(norm(n)));
  if (notFound.length) notes.push(`Corrections for items not found in Loyverse under these names: ${[...new Set(notFound)].join(', ')}.`);
  return { recipes, notes };
}
