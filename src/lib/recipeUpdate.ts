/**
 * One-time update of the LIVE recipes and choice rules with Arsen's answers (9 Nov 2026).
 * Live recipes are data in Supabase, so changing catalog.ts alone does not change them.
 * The owner presses one button on the Recipes page; this works out what to save.
 */
import type { ModifierRule, Recipe } from '../types';
import {
  COFFEE_GRAMS, COLD_BREWS, ETHIOPIA_DEFAULT, FILTER_DRINKS, FILTER_GRAMS, NITRO_PER_SERVING, START_MODIFIER_RULES, norm,
} from './catalog';

/** Ids of the starting rules this update adds or replaces. */
const RULE_IDS = new Set([
  'mod-extrashot-brazil', 'mod-extrashot-ethiopia', 'mod-extrashot-extrashotbrazil', 'mod-extrashot-extrashotethiopia', 'mod-beans-colombiafilter', 'mod-beans-ethiopiasidamofilter',
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
    if (changed) out.push({ ...r, lines, updatedBy: by, updatedAt: at });
  }
  return out;
}
