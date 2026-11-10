/**
 * Live mode: Supabase database and login.
 * The two values it needs come from Vercel's Environment Variables, never from this code:
 *   VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * The anon key is safe in a browser: the row-level security in supabase/schema.sql decides
 * who can read and change what.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppData, ColdBrewRow, CountItem, CountRow, Ingredient, ModifierRule, Order, Receipt, Recipe, RecipeChange, Rule, SalesReport, SalesRow, SheetOrders, StockBook, Supplier, SyncRun, WasteRow } from '../types';
import type { LyItem } from '../lib/importRecipes';
import type { LiveSales } from '../types';
import type { Auth, Store } from './store';
import { seedItems, seedLpoNext, seedRules, seedSuppliers } from './seed';
import { addDays, businessDate } from '../lib/time';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) client = createClient(url!, key!, { auth: { persistSession: true } });
  return client;
}

/** How many days of counts and orders the portal loads (enough for learning daily use). */
const HISTORY_DAYS = 45;

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

// ---- row mappers (database uses snake_case)
const itemFrom = (r: any): CountItem => ({
  id: r.id, area: r.area, section: r.section, name: r.name, unit: r.unit, hint: r.hint, sort: r.sort,
  hasBatches: r.has_batches, hasFrozen: r.has_frozen, active: r.active,
});
const itemTo = (i: CountItem) => ({
  id: i.id, area: i.area, section: i.section, name: i.name, unit: i.unit, hint: i.hint, sort: i.sort,
  has_batches: i.hasBatches, has_frozen: i.hasFrozen, active: i.active,
});
const supFrom = (r: any): Supplier => ({
  id: r.id, name: r.name, how: r.how, email: r.email, cutoff: r.cutoff, delivery: r.delivery, leadDays: r.lead_days,
  noDeliveryDays: r.no_delivery_days ?? [], openText: r.open_text, closeText: r.close_text, minOrder: num(r.min_order),
  freeDelivery: num(r.free_delivery), notes: r.notes, weekly: r.weekly, usesLpo: r.uses_lpo, deliveryTime: r.delivery_time,
  satDeliveryTime: r.sat_delivery_time, lpoContact: r.lpo_contact ?? null, sort: r.sort,
});
const supTo = (s: Supplier) => ({
  id: s.id, name: s.name, how: s.how, email: s.email, cutoff: s.cutoff, delivery: s.delivery, lead_days: s.leadDays,
  no_delivery_days: s.noDeliveryDays, open_text: s.openText, close_text: s.closeText, min_order: s.minOrder,
  free_delivery: s.freeDelivery, notes: s.notes, weekly: s.weekly, uses_lpo: s.usesLpo, delivery_time: s.deliveryTime,
  sat_delivery_time: s.satDeliveryTime, lpo_contact: s.lpoContact, sort: s.sort,
});
const ruleFrom = (r: any): Rule => ({
  id: r.id, supplierId: r.supplier_id, orderItem: r.order_item, countFrom: r.count_from, rule: r.rule, orderUnit: r.order_unit,
  packSize: Number(r.pack_size), estDailyUse: num(r.est_daily_use), fixedTarget: num(r.fixed_target), satTarget: num(r.sat_target),
  extraDays: Number(r.extra_days), minLevel: num(r.min_level), maxLevel: num(r.max_level), fixedQty: num(r.fixed_qty),
  price: num(r.price), active: r.active, sort: r.sort,
});
const ruleTo = (r: Rule) => ({
  id: r.id, supplier_id: r.supplierId, order_item: r.orderItem, count_from: r.countFrom, rule: r.rule, order_unit: r.orderUnit,
  pack_size: r.packSize, est_daily_use: r.estDailyUse, fixed_target: r.fixedTarget, sat_target: r.satTarget, extra_days: r.extraDays,
  min_level: r.minLevel, max_level: r.maxLevel, fixed_qty: r.fixedQty, price: r.price, active: r.active, sort: r.sort,
});
const countFrom = (r: any): CountRow => ({
  businessDate: r.business_date, shift: r.shift, itemId: r.item_id, qty: num(r.qty), oldQty: num(r.old_qty), newQty: num(r.new_qty),
  frozenQty: num(r.frozen_qty), expOld: r.exp_old, expNew: r.exp_new, countedBy: r.counted_by, savedAt: r.saved_at,
});
const orderFrom = (r: any): Order => ({
  id: r.id, businessDate: r.business_date, supplierId: r.supplier_id, lines: r.lines, message: r.message, lpoNumber: r.lpo_number,
  sentBy: r.sent_by, sentAt: r.sent_at, receivedAt: r.received_at, receivedBy: r.received_by, received: r.received,
});
const coldBrewFrom = (r: any): ColdBrewRow => ({ businessDate: r.business_date, shift: Number(r.shift), answer: r.answer === 'Yes' ? 'Yes' : 'Not made', grams: Number(r.grams), savedBy: r.saved_by, at: r.at });
const wasteFrom = (r: any): WasteRow => ({ id: r.id, date: r.date, item: r.item, qty: Number(r.qty), reason: r.reason, loggedBy: r.logged_by, createdAt: r.created_at });
const ingFrom = (r: any): Ingredient => ({
  id: r.id, name: r.name, unit: r.unit, countFrom: r.count_from ?? '', limitPct: Number(r.limit_pct), note: r.note, active: r.active, sort: r.sort,
});
const ingTo = (i: Ingredient, by: string) => ({
  id: i.id, name: i.name, unit: i.unit, count_from: i.countFrom, limit_pct: i.limitPct, note: i.note, active: i.active, sort: i.sort, updated_by: by, updated_at: new Date().toISOString(),
});
const recipeFrom = (r: any): Recipe => ({
  id: r.id, itemName: r.item_name, lines: r.lines ?? [], takeaway: r.takeaway ?? [], ignoreGroups: r.ignore_groups ?? [], note: r.note,
  updatedBy: r.updated_by, updatedAt: r.updated_at,
});
const recipeTo = (r: Recipe) => ({
  id: r.id, item_name: r.itemName, lines: r.lines, takeaway: r.takeaway, ignore_groups: r.ignoreGroups, note: r.note, updated_by: r.updatedBy, updated_at: r.updatedAt,
});
const modFrom = (r: any): ModifierRule => ({ id: r.id, group: r.grp, option: r.opt, effects: r.effects ?? [], note: r.note, updatedBy: r.updated_by, updatedAt: r.updated_at });
const modTo = (r: ModifierRule) => ({ id: r.id, grp: r.group, opt: r.option, effects: r.effects, note: r.note, updated_by: r.updatedBy, updated_at: r.updatedAt });
const runFrom = (r: any): SyncRun => ({
  id: r.id, kind: r.kind, startedAt: r.started_at, finishedAt: r.finished_at, receipts: r.receipts, ok: r.ok, message: r.message, latestReceiptAt: r.latest_receipt_at,
});

/** A live Loyverse receipt in the shape the stock and recipe pages use. */
function liveToReceipt(r: LiveSales['receipts'][number]): Receipt {
  return {
    number: r.number, type: r.type, at: new Date(r.at).toISOString(), businessDate: r.businessDate, dining: r.dining, cancelled: r.cancelled,
    total: r.total, employee: r.employee,
    lines: r.lines.map((l, idx) => ({ idx, itemId: l.itemId ?? null, itemName: l.item, variantName: l.variant, qty: l.qty, total: l.total,
      modifiers: l.modifiers.map((m) => ({ group: m.group, option: m.option })) })),
  };
}

/** Supabase sends at most 1000 rows at a time: ask page by page until everything is in. */
async function allRows(build: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const NOT_SET_UP = /does not exist|schema cache|relation/i;

/** Ingredients, recipes, modifier rules and sync status. Empty (with a note) until stock.sql has been run. */
async function loadBook(): Promise<StockBook> {
  try {
    const [ings, recipes, mods, items, cats, runs] = await Promise.all([
      allRows(() => sb().from('ingredients').select('*').order('sort')),
      allRows(() => sb().from('recipes').select('*').order('item_name')),
      allRows(() => sb().from('modifier_rules').select('*')),
      allRows(() => sb().from('loyverse_items').select('id, name, category_id').is('deleted_at', null)),
      allRows(() => sb().from('loyverse_categories').select('id, name')),
      sb().from('sync_runs').select('*').order('started_at', { ascending: false }).limit(30).then((r: any) => check(r) as any[]),
    ]);
    const catName = new Map(cats.map((c: any) => [c.id, c.name]));
    return {
      ingredients: ings.map(ingFrom), recipes: recipes.map(recipeFrom), modifierRules: mods.map(modFrom),
      loyverseItems: items.map((i: any) => ({ id: i.id, name: i.name, category: catName.get(i.category_id) ?? null })),
      syncRuns: runs.map(runFrom),
    };
  } catch (e) {
    const msg = (e as Error).message;
    return {
      ingredients: [], recipes: [], modifierRules: [], loyverseItems: [],
      syncRuns: [{ id: 'setup', kind: 'loyverse', startedAt: new Date().toISOString(), finishedAt: null, receipts: 0, ok: false, latestReceiptAt: null,
        message: NOT_SET_UP.test(msg) ? 'The stock part of the database is not set up yet. Follow the setup steps for stock and sales.' : msg }],
    };
  }
}
const salesFrom = (r: any): SalesRow => ({ item: r.item, cat: r.cat, qty: +r.qty, net: +r.net, gp: +r.gp, m: +r.m, disc: +r.disc, tax: +r.tax });

export function liveStore(isOwner: () => boolean, myName: () => string = () => 'Owner'): Store {
  const db = () => sb();
  // One Loyverse read is shared by every page for a minute
  let cache: { at: number; p: Promise<LiveSales> } | null = null;
  const liveOnce = (fresh = false): Promise<LiveSales> => {
    if (fresh || !cache || Date.now() - cache.at > 60_000) {
      const p = db().functions.invoke('loyverse-sync', { body: { action: 'live' } }).then(({ data, error }) => {
        if (error) throw new Error('The portal could not reach the Loyverse check. ' + error.message);
        return data as LiveSales;
      });
      p.catch(() => { cache = null; });
      cache = { at: Date.now(), p };
    }
    return cache.p;
  };
  return {
    mode: 'live',
    async load(): Promise<AppData> {
      const since = addDays(businessDate(), -HISTORY_DAYS);
      const page = (t: string, col: string, order?: string) => allRows(() => { const q = db().from(t).select('*').gte(col, since); return order ? q.order(order) : q; });
      const [items, sups, rules, counts, sessions, orders, waste, settings, sales, book, mirror, coldBrew] = await Promise.all([
        allRows(() => db().from('count_items').select('*').order('sort')),
        allRows(() => db().from('suppliers').select('*').order('sort')),
        allRows(() => db().from('rules').select('*').order('sort')),
        page('counts', 'business_date', 'business_date'),
        page('count_sessions', 'business_date'),
        page('orders', 'business_date'),
        page('waste', 'date'),
        allRows(() => db().from('settings').select('*')),
        isOwner() ? allRows(() => db().from('sales_items').select('*')) : Promise.resolve([]),
        loadBook(),
        // The sheet's Today's Orders. Missing table or nothing sent yet: the Orders page says so.
        db().from('sheet_orders_now').select('data, updated_at').eq('id', 'current').maybeSingle().then((r: any) => r.data ?? null, () => null),
        // Cold brew answers. Missing table or no answers yet: no batches are counted.
        db().from('cold_brew_log').select('*').gte('business_date', since).then((r: any) => (r.data ?? []) as any[], () => [] as any[]),
      ]);
      const set = Object.fromEntries((settings as any[]).map((s) => [s.key, s.value]));
      return {
        items: (items as any[]).map(itemFrom),
        suppliers: (sups as any[]).map(supFrom),
        rules: (rules as any[]).map(ruleFrom),
        counts: (counts as any[]).map(countFrom),
        sessions: (sessions as any[]).map((r) => ({
          businessDate: r.business_date, shift: r.shift, area: r.area, savedBy: r.saved_by, savedAt: r.saved_at, done: r.done, total: r.total,
        })),
        orders: (orders as any[]).map(orderFrom),
        waste: (waste as any[]).map(wasteFrom),
        coldBrew: (coldBrew as any[]).map(coldBrewFrom),
        sales: (sales as any[]).map(salesFrom),
        salesPeriod: set.sales_period ?? null,
        lpoNext: Number(set.lpo_next ?? seedLpoNext),
        book,
        sheetOrders: mirror ? { ...(mirror.data as Omit<SheetOrders, 'updatedAt'>), updatedAt: mirror.updated_at } : null,
      };
    },
    async saveCounts(rows, s) {
      check(
        await db().from('counts').upsert(
          rows.map((r) => ({
            business_date: r.businessDate, shift: r.shift, item_id: r.itemId, qty: r.qty, old_qty: r.oldQty, new_qty: r.newQty,
            frozen_qty: r.frozenQty, exp_old: r.expOld, exp_new: r.expNew, counted_by: r.countedBy, saved_at: r.savedAt,
          })),
        ),
      );
      check(
        await db().from('count_sessions').upsert({
          business_date: s.businessDate, shift: s.shift, area: s.area, saved_by: s.savedBy, saved_at: s.savedAt, done: s.done, total: s.total,
        }),
      );
    },
    async addWaste(rows) {
      check(await db().from('waste').insert(rows.map((r) => ({ date: r.date, item: r.item, qty: r.qty, reason: r.reason, logged_by: r.loggedBy }))));
    },
    async sendOrder(o, takeLpo) {
      let lpo: number | null = null;
      if (takeLpo) lpo = check(await db().rpc('take_lpo_number')) as number;
      const row = check(
        await db()
          .from('orders')
          .insert({ business_date: o.businessDate, supplier_id: o.supplierId, lines: o.lines, message: o.message, lpo_number: lpo, sent_by: o.sentBy, sent_at: o.sentAt })
          .select()
          .single(),
      );
      return orderFrom(row);
    },
    async receiveOrder(id, received, by) {
      check(await db().from('orders').update({ received, received_by: by, received_at: new Date().toISOString() }).eq('id', id));
    },
    async saveRule(r) {
      check(await db().from('rules').upsert(ruleTo(r)));
    },
    async saveSupplier(s) {
      check(await db().from('suppliers').upsert(supTo(s)));
    },
    async saveItem(i) {
      check(await db().from('count_items').upsert(itemTo(i)));
    },
    async importSales(rows, period) {
      check(await db().from('sales_items').delete().neq('item', ''));
      for (let i = 0; i < rows.length; i += 500) check(await db().from('sales_items').upsert(rows.slice(i, i + 500)));
      check(await db().from('settings').upsert({ key: 'sales_period', value: period }));
    },
    async loadStartingData() {
      check(await db().from('count_items').upsert(seedItems.map(itemTo)));
      check(await db().from('suppliers').upsert(seedSuppliers.map(supTo)));
      check(await db().from('rules').upsert(seedRules.map(ruleTo)));
    },
    async loadReceipts(fromIso, toIso): Promise<Receipt[]> {
      // Test: sales come live from Loyverse (yesterday and today), not from a saved copy
      const live = await liveOnce();
      return live.receipts.map(liveToReceipt).filter((r) => r.at > fromIso && r.at <= toIso);
    },
    async salesReport(from, to): Promise<SalesReport | null> {
      return (check(await db().rpc('sales_report', { p_from: from, p_to: to })) as SalesReport) ?? null;
    },
    async loyverseMenu(): Promise<LyItem[]> {
      const { data, error } = await db().functions.invoke('loyverse-sync', { body: { action: 'menu' } });
      if (error || !data?.ok) throw new Error('Could not read the menu from Loyverse. ' + (error?.message ?? data?.message ?? ''));
      return data.menu as LyItem[];
    },
    async saveIngredient(i) {
      check(await db().from('ingredients').upsert(ingTo(i, myName())));
    },
    async saveRecipes(list) {
      for (let k = 0; k < list.length; k += 200) check(await db().from('recipes').upsert(list.slice(k, k + 200).map(recipeTo)));
    },
    async saveModifierRule(r) {
      check(await db().from('modifier_rules').upsert(modTo(r)));
    },
    async seedStock(ingredients, rules) {
      const have = new Set((await allRows(() => db().from('ingredients').select('id'))).map((r: any) => r.id));
      const missing = ingredients.filter((i) => !have.has(i.id));
      if (missing.length) check(await db().from('ingredients').upsert(missing.map((i) => ingTo(i, 'Starting setup'))));
      const haveRules = new Set((await allRows(() => db().from('modifier_rules').select('id'))).map((r: any) => r.id));
      const newRules = rules.filter((r) => !haveRules.has(r.id));
      if (newRules.length) check(await db().from('modifier_rules').upsert(newRules.map(modTo)));
    },
    async recipeHistory(targetId): Promise<RecipeChange[]> {
      let q = db().from('recipe_changes').select('*').order('changed_at', { ascending: false }).limit(200);
      if (targetId) q = q.eq('target_id', targetId);
      return ((check(await q) as any[]) ?? []).map((r) => ({
        id: r.id, kind: r.kind, targetId: r.target_id, label: r.label, before: r.before, after: r.after, changedBy: r.changed_by, changedAt: r.changed_at,
      }));
    },
    async saveAlias(name, itemId) {
      check(await db().from('count_item_aliases').upsert({ name, item_id: itemId }));
    },
    async liveSales() {
      return liveOnce(true);
    },
    async syncNow() {
      const { data, error } = await db().functions.invoke('loyverse-sync', { body: {} });
      if (error) throw new Error(error.message);
      const checks = ((data as LiveSales)?.checks ?? []);
      return checks.find((c) => c.level !== 'ok')?.text ?? 'Loyverse is live.';
    },
  };
}

export function liveAuth(): Auth {
  return {
    async me() {
      const { data } = await sb().auth.getUser();
      if (!data.user) return null;
      const { data: p } = await sb().from('profiles').select('display_name, role, active').eq('id', data.user.id).maybeSingle();
      if (!p || !p.active) {
        // Removed or deactivated staff cannot use the portal.
        await sb().auth.signOut();
        return null;
      }
      return { name: p.display_name, role: p.role };
    },
    async staffList() {
      const { data, error } = await sb().rpc('staff_login_list');
      if (error) return [];
      return (data as { display_name: string; email: string }[]).map((r) => ({ name: r.display_name, email: r.email }));
    },
    async signIn(email, password) {
      const { error } = await sb().auth.signInWithPassword({ email, password });
      return error ? 'That did not work. Check and try again.' : null;
    },
    async signOut() {
      await sb().auth.signOut();
    },
    onChange(cb) {
      const { data } = sb().auth.onAuthStateChange(() => cb());
      return () => data.subscription.unsubscribe();
    },
  };
}
