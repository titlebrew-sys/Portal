/**
 * Live mode: Supabase database and login.
 * The two values it needs come from Vercel's Environment Variables, never from this code:
 *   VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * The anon key is safe in a browser: the row-level security in supabase/schema.sql decides
 * who can read and change what.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppData, CountItem, CountRow, Order, Rule, SalesRow, Supplier, WasteRow } from '../types';
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
const wasteFrom = (r: any): WasteRow => ({ id: r.id, date: r.date, item: r.item, qty: Number(r.qty), reason: r.reason, loggedBy: r.logged_by });
const salesFrom = (r: any): SalesRow => ({ item: r.item, cat: r.cat, qty: +r.qty, net: +r.net, gp: +r.gp, m: +r.m, disc: +r.disc, tax: +r.tax });

export function liveStore(isOwner: () => boolean): Store {
  const db = () => sb();
  return {
    mode: 'live',
    async load(): Promise<AppData> {
      const since = addDays(businessDate(), -HISTORY_DAYS);
      const [items, sups, rules, counts, sessions, orders, waste, settings, sales] = await Promise.all([
        db().from('count_items').select('*').order('sort'),
        db().from('suppliers').select('*').order('sort'),
        db().from('rules').select('*').order('sort'),
        db().from('counts').select('*').gte('business_date', since),
        db().from('count_sessions').select('*').gte('business_date', since),
        db().from('orders').select('*').gte('business_date', since),
        db().from('waste').select('*').gte('date', since),
        db().from('settings').select('*'),
        isOwner() ? db().from('sales_items').select('*') : Promise.resolve({ data: [], error: null }),
      ]);
      const set = Object.fromEntries((check(settings) as any[]).map((s) => [s.key, s.value]));
      return {
        items: (check(items) as any[]).map(itemFrom),
        suppliers: (check(sups) as any[]).map(supFrom),
        rules: (check(rules) as any[]).map(ruleFrom),
        counts: (check(counts) as any[]).map(countFrom),
        sessions: (check(sessions) as any[]).map((r) => ({
          businessDate: r.business_date, shift: r.shift, area: r.area, savedBy: r.saved_by, savedAt: r.saved_at, done: r.done, total: r.total,
        })),
        orders: (check(orders) as any[]).map(orderFrom),
        waste: (check(waste) as any[]).map(wasteFrom),
        sales: (check(sales) as any[]).map(salesFrom),
        salesPeriod: set.sales_period ?? null,
        lpoNext: Number(set.lpo_next ?? seedLpoNext),
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
