/**
 * One-time update of the LIVE recipes and choice rules with Arsen's answers (9 Nov 2026).
 * Live recipes are data in Supabase, so changing catalog.ts alone does not change them.
 * The owner presses one button on the Recipes page; this works out what to save.
 */
import type { Ingredient, ModifierRule, Recipe } from '../types';
import {
  COFFEE_GRAMS, COLD_BREWS, ETHIOPIA_DEFAULT, FILTER_DRINKS, FILTER_GRAMS, MILK_EXCEPTIONS, MILK_LARGE, MILK_ML, NITRO_PER_SERVING, SPANISH_CONDENSED,
  SPANISH_CONDENSED_TAKEAWAY, START_MODIFIER_RULES, isHotLatte, norm,
} from './catalog';

/** Ids of the starting rules this update adds or replaces. */
const RULE_IDS = new Set([
  'mod-extrashot-brazil', 'mod-extrashot-ethiopia', 'mod-extrashot-extrashotbrazil', 'mod-extrashot-extrashotethiopia', 'mod-beans-ethiopiasidamofilter',
  'mod-any-cappucinolarge', 'mod-any-flatwhitelarge8oz', 'mod-matchaorcoffee-coffee', 'mod-matchaorcoffee-matcha',
]);

const has = (list: string[], name: string) => list.some((n) => norm(n) === norm(name));

/** Rules that are missing or different from the new starting rules. */
export function updateRules(existing: ModifierRule[], by: string): ModifierRule[] {
  const at = new Date().toISOString();
  return START_MODIFIER_RULES.filter((r) => RULE_IDS.has(r.id))
    .filter((r) => JSON.stringify(existing.find((e) => e.id === r.id)?.effects) !== JSON.stringify(r.effects))
    .map((r) => ({ ...r, updatedBy: by, updatedAt: at }));
}

/** Recipes changed by the update: coffee grams, default beans, nitro cartridge. */
export function updateRecipes(recipes: Recipe[], by: string): Recipe[] {
  const at = new Date().toISOString();
  const out: Recipe[] = [];
  for (const r of recipes) {
    let changed = false;
    let lines = r.lines.map((l) => {
      if (l.role !== 'coffee' || has(COLD_BREWS, r.itemName)) return l;
      const qty = has(FILTER_DRINKS, r.itemName) ? FILTER_GRAMS : COFFEE_GRAMS;
      const ingredientId = has(ETHIOPIA_DEFAULT, r.itemName) ? 'bean-ethiopia' : l.ingredientId;
      if (qty === l.qty && ingredientId === l.ingredientId) return l;
      changed = true;
      return { ...l, qty, ingredientId };
    });
    if (norm(r.itemName) === norm('Nitro Cold Brew') && !lines.some((l) => l.ingredientId === 'nitro-cartridge' && l.qty === NITRO_PER_SERVING)) {
      lines = [...lines.filter((l) => l.ingredientId !== 'nitro-cartridge'), { ingredientId: 'nitro-cartridge', qty: NITRO_PER_SERVING }];
      changed = true;
    }
    // Milk: 214 ml in every cup, except the special ones
    if (!has(MILK_EXCEPTIONS, r.itemName))
      lines = lines.map((l) => {
        if (l.role !== 'milk' || l.qty === MILK_ML) return l;
        changed = true;
        return { ...l, qty: MILK_ML };
      });
    let takeaway = r.takeaway;
    // Hot lattes: 322 ml take-away, so 108 ml more than in the cup
    if (isHotLatte(r.itemName) && lines.some((l) => l.role === 'milk') && !takeaway.some((p) => p.role === 'milk')) {
      takeaway = [...takeaway, { ingredientId: lines.find((l) => l.role === 'milk')!.ingredientId ?? 'milk-full-fat', qty: MILK_LARGE - MILK_ML, role: 'milk' }];
      changed = true;
    }
    // Spanish Latte condensed milk: 25 g dine-in, 35 g take-away
    if (norm(r.itemName) === norm('Spanish Latte')) {
      if (lines.some((l) => l.ingredientId === 'condensed-milk' && l.qty !== SPANISH_CONDENSED)) {
        lines = lines.map((l) => (l.ingredientId === 'condensed-milk' ? { ...l, qty: SPANISH_CONDENSED } : l));
        changed = true;
      }
      if (!takeaway.some((p) => p.ingredientId === 'condensed-milk')) {
        takeaway = [...takeaway, { ingredientId: 'condensed-milk', qty: SPANISH_CONDENSED_TAKEAWAY - SPANISH_CONDENSED }];
        changed = true;
      }
    }
    if (changed) out.push({ ...r, lines, takeaway, updatedBy: by, updatedAt: at });
  }
  return out;
}

/** Colombia (filter) beans are no longer stocked: hide the ingredient (history stays). */
export function updateIngredients(existing: Ingredient[]): Ingredient[] {
  return existing.filter((i) => i.id === 'bean-colombia-filter' && i.active).map((i) => ({ ...i, active: false }));
}
