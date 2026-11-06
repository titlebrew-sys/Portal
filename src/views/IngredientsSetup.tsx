import { useState } from 'react';
import { useApp } from '../ctx';
import { parseNum } from '../components';
import type { Ingredient, IngredientUnit } from '../types';
import { PER_SLEEVE } from '../lib/catalog';
import { parseCountFrom } from '../lib/ordering';
import { clearReceiptCache } from '../lib/useStock';
import { startIngredients } from '../data/seed';
import { START_MODIFIER_RULES } from '../lib/catalog';
import { SyncLine } from './stockParts';

/** Small "Sync status" box: is Loyverse and the Google Sheet coming through? */
export function SyncPanel() {
  const { data, store, run, refresh, toast } = useApp();
  return (
    <div className="panel">
      <div className="panel-h"><h2>Sync status</h2>
        <div className="quiet">
          {store.syncNow && <button className="btn sm" onClick={() => run(async () => { toast('Checking Loyverse…'); const m = await store.syncNow!(); clearReceiptCache(); toast(m); })}>Check Loyverse now</button>}
          <button className="btn sm" onClick={() => { clearReceiptCache(); refresh(); }}>Refresh</button>
        </div>
      </div>
      <SyncLine runs={data.book.syncRuns} />
    </div>
  );
}

const termsText = (ing: Ingredient, names: Map<string, string>) =>
  parseCountFrom(ing.countFrom).map((t) => `${t.w === 1 ? '' : t.w + ' × '}${names.get(t.id) ?? t.id}`).join(' + ');

/** Ingredients: how each is counted, the alert limit, and sheet names to link. */
export function Ingredients() {
  const { data, store, run } = useApp();
  const [edit, setEdit] = useState<Ingredient | null>(null);
  const names = new Map(data.items.map((i) => [i.id, i.name]));
  const unknown = [...new Set(data.book.syncRuns.filter((r) => r.kind === 'sheet').flatMap((r) => (r.message.match(/names not matched: ([^·]+)/)?.[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean)))];
  return (
    <>
      {!data.book.ingredients.length && (
        <div className="banner info">
          <span><b>No ingredients yet.</b> This adds the starting list: beans, milks, syrups, powders, teas, cups and kitchen items, already linked to what staff count.</span>
          <button className="btn sm primary" onClick={() => run(() => store.seedStock(startIngredients(), START_MODIFIER_RULES), 'Ingredients added.')}>Add the starting ingredients</button>
        </div>
      )}
      {unknown.length > 0 && <SheetNames names={unknown} />}
      {edit && <IngredientForm ing={edit} onClose={() => setEdit(null)} />}
      <div><button className="btn sm" onClick={() => setEdit({ id: '', name: '', unit: 'g', countFrom: '', limitPct: 5, note: null, active: true, sort: data.book.ingredients.length })}>Add an ingredient</button></div>
      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Ingredient</th><th>Unit</th><th>Comes from the count of</th><th className="n">Alert above</th></tr></thead>
            <tbody>
              {data.book.ingredients.slice().sort((a, b) => a.sort - b.sort).map((i) => (
                <tr key={i.id} className="clickable" onClick={() => setEdit(i)} style={{ opacity: i.active ? 1 : 0.5 }}>
                  <td>{i.name}{i.note && <span className="why" style={{ color: 'var(--warn)' }}>{i.note}</span>}</td>
                  <td>{i.unit === 'pcs' ? 'pieces' : i.unit}</td>
                  <td style={{ fontSize: 13 }}>{termsText(i, names) || <span style={{ color: 'var(--muted)' }}>not counted</span>}</td>
                  <td className="n">{i.unit === 'pcs' || !i.limitPct ? 'any difference' : `${i.limitPct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SheetNames({ names }: { names: string[] }) {
  const { data, store, run } = useApp();
  const [pick, setPick] = useState<Record<string, string>>({});
  return (
    <div className="panel">
      <h2>Google Sheet names to link</h2>
      <p className="sub" style={{ margin: 0 }}>These names came from the Google Sheet but match no count item. Pick the item each one means.</p>
      {names.map((n) => (
        <div className="fieldset" key={n} style={{ alignItems: 'flex-end' }}>
          <label>{n}
            <select className="field" value={pick[n] ?? ''} onChange={(e) => setPick({ ...pick, [n]: e.target.value })}>
              <option value="">Choose</option>
              {data.items.map((i) => <option key={i.id} value={i.id}>{i.area}: {i.name}</option>)}
            </select>
          </label>
          <button className="btn sm" disabled={!pick[n]} onClick={() => run(() => store.saveAlias(n, pick[n]), `Linked "${n}".`)}>Link</button>
        </div>
      ))}
    </div>
  );
}

function IngredientForm({ ing, onClose }: { ing: Ingredient; onClose: () => void }) {
  const { data, store, run } = useApp();
  const [i, setI] = useState<Ingredient>(ing);
  const [terms, setTerms] = useState(parseCountFrom(ing.countFrom).map((t) => ({ id: t.id, w: String(t.w) })));
  const sleeveItem = PER_SLEEVE[i.id];
  const isNew = !ing.id;
  const id = isNew ? i.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : i.id;
  const countFrom = terms.filter((t) => t.id && parseNum(t.w)).map((t) => (parseNum(t.w) === 1 ? t.id : `${parseNum(t.w)}*${t.id}`)).join(' + ');
  const unitName = i.unit === 'pcs' ? 'pieces' : i.unit;
  return (
    <div className="panel">
      <div className="panel-h"><h2>{ing.name || 'New ingredient'}</h2><button className="link" onClick={onClose}>Close</button></div>
      <div className="rule-edit">
        <label>Name<input className="field" value={i.name} onChange={(e) => setI({ ...i, name: e.target.value })} /></label>
        <label>Unit
          <select className="field" value={i.unit} onChange={(e) => setI({ ...i, unit: e.target.value as IngredientUnit, limitPct: e.target.value === 'pcs' ? 0 : i.limitPct || 5 })}>
            <option value="g">g</option><option value="ml">ml</option><option value="pcs">pieces</option>
          </select>
        </label>
        {i.unit !== 'pcs' && <label>Alert when the difference is above (%)<input className="field mono" inputMode="decimal" defaultValue={i.limitPct} onChange={(e) => setI({ ...i, limitPct: parseNum(e.target.value) ?? 5 })} /></label>}
        <label>Active<input type="checkbox" checked={i.active} onChange={(e) => setI({ ...i, active: e.target.checked })} /></label>
      </div>
      {sleeveItem && (
        <div className="banner info">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {i.id === 'tonic-water' ? 'ml in one can' : i.id === 'straw' ? 'Straws in one pack' : 'Cups in one sleeve'}
            <input className="field num mono" inputMode="decimal" defaultValue={terms.find((t) => t.id === sleeveItem)?.w ?? ''}
              onChange={(e) => { setTerms([{ id: sleeveItem, w: e.target.value }]); setI({ ...i, note: e.target.value ? null : i.note }); }} />
          </label>
        </div>
      )}
      <div className="eyebrow">Comes from the count of (how many {unitName} in one counted unit)</div>
      {terms.map((t, k) => (
        <div className="rule-edit" key={k}>
          <label>Count item
            <select className="field" value={t.id} onChange={(e) => setTerms(terms.map((x, j) => (j === k ? { ...x, id: e.target.value } : x)))}>
              <option value="">Choose</option>
              {data.items.map((c) => <option key={c.id} value={c.id}>{c.area}: {c.name} ({c.unit})</option>)}
            </select>
          </label>
          <label>{unitName} in one {data.items.find((c) => c.id === t.id)?.unit ?? 'unit'}<input className="field mono" inputMode="decimal" value={t.w} onChange={(e) => setTerms(terms.map((x, j) => (j === k ? { ...x, w: e.target.value } : x)))} /></label>
          <label><span>&nbsp;</span><button className="btn sm" onClick={() => setTerms(terms.filter((_, j) => j !== k))}>Remove</button></label>
        </div>
      ))}
      <div><button className="btn sm" onClick={() => setTerms([...terms, { id: '', w: '1' }])}>Add a count item</button></div>
      <p className="sub" style={{ margin: 0 }}>Example: milk is counted in litres and used in ml, so 1 L = 1000 ml. Condensed milk: 397 g per can plus 595.5 g per open bottle.</p>
      <div className="quiet">
        <button className="btn primary sm" disabled={!i.name || (isNew && data.book.ingredients.some((x) => x.id === id))}
          onClick={() => run(() => store.saveIngredient({ ...i, id, countFrom, note: sleeveItem && !countFrom ? i.note : sleeveItem ? null : i.note }), 'Ingredient saved.').then((ok) => ok && onClose())}>Save ingredient</button>
        <button className="btn sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
