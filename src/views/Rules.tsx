import { useState } from 'react';
import { useApp } from '../ctx';
import { Head, MobileWho, parseNum } from '../components';
import type { Area, CountItem, Rule, RuleKind, Supplier } from '../types';
import { MIN_LEARN_DAYS, fmtNum, indexCounts, learnedUse, parseCountFrom } from '../lib/ordering';
import { businessDate } from '../lib/time';
import { Ingredients, SyncPanel } from './IngredientsSetup';

const DESC: Record<RuleKind, string> = {
  TARGET: 'Tops up to a target every day and learns daily use',
  TOPUP: 'Orders when at or below the minimum, up to the max',
  FIXED: 'Orders a set quantity when at or below the minimum',
  TRACK: 'Counted only, never ordered',
};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const numOrNull = (s: string) => parseNum(s);

export function Rules() {
  const { data, store, run, today } = useApp();
  const [tab, setTab] = useState<'rules' | 'suppliers' | 'items' | 'ingredients'>('rules');
  const [editRule, setEditRule] = useState<Rule | null>(null);
  const [editSup, setEditSup] = useState<Supplier | null>(null);
  const [editItem, setEditItem] = useState<CountItem | null>(null);
  const cnt = data.rules.reduce<Record<string, number>>((a, r) => ((a[r.rule] = (a[r.rule] || 0) + 1), a), {});
  const sup = (id: string | null) => data.suppliers.find((s) => s.id === id)?.name ?? '—';
  const idx = indexCounts(data.counts);
  const recv = (o: { receivedAt: string | null }) => (o.receivedAt ? businessDate(new Date(o.receivedAt)) : null);
  const empty = !data.items.length && !data.rules.length;

  return (
    <>
      <MobileWho />
      <Head eyebrow="Setup" title="Items and order rules" sub="Your rules from the order sheet. Edit them here, without touching formulas. Tap a row to change it." />
      <SyncPanel />
      {empty && store.loadStartingData && (
        <div className="banner info">
          <span><b>Your database is empty.</b> Copy in the items, suppliers and rules from the prototype to start.</span>
          <button className="btn sm primary" onClick={() => run(() => store.loadStartingData!(), 'Starting data loaded.')}>Load starting data</button>
        </div>
      )}
      <div className="banner warn">
        <span>The starting minimums, maximums and pack sizes were set so today's suggestions match the prototype. Please check each one against your order sheet.</span>
      </div>
      <div className="grid">
        {(Object.keys(DESC) as RuleKind[]).map((k) => (
          <div className="panel" key={k}><div className="stat">{cnt[k] || 0}<small>{k.toLowerCase()} items</small></div><p className="sub" style={{ margin: 0 }}>{DESC[k]}</p></div>
        ))}
      </div>
      <div className="tabs">
        <button className="btn sm" aria-pressed={tab === 'rules'} onClick={() => setTab('rules')}>Order rules</button>
        <button className="btn sm" aria-pressed={tab === 'suppliers'} onClick={() => setTab('suppliers')}>Suppliers</button>
        <button className="btn sm" aria-pressed={tab === 'items'} onClick={() => setTab('items')}>Count items</button>
        <button className="btn sm" aria-pressed={tab === 'ingredients'} onClick={() => setTab('ingredients')}>Ingredients</button>
      </div>

      {tab === 'rules' && (
        <>
          {editRule && <RuleForm rule={editRule} onClose={() => setEditRule(null)} onSave={(r) => run(() => store.saveRule(r), 'Rule saved.').then((ok) => ok && setEditRule(null))} />}
          <div><button className="btn sm" onClick={() => setEditRule({ id: 'rule-' + crypto.randomUUID().slice(0, 8), supplierId: data.suppliers[0]?.id ?? null, orderItem: '', countFrom: '', rule: 'FIXED', orderUnit: 'pcs', packSize: 1, estDailyUse: null, fixedTarget: null, satTarget: null, extraDays: 1, minLevel: 0, maxLevel: null, fixedQty: 1, price: null, active: true, sort: data.rules.length })}>Add a rule</button></div>
          <div className="panel">
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Item</th><th>Supplier</th><th>Rule</th><th>Settings</th><th className="n">Learned use per day</th><th className="n">Days of data</th><th className="n">Price AED</th></tr></thead>
                <tbody>
                  {data.rules.slice().sort((a, b) => a.sort - b.sort).map((r) => {
                    const l = r.rule === 'TARGET' ? learnedUse(r, idx, data.orders, today, recv) : null;
                    return (
                      <tr key={r.id} className="clickable" onClick={() => setEditRule(r)} style={{ opacity: r.active ? 1 : 0.5 }}>
                        <td>{r.orderItem}</td>
                        <td>{sup(r.supplierId)}</td>
                        <td><span className={'pill ' + (r.rule === 'TARGET' ? 'p-s1' : 'p-mute')}>{r.rule}</span></td>
                        <td style={{ fontSize: 13, color: 'var(--muted)' }}>{settingsText(r)}</td>
                        <td className="n">{l ? (l.perDay === null ? '–' : fmtNum(l.perDay)) : <span style={{ color: 'var(--muted)' }}>not learning</span>}</td>
                        <td className="n">{l ? `${l.days}${l.days < MIN_LEARN_DAYS ? ' (using estimate)' : ''}` : ''}</td>
                        <td className="n">{fmtNum(r.price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'suppliers' && (
        <>
          {editSup && <SupplierForm s={editSup} onClose={() => setEditSup(null)} onSave={(s) => run(() => store.saveSupplier(s), 'Supplier saved.').then((ok) => ok && setEditSup(null))} />}
          <div className="panel">
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Supplier</th><th>How</th><th>Email</th><th>Cutoff</th><th>Delivery</th><th>Notes</th></tr></thead>
                <tbody>
                  {data.suppliers.slice().sort((a, b) => a.sort - b.sort).map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => setEditSup(s)}>
                      <td>{s.name}</td><td>{s.how}</td><td>{s.email || <span style={{ color: 'var(--muted)' }}>add</span>}</td><td>{s.cutoff}</td><td>{s.delivery}</td><td style={{ fontSize: 13, color: 'var(--muted)' }}>{s.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'ingredients' && <Ingredients />}

      {tab === 'items' && (
        <>
          {editItem && <ItemForm item={editItem} onClose={() => setEditItem(null)} onSave={(i) => run(() => store.saveItem(i), 'Item saved.').then((ok) => ok && setEditItem(null))} />}
          <div><button className="btn sm" onClick={() => setEditItem({ id: '', area: 'Bar', section: 'Bar', name: '', unit: 'pcs', hint: null, sort: data.items.length, hasBatches: false, hasFrozen: false, active: true })}>Add a count item</button></div>
          <div className="panel">
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Item</th><th>Area</th><th>Section</th><th>Unit</th><th>Hint for staff</th><th>Code</th></tr></thead>
                <tbody>
                  {data.items.slice().sort((a, b) => a.sort - b.sort).map((i) => (
                    <tr key={i.id} className="clickable" onClick={() => setEditItem(i)} style={{ opacity: i.active ? 1 : 0.5 }}>
                      <td>{i.name}</td><td>{i.area}</td><td>{i.section}</td><td>{i.unit}</td><td style={{ fontSize: 13, color: 'var(--muted)' }}>{i.hint}</td><td className="mono" style={{ fontSize: 12 }}>{i.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function settingsText(r: Rule): string {
  const pack = r.packSize !== 1 ? `, 1 ${r.orderUnit} = ${fmtNum(r.packSize)}` : '';
  if (r.rule === 'TARGET')
    return (r.fixedTarget !== null ? `Target ${fmtNum(r.fixedTarget)}${r.satTarget !== null ? `, Saturday ${fmtNum(r.satTarget)}` : ''}` : `Estimate ${fmtNum(r.estDailyUse)}/day + ${fmtNum(r.extraDays)} extra day`) + pack;
  if (r.rule === 'TOPUP') return `Min ${fmtNum(r.minLevel)}, max ${fmtNum(r.maxLevel)}${pack}`;
  if (r.rule === 'FIXED') return `Min ${fmtNum(r.minLevel)}, order ${fmtNum(r.fixedQty)} ${r.orderUnit}`;
  return '';
}

function NumField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [s, setS] = useState(value === null ? '' : String(value));
  return <label>{label}<input className="field mono" inputMode="decimal" value={s} onChange={(e) => { setS(e.target.value); onChange(numOrNull(e.target.value)); }} /></label>;
}

function RuleForm({ rule, onSave, onClose }: { rule: Rule; onSave: (r: Rule) => void; onClose: () => void }) {
  const { data } = useApp();
  const [r, setR] = useState<Rule>(rule);
  const set = (p: Partial<Rule>) => setR({ ...r, ...p });
  const unknown = parseCountFrom(r.countFrom).filter((t) => !data.items.some((i) => i.id === t.id));
  return (
    <div className="panel">
      <div className="panel-h"><h2>{rule.orderItem || 'New rule'}</h2><button className="link" onClick={onClose}>Close</button></div>
      <div className="rule-edit">
        <label>Order item name<input className="field" value={r.orderItem} onChange={(e) => set({ orderItem: e.target.value })} /></label>
        <label>Supplier
          <select className="field" value={r.supplierId ?? ''} onChange={(e) => set({ supplierId: e.target.value || null })}>
            <option value="">None (track only)</option>
            {data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Rule
          <select className="field" value={r.rule} onChange={(e) => set({ rule: e.target.value as RuleKind })}>
            {(['TARGET', 'TOPUP', 'FIXED', 'TRACK'] as RuleKind[]).map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
        <label>Order unit<input className="field" value={r.orderUnit} onChange={(e) => set({ orderUnit: e.target.value })} /></label>
        <NumField label="Count units in 1 order unit" value={r.packSize} onChange={(v) => set({ packSize: v ?? 1 })} />
        <NumField label="Price AED per order unit" value={r.price} onChange={(v) => set({ price: v })} />
        {r.rule === 'TARGET' && (
          <>
            <NumField label="Your estimate, use per day" value={r.estDailyUse} onChange={(v) => set({ estDailyUse: v })} />
            <NumField label="Extra days of stock" value={r.extraDays} onChange={(v) => set({ extraDays: v ?? 0 })} />
            <NumField label="Fixed target (optional)" value={r.fixedTarget} onChange={(v) => set({ fixedTarget: v })} />
            <NumField label="Saturday target (optional)" value={r.satTarget} onChange={(v) => set({ satTarget: v })} />
          </>
        )}
        {(r.rule === 'TOPUP' || r.rule === 'FIXED') && <NumField label="Minimum (order at or below)" value={r.minLevel} onChange={(v) => set({ minLevel: v })} />}
        {r.rule === 'TOPUP' && <NumField label="Maximum (top up to)" value={r.maxLevel} onChange={(v) => set({ maxLevel: v })} />}
        {r.rule === 'FIXED' && <NumField label="Quantity to order" value={r.fixedQty} onChange={(v) => set({ fixedQty: v })} />}
        <label className="wide">Reads the count of
          <select className="field" value={data.items.some((i) => i.id === r.countFrom) ? r.countFrom : '__formula'} onChange={(e) => e.target.value !== '__formula' && set({ countFrom: e.target.value })}>
            <option value="__formula">Several items (formula below)</option>
            {data.items.map((i) => <option key={i.id} value={i.id}>{i.area}: {i.name} ({i.unit})</option>)}
          </select>
        </label>
        <label className="wide">Formula (item codes, e.g. bar-condensed-milk-unopened-cans + 1.5*bar-condensed-milk-bottles)
          <input className="field mono" value={r.countFrom} onChange={(e) => set({ countFrom: e.target.value })} />
        </label>
        {unknown.length > 0 && <div className="banner bad wide">Unknown item code: {unknown.map((u) => u.id).join(', ')}</div>}
        <label><span>Active</span><input type="checkbox" checked={r.active} onChange={(e) => set({ active: e.target.checked })} /></label>
      </div>
      <div className="quiet">
        <button className="btn primary sm" disabled={!r.orderItem || !r.countFrom || unknown.length > 0} onClick={() => onSave(r)}>Save rule</button>
        <button className="btn sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function SupplierForm({ s: start, onSave, onClose }: { s: Supplier; onSave: (s: Supplier) => void; onClose: () => void }) {
  const [s, setS] = useState<Supplier>(start);
  const set = (p: Partial<Supplier>) => setS({ ...s, ...p });
  const text = (label: string, k: keyof Supplier, area = false) => (
    <label className={area ? 'wide' : undefined}>{label}
      {area ? <textarea className="field" value={(s[k] as string) ?? ''} onChange={(e) => set({ [k]: e.target.value || null } as Partial<Supplier>)} />
        : <input className="field" value={(s[k] as string) ?? ''} onChange={(e) => set({ [k]: e.target.value || null } as Partial<Supplier>)} />}
    </label>
  );
  return (
    <div className="panel">
      <div className="panel-h"><h2>{s.name}</h2><button className="link" onClick={onClose}>Close</button></div>
      <div className="rule-edit">
        {text('How orders go', 'how')}
        {text('Email address', 'email')}
        {text('Cutoff', 'cutoff')}
        {text('Delivery', 'delivery')}
        <NumField label="Days from order to delivery" value={s.leadDays} onChange={(v) => set({ leadDays: v ?? 1 })} />
        <NumField label="Minimum order AED" value={s.minOrder} onChange={(v) => set({ minOrder: v })} />
        <NumField label="Free delivery from AED" value={s.freeDelivery} onChange={(v) => set({ freeDelivery: v })} />
        <label>Counted weekly<input type="checkbox" checked={s.weekly} onChange={(e) => set({ weekly: e.target.checked })} /></label>
        <label className="wide">No delivery on
          <span className="quiet">
            {DAYS.map((d, i) => (
              <button key={d} type="button" className="btn sm" aria-pressed={s.noDeliveryDays.includes(i)} onClick={() => set({ noDeliveryDays: s.noDeliveryDays.includes(i) ? s.noDeliveryDays.filter((x) => x !== i) : [...s.noDeliveryDays, i] })}>{d}</button>
            ))}
          </span>
        </label>
        {text('Message opening', 'openText', true)}
        {text('Message closing', 'closeText', true)}
        {s.usesLpo && text('Delivery time in email', 'deliveryTime')}
        {s.usesLpo && text('Saturday delivery time', 'satDeliveryTime')}
        {s.usesLpo && text('Contact on the LPO (name and phone)', 'lpoContact')}
        {text('Notes', 'notes', true)}
      </div>
      <div className="quiet">
        <button className="btn primary sm" onClick={() => onSave({ ...s, openText: s.openText || 'Hello' })}>Save supplier</button>
        <button className="btn sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function ItemForm({ item, onSave, onClose }: { item: CountItem; onSave: (i: CountItem) => void; onClose: () => void }) {
  const { data } = useApp();
  const [i, setI] = useState<CountItem>(item);
  const isNew = !item.id;
  const set = (p: Partial<CountItem>) => setI({ ...i, ...p });
  const prefix = { Bar: 'bar-', Kitchen: 'kit-', Weekly: 'wk-' }[i.area];
  const id = isNew ? prefix + slug(i.name) : i.id;
  const clash = isNew && data.items.some((x) => x.id === id);
  return (
    <div className="panel">
      <div className="panel-h"><h2>{item.name || 'New count item'}</h2><button className="link" onClick={onClose}>Close</button></div>
      <div className="rule-edit">
        <label>Name<input className="field" value={i.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label>Area
          <select className="field" value={i.area} onChange={(e) => set({ area: e.target.value as Area, section: e.target.value === 'Kitchen' ? i.section : e.target.value })}>
            <option>Bar</option><option>Kitchen</option><option>Weekly</option>
          </select>
        </label>
        <label>Section<input className="field" value={i.section} onChange={(e) => set({ section: e.target.value })} /></label>
        <label>Unit<input className="field" value={i.unit} onChange={(e) => set({ unit: e.target.value })} /></label>
        <label className="wide">Hint for staff<input className="field" value={i.hint ?? ''} onChange={(e) => set({ hint: e.target.value || null })} /></label>
        <label>Old and new batch with expiry<input type="checkbox" checked={i.hasBatches} onChange={(e) => set({ hasBatches: e.target.checked })} /></label>
        <label>Has frozen stock<input type="checkbox" checked={i.hasFrozen} onChange={(e) => set({ hasFrozen: e.target.checked })} /></label>
        <label>Active<input type="checkbox" checked={i.active} onChange={(e) => set({ active: e.target.checked })} /></label>
        <label>Code<span className="mono" style={{ fontSize: 13 }}>{id || '…'}</span></label>
      </div>
      {clash && <div className="banner bad">An item with this name already exists.</div>}
      <div className="quiet">
        <button className="btn primary sm" disabled={!i.name || clash} onClick={() => onSave({ ...i, id })}>Save item</button>
        <button className="btn sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
