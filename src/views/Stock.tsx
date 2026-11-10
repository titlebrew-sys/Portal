import { useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { Head, MobileWho } from '../components';
import type { Ingredient } from '../types';
import { addDays, fmtShortDate } from '../lib/time';
import { currentLevel, diffClass, hasCount, soldMoreThanCounted, steps, usedFor } from '../lib/stock';
import { dayEnd, dayStart, useStockData } from '../lib/useStock';
import { DateRange, StepCard, Tap, UsedList, amt, countLabel, signed } from './stockParts';

const WEEKLY = (ing: Ingredient) => ing.countFrom.includes('wk-');

export function Stock() {
  const { data, store, today } = useApp();
  const [from, setFrom] = useState(addDays(today, -1));
  const [to, setTo] = useState(today);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const sd = useStockData(data, store, from, to);
  const ings = data.book.ingredients.filter((i) => i.active && (!q || i.name.toLowerCase().includes(q.toLowerCase())));

  const rows = useMemo(
    () =>
      ings.map((ing) => {
        const lvl = currentLevel(ing, sd.inputs);
        const used = usedFor(ing, sd.inputs, dayStart(from), dayEnd(to));
        return { ing, lvl, used, usedTotal: used.reduce((a, u) => a + u.qty, 0) };
      }),
    [ings, sd.inputs, from, to],
  );
  const beans = rows.filter((r) => r.ing.id.startsWith('bean-') && r.usedTotal);
  const sel = rows.find((r) => r.ing.id === open);

  if (sel) return <StockDetail ing={sel.ing} from={from} to={to} onBack={() => setOpen(null)} onRange={(f, t) => { setFrom(f); setTo(t); }} />;

  return (
    <>
      <MobileWho />
      <Head eyebrow="Stock" title="Stock by ingredient" sub="Expected stock = last count + arrived − used by sales − thrown away. Tap an ingredient to see every day." />
      <DateRange from={from} to={to} today={today} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      <div className="banner info"><span>For now: sales come live from Loyverse for <b>yesterday and today</b>. Counts come from your Google Sheet. Deliveries are taken from the sheet's orders, as arriving the next morning.</span></div>
      {sd.error && <div className="banner bad">Could not load sales: {sd.error}</div>}
      {!data.book.ingredients.length && <div className="banner warn">No ingredients yet. The owner sets them up on Items and rules, Ingredients.</div>}
      {beans.length > 0 && (
        <div className="panel">
          <h2>Coffee beans used by sales, {from === to ? fmtShortDate(from) : `${fmtShortDate(from)} to ${fmtShortDate(to)}`}</h2>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
            {beans.map((b) => (
              <div key={b.ing.id}><div className="stat" style={{ fontSize: 22 }}>{amt(b.usedTotal, 'g')}</div><p className="sub" style={{ margin: 0 }}>{b.ing.name}</p></div>
            ))}
          </div>
        </div>
      )}
      <RoastPanel />
      <div className="fieldset noprint"><label>Find<input className="field" placeholder="e.g. milk" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
      <div className="panel">
        {sd.loading && <p className="sub">Loading sales…</p>}
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Ingredient</th><th className="n">Expected now</th><th>Last count</th><th className="n">Last difference</th><th className="n">Used by sales in these days</th></tr></thead>
            <tbody>
              {rows.map(({ ing, lvl, usedTotal }) => (
                <tr key={ing.id} className="clickable" onClick={() => setOpen(ing.id)}>
                  <td>{ing.name}{!hasCount(ing) && <span className="why">{ing.note ?? 'Not counted'}</span>}</td>
                  <td className="n">{lvl.expectedNow === null ? '–' : lvl.expectedNow < 0 ? <>{amt(0, ing.unit)}<span className="why">Sold {amt(soldMoreThanCounted(lvl.expectedNow), ing.unit)} more than was counted</span></> : amt(lvl.expectedNow, ing.unit)}</td>
                  <td>{lvl.last ? <>{amt(lvl.last.value, ing.unit)}<span className="why">{countLabel(lvl.last, WEEKLY(ing))}</span></> : <span className="why">No count yet</span>}</td>
                  <td className="n">{lvl.lastStep ? <span className={'pill ' + diffClass(lvl.lastStep)}>{signed(lvl.lastStep.difference, ing.unit)}</span> : '–'}</td>
                  <td className="n">{amt(usedTotal, ing.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function StockDetail({ ing, from, to, onBack, onRange }: { ing: Ingredient; from: string; to: string; onBack: () => void; onRange: (f: string, t: string) => void }) {
  const { data, store, today } = useApp();
  const sd = useStockData(data, store, from, to);
  const lvl = currentLevel(ing, sd.inputs);
  const all = steps(ing, sd.inputs).filter((s) => s.to.businessDate >= from && s.to.businessDate <= to).reverse();
  const days: string[] = [];
  for (let d = to; d >= from; d = addDays(d, -1)) days.push(d);
  const weekly = WEEKLY(ing);
  return (
    <>
      <div className="head noprint"><div><div className="eyebrow">Stock</div><h1>{ing.name}</h1>
        <p className="sub">Amounts in {ing.unit === 'pcs' ? 'pieces' : ing.unit}. Limit before an alert: {ing.unit === 'pcs' || !ing.limitPct ? 'any difference' : `${ing.limitPct}%`}.</p></div>
        <button className="btn" onClick={onBack}>Back to all stock</button></div>
      <DateRange from={from} to={to} today={today} onChange={onRange} />
      {sd.loading && <p className="sub">Loading sales…</p>}
      <div className="panel">
        <h2>Expected now</h2>
        {lvl.last ? (
          <div className="breakdown">
            <div><span>Last count ({countLabel(lvl.last, weekly)})</span><b>{amt(lvl.last.value, ing.unit)}</b></div>
            <div><span>+ arrived since</span><b>{amt(lvl.arrivedTotal, ing.unit)}</b></div>
            <div><span>− used by sales since</span><Tap label={amt(lvl.usedTotal, ing.unit)}><UsedList used={usedFor(ing, sd.inputs, lvl.last.at, new Date().toISOString())} unit={ing.unit} /></Tap></div>
            <div><span>− thrown away since</span><b>{amt(lvl.wasteTotal, ing.unit)}</b></div>
            <div className="total"><span>= expected now</span><b>{amt(Math.max(0, lvl.expectedNow ?? 0), ing.unit)}</b></div>
            {soldMoreThanCounted(lvl.expectedNow) > 0 && <p className="sub" style={{ margin: 0, color: 'var(--warn)' }}>Sales used {amt(soldMoreThanCounted(lvl.expectedNow), ing.unit)} more than was counted. Check that the last count, the deliveries and the recipe for this ingredient are right.</p>}
          </div>
        ) : <p className="sub">{hasCount(ing) ? 'No count yet.' : ing.note ?? 'This ingredient is not linked to a count, so only sales use is shown.'}</p>}
      </div>
      {ing.id.startsWith('bean-') && <RoastPanel ingId={ing.id} />}
      <h2>Each count</h2>
      {all.length ? all.map((s, i) => <StepCard key={i} ing={ing} step={s} weekly={weekly} />) : <p className="sub">No two counts in these days to compare yet.</p>}
      <div className="panel">
        <h2>Used by sales, day by day</h2>
        <div className="rows">
          {days.map((d) => {
            const used = usedFor(ing, sd.inputs, dayStart(d), dayEnd(d));
            const total = used.reduce((a, u) => a + u.qty, 0);
            return (
              <div className="r" key={d} style={{ flexWrap: 'wrap' }}>
                <div className="t"><b>{fmtShortDate(d)}</b></div>
                <Tap label={amt(total, ing.unit)}><UsedList used={used} unit={ing.unit} /></Tap>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** Owner only: enter the real weight of a roast. It replaces the amount the Portal assumes from a big rise in the count. */
function RoastPanel({ ingId }: { ingId?: string }) {
  const { data, store, me, today, run } = useApp();
  const beans = data.book.ingredients.filter((i) => i.active && i.id.startsWith('bean-'));
  const [bean, setBean] = useState(ingId ?? 'bean-brazil');
  const [date, setDate] = useState(today);
  const [grams, setGrams] = useState('');
  if (me.role !== 'owner') return null;
  const g = Number(grams.replace(',', '.'));
  const list = (data.roasts ?? []).filter((r) => !ingId || r.ingredientId === ingId).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  const nameOf = (id: string) => data.book.ingredients.find((i) => i.id === id)?.name ?? id;
  return (
    <div className="panel noprint">
      <h2>Roasts</h2>
      <p className="sub" style={{ margin: '0 0 8px' }}>Enter the real weight of a roast brought to the shop. It is used instead of the amount the Portal assumes when a bean count goes up a lot (shown in amber until you enter it).</p>
      <div className="fieldset" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {!ingId && <label>Bean<select className="field" value={bean} onChange={(e) => setBean(e.target.value)}>{beans.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
        <label>Date brought<input className="field" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Weight in g<input className="field" inputMode="decimal" placeholder="e.g. 14200" value={grams} onChange={(e) => setGrams(e.target.value)} /></label>
        <button className="btn sm primary" disabled={!(g > 0) || !date} onClick={() => run(async () => { await store.saveRoast({ date, ingredientId: ingId ?? bean, grams: g }); setGrams(''); }, 'Roast saved')}>Save roast</button>
      </div>
      {list.length > 0 && (
        <div className="rows">
          {list.map((r) => (
            <div className="r" key={r.id}>
              <div className="t"><b>{nameOf(r.ingredientId)}: {amt(r.grams, 'g')}</b><span>{fmtShortDate(r.date)}, entered by {r.enteredBy}</span></div>
              <button className="btn sm" onClick={() => { if (window.confirm('Remove this roast?')) run(() => store.deleteRoast(r.id), 'Roast removed'); }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
