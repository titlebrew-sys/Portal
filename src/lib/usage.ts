/**
 * What each sale used: turns a receipt line (item + choices + take-away) into grams,
 * millilitres and pieces of ingredients, each with a plain reason that can be shown.
 */
import type { Ingredient, ModifierEffect, ModifierRule, Receipt, Recipe, RecipeLine, SaleLine, SaleModifier } from '../types';
import { SIZE_COLD_DRINK, SIZE_EXTRAS, norm } from './catalog';

export interface Use {
  ingredientId: string;
  qty: number;
  why: string;
}

export interface LineUsage {
  receipt: string;
  at: string;
  businessDate: string;
  lineIdx: number;
  item: string;
  /** Choices on the line, e.g. "Oat, Brazil". */
  choices: string;
  qty: number;
  refund: boolean;
  takeaway: boolean;
  uses: Use[];
  /** True when the item has no recipe yet. */
  noRecipe: boolean;
}

export interface RecipeBook {
  ingredients: Map<string, Ingredient>;
  byId: Map<string, Recipe>;
  byName: Map<string, Recipe>;
  rules: ModifierRule[];
}

export function makeBook(ingredients: Ingredient[], recipes: Recipe[], rules: ModifierRule[]): RecipeBook {
  return {
    ingredients: new Map(ingredients.map((i) => [i.id, i])),
    byId: new Map(recipes.map((r) => [r.id, r])),
    byName: new Map(recipes.map((r) => [norm(r.itemName), r])),
    rules,
  };
}

export const isTakeaway = (dining: string | null) => !!dining && /take|away|out/i.test(dining);

export function findRecipe(book: RecipeBook, itemId: string | null, itemName: string): Recipe | undefined {
  return (itemId ? book.byId.get(itemId) : undefined) ?? book.byName.get(norm(itemName));
}

/** The rule for a choice: exact group and choice, then any choice in the group, then the choice in any group. */
export function findRule(book: RecipeBook, m: SaleModifier): ModifierRule | undefined {
  const g = norm(m.group);
  const o = norm(m.option);
  return (
    book.rules.find((r) => norm(r.group) === g && norm(r.option) === o) ??
    book.rules.find((r) => norm(r.group) === g && r.option === '*') ??
    book.rules.find((r) => r.group === '*' && norm(r.option) === o)
  );
}

const name = (book: RecipeBook, id: string) => book.ingredients.get(id)?.name ?? id;

interface Ctx {
  book: RecipeBook;
  milk: string | null;
  milkWhy: string;
  bean: string | null;
  beanWhy: string;
  uses: Use[];
  hasMilk: boolean;
}

function expand(ctx: Ctx, recipe: Recipe, factor: number, label: string, depth = 0) {
  if (depth > 4) return;
  for (const l of recipe.lines) addLine(ctx, l, factor, label, depth);
}

function addLine(ctx: Ctx, l: RecipeLine, factor: number, label: string, depth: number) {
  if (l.recipeOf) {
    const sub = ctx.book.byName.get(norm(l.recipeOf));
    if (sub) expand(ctx, sub, factor * l.qty, `${label}: ${fmt(l.qty)} of ${sub.itemName}`, depth + 1);
    return;
  }
  let id = l.ingredientId ?? '';
  let why = label;
  if (l.role === 'milk') {
    ctx.hasMilk = true;
    if (ctx.milk) { id = ctx.milk; why = `${label}, ${ctx.milkWhy}`; }
  } else if (l.role === 'coffee') {
    if (ctx.bean) { id = ctx.bean; why = `${label}, ${ctx.beanWhy}`; }
    else why = `${label} (Brazil unless another bean is chosen)`;
  }
  if (id && l.qty * factor) ctx.uses.push({ ingredientId: id, qty: l.qty * factor, why });
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Ingredient chosen for a role, falling back to the recipe's own milk or Brazil beans. */
function roleIngredient(ctx: Ctx, recipe: Recipe, role: 'milk' | 'coffee'): string {
  if (role === 'milk') return ctx.milk ?? recipe.lines.find((l) => l.role === 'milk')?.ingredientId ?? 'milk-full-fat';
  return ctx.bean ?? 'bean-brazil';
}

/** Usage for one receipt line, before multiplying by quantity. */
export function lineUses(book: RecipeBook, line: Pick<SaleLine, 'itemId' | 'itemName' | 'modifiers'>, takeaway: boolean): { uses: Use[]; noRecipe: boolean } {
  const recipe = findRecipe(book, line.itemId, line.itemName);
  if (!recipe) return { uses: [], noRecipe: true };
  const ignore = new Set(recipe.ignoreGroups.map(norm));
  const mods = line.modifiers.filter((m) => !ignore.has(norm(m.group)));
  const found = mods.map((m) => ({ m, r: findRule(book, m) }));
  const ctx: Ctx = { book, milk: null, milkWhy: '', bean: null, beanWhy: '', uses: [], hasMilk: false };
  for (const { m, r } of found)
    for (const e of r?.effects ?? []) {
      if (e.type === 'milk') { ctx.milk = e.ingredientId; ctx.milkWhy = `${m.option} chosen`; }
      if (e.type === 'bean') { ctx.bean = e.ingredientId; ctx.beanWhy = `${m.option} beans chosen`; }
    }

  expand(ctx, recipe, 1, recipe.itemName);
  let pack = takeaway ? recipe.takeaway.map((p) => ({ ...p })) : [];
  const swaps: { from: string; to: string }[] = [];
  // Chosen drinks first (Breakfast Set + Classic Coffee), so their milk counts as the drink's milk.
  for (const { m, r } of found)
    if (r?.effects.some((e) => e.type === 'recipeOf')) {
      const sub = book.byName.get(norm(m.option));
      if (sub) {
        expand(ctx, sub, 1, `${recipe.itemName} with ${sub.itemName}`);
        if (takeaway) pack = pack.concat(sub.takeaway.map((p) => ({ ...p })));
      }
    }

  for (const { m, r } of found) {
    const choice = `${m.group}: ${m.option}`;
    for (const e of (r?.effects ?? []) as ModifierEffect[]) {
      if (e.type === 'milk' && !ctx.hasMilk) {
        ctx.uses.push({ ingredientId: e.ingredientId, qty: 50, why: `${m.option} chosen on a drink without milk: 50 ml splash` });
      } else if (e.type === 'add') {
        let id = e.ingredientId;
        if (e.byItem) id = Object.entries(e.byItem).find(([k]) => norm(recipe.itemName).includes(norm(k)))?.[1];
        if (!id && e.role) id = roleIngredient(ctx, recipe, e.role);
        if (id) ctx.uses.push({ ingredientId: id, qty: e.qty, why: `Choice ${choice}` });
      } else if (e.type === 'spread') {
        ctx.uses.push({ ingredientId: SPREAD + e.among.join(','), qty: e.qty, why: `Choice ${choice}` });
      } else if (e.type === 'swapCup') swaps.push({ from: e.from, to: e.to });
    }
  }
  for (const s of swaps) {
    const p = pack.find((x) => x.ingredientId === s.from);
    if (p) p.ingredientId = s.to;
  }
  for (const p of pack) {
    const id = p.role === 'milk' ? roleIngredient(ctx, recipe, 'milk') : p.ingredientId;
    ctx.uses.push({ ingredientId: id, qty: p.qty, why: p.role === 'milk' ? 'Take-away, larger cup: more milk' : 'Take-away' });
  }
  return { uses: ctx.uses, noRecipe: false };
}

const SPREAD = '__spread:';

/** Usage for receipts. Cancelled receipts are skipped; refunds give usage back. */
export function receiptUsage(book: RecipeBook, receipts: Receipt[]): LineUsage[] {
  const out: LineUsage[] = [];
  for (const r of receipts) {
    if (r.cancelled) continue;
    const takeaway = isTakeaway(r.dining);
    const sign = r.type === 'REFUND' ? -1 : 1;
    const rows: LineUsage[] = r.lines.map((l) => {
      const { uses, noRecipe } = lineUses(book, l, takeaway);
      return {
        receipt: r.number, at: r.at, businessDate: r.businessDate, lineIdx: l.idx, item: l.itemName,
        choices: l.modifiers.map((m) => m.option).join(', '), qty: l.qty, refund: sign < 0, takeaway, noRecipe,
        uses: uses.map((u) => ({ ...u, qty: u.qty * l.qty * sign, why: sign < 0 ? `Refund: ${u.why}` : u.why })),
      };
    });
    addSizeExtras(r, rows);
    // "+ Size cold drink" on take-away: one 12oz clear cup becomes a 16oz clear cup per size item.
    if (takeaway) {
      let sizes = r.lines.filter((l) => norm(l.itemName) === SIZE_COLD_DRINK).reduce((a, l) => a + l.qty, 0);
      for (const row of rows)
        for (const u of row.uses)
          if (sizes > 0 && u.ingredientId === 'cup-12oz-pet' && u.qty > 0) {
            const n = Math.min(sizes, u.qty);
            sizes -= n;
            if (n === u.qty) { u.ingredientId = 'cup-16oz-pet'; u.why = 'Take-away, bigger cup (+ Size cold drink)'; }
            else { u.qty -= n; row.uses.push({ ingredientId: 'cup-16oz-pet', qty: n, why: 'Take-away, bigger cup (+ Size cold drink)' }); }
          }
    }
    out.push(...rows);
  }
  return resolveSpread(out);
}

/** "+ Size cold drink": the iced drink on the receipt gets more milk, coffee, matcha, tea or syrup. */
function addSizeExtras(r: Receipt, rows: LineUsage[]) {
  let sizes = r.lines.filter((l) => norm(l.itemName) === SIZE_COLD_DRINK).reduce((a, l) => a + l.qty, 0);
  for (const row of rows) {
    const x = SIZE_EXTRAS.find((e) => e.match.test(norm(row.item)));
    if (!x || sizes <= 0 || row.refund) continue;
    const n = Math.min(sizes, row.qty) / row.qty; // per drink in this line
    sizes -= Math.min(sizes, row.qty);
    const sign = 1;
    const per = (id: string | undefined, q: number, why: string) => { if (id && q) row.uses.push({ ingredientId: id, qty: q * n * row.qty * sign, why }); };
    const find = (prefix: string) => row.uses.find((u) => u.ingredientId.startsWith(prefix))?.ingredientId;
    const why = '+ Size cold drink';
    if (x.tea) per(find('tea-'), x.tea, `${why}: one more serving`);
    if (x.pumps) per(find('syrup-'), x.pumps * 10, `${why}: 2 more pumps of sweetener`);
  }
}

/**
 * "Extra pump" with an unknown syrup: shared across the listed syrups in line with how much
 * of each was used by the other sales in the same period (equal shares if none).
 */
function resolveSpread(rows: LineUsage[]): LineUsage[] {
  const totals = new Map<string, number>();
  for (const r of rows) for (const u of r.uses) if (!u.ingredientId.startsWith(SPREAD)) totals.set(u.ingredientId, (totals.get(u.ingredientId) ?? 0) + u.qty);
  for (const r of rows) {
    const next: Use[] = [];
    for (const u of r.uses) {
      if (!u.ingredientId.startsWith(SPREAD)) { next.push(u); continue; }
      const among = u.ingredientId.slice(SPREAD.length).split(',');
      const w = among.map((id) => Math.max(0, totals.get(id) ?? 0));
      const sum = w.reduce((a, b) => a + b, 0);
      among.forEach((id, i) => {
        const share = sum > 0 ? w[i] / sum : 1 / among.length;
        if (share > 0) next.push({ ingredientId: id, qty: u.qty * share, why: `${u.why} (${Math.round(share * 100)}% share)` });
      });
    }
    r.uses = next;
  }
  return rows;
}

/** Total used per ingredient. */
export function totalsByIngredient(rows: LineUsage[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) for (const u of r.uses) m.set(u.ingredientId, (m.get(u.ingredientId) ?? 0) + u.qty);
  return m;
}

// ---------------------------------------------------------------- sentences

export const amount = (qty: number, unit: string) => {
  const v = Math.round(qty * 100) / 100;
  return unit === 'pcs' ? `${v} ${v === 1 ? 'piece' : 'pieces'}` : `${v} ${unit}`;
};

export function recipeSentence(recipe: Recipe, book: RecipeBook): string {
  const parts = recipe.lines.map((l) => {
    if (l.recipeOf) return `${fmt(l.qty)} of the ${l.recipeOf} recipe`;
    const ing = book.ingredients.get(l.ingredientId ?? '');
    const a = amount(l.qty, ing?.unit ?? '');
    if (l.role === 'milk') return `${a} ${ing?.name.toLowerCase() ?? 'milk'} (or the milk chosen)`;
    if (l.role === 'coffee') return `${a} coffee (${ing?.name ?? 'Brazil beans'} unless another bean is chosen)`;
    return `${a} ${ing?.name.toLowerCase() ?? l.ingredientId}`;
  });
  const body = parts.length ? parts.join(', ') : 'uses no stock';
  const extra = recipe.ignoreGroups.length ? ` Ignores the ${recipe.ignoreGroups.join(', ')} choice.` : '';
  return `${recipe.itemName}: ${body}.${extra}`;
}

export function takeawaySentence(recipe: Recipe, book: RecipeBook): string {
  if (!recipe.takeaway.length) return '';
  return 'Take-away: ' + recipe.takeaway.map((p) => `${p.qty} ${name(book, p.ingredientId).toLowerCase()}`).join(', ') + '.';
}

export function ruleSentence(rule: ModifierRule, book: RecipeBook): string {
  const who = `${rule.group === '*' ? '' : rule.group + ': '}${rule.option === '*' ? 'any choice' : rule.option}`;
  const parts = rule.effects.map((e) => {
    switch (e.type) {
      case 'milk': return `uses ${name(book, e.ingredientId).toLowerCase()} instead of the drink's milk (50 ml splash if the drink has no milk)`;
      case 'bean': return `coffee comes from ${name(book, e.ingredientId)}`;
      case 'add': {
        const unitOf = (id?: string) => book.ingredients.get(id ?? '')?.unit ?? (e.role === 'milk' ? 'ml' : 'g');
        if (e.byItem) return `adds ${Object.entries(e.byItem).map(([k, id]) => `${amount(e.qty, unitOf(id))} ${name(book, id).toLowerCase()} on ${k} drinks`).join(', ')}`;
        if (e.role) return `adds ${amount(e.qty, e.role === 'milk' ? 'ml' : 'g')} ${e.role === 'milk' ? 'of the drink’s milk' : 'coffee from the bean chosen'}`;
        return `adds ${amount(e.qty, unitOf(e.ingredientId))} ${name(book, e.ingredientId ?? '').toLowerCase()}`;
      }
      case 'spread': return `adds ${e.qty} ml syrup, shared across ${e.among.map((id) => name(book, id).toLowerCase()).join(', ')} by how often each is chosen`;
      case 'recipeOf': return `uses the full recipe of the drink chosen`;
      case 'swapCup': return `take-away uses ${name(book, e.to).toLowerCase()} instead of ${name(book, e.from).toLowerCase()}`;
      default: return 'uses nothing extra';
    }
  });
  return `${who}: ${parts.join('; ')}.`;
}
