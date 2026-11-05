/**
 * Demo mode: runs before Supabase is connected. Uses the prototype data and keeps
 * changes in this browser only, so you can try every screen safely.
 */
import type { AppData } from '../types';
import type { Store } from './store';
import { demoData } from './seed';
import { businessDate } from '../lib/time';

const KEY = 'titlebrew-demo-v1';

function read(): AppData | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const d = JSON.parse(s) as AppData & { _day?: string };
    // Start fresh each new business day so the demo always shows "today".
    return d._day === businessDate() ? d : null;
  } catch {
    return null;
  }
}

function write(d: AppData) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...d, _day: businessDate() }));
  } catch {
    /* private window: changes last until the page closes */
  }
}

export function resetDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function demoStore(): Store {
  let data: AppData = read() ?? demoData(businessDate());
  const save = () => write(data);
  const upsert = <T,>(list: T[], item: T, same: (a: T) => boolean) => {
    const i = list.findIndex(same);
    return i >= 0 ? list.map((x, j) => (j === i ? item : x)) : [...list, item];
  };
  return {
    mode: 'demo',
    async load() {
      return structuredClone(data);
    },
    async saveCounts(rows, session) {
      let counts = data.counts;
      for (const r of rows)
        counts = upsert(counts, r, (c) => c.businessDate === r.businessDate && c.shift === r.shift && c.itemId === r.itemId);
      const sessions = upsert(data.sessions, session, (s) => s.businessDate === session.businessDate && s.shift === session.shift && s.area === session.area);
      data = { ...data, counts, sessions };
      save();
    },
    async addWaste(rows) {
      data = { ...data, waste: [...data.waste, ...rows.map((r) => ({ ...r, id: crypto.randomUUID() }))] };
      save();
    },
    async sendOrder(o, takeLpo) {
      const order = { ...o, id: crypto.randomUUID(), lpoNumber: takeLpo ? data.lpoNext : null, receivedAt: null, receivedBy: null, received: null };
      data = { ...data, orders: [...data.orders, order], lpoNext: takeLpo ? data.lpoNext + 1 : data.lpoNext };
      save();
      return order;
    },
    async receiveOrder(id, received, by) {
      data = { ...data, orders: data.orders.map((o) => (o.id === id ? { ...o, received, receivedBy: by, receivedAt: new Date().toISOString() } : o)) };
      save();
    },
    async saveRule(r) {
      data = { ...data, rules: upsert(data.rules, r, (x) => x.id === r.id) };
      save();
    },
    async saveSupplier(s) {
      data = { ...data, suppliers: upsert(data.suppliers, s, (x) => x.id === s.id) };
      save();
    },
    async saveItem(i) {
      data = { ...data, items: upsert(data.items, i, (x) => x.id === i.id) };
      save();
    },
    async importSales(rows, period) {
      data = { ...data, sales: rows, salesPeriod: period };
      save();
    },
  };
}
