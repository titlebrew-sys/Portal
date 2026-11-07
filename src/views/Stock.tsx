import { useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { Head, MobileWho } from '../components';
import type { Ingredient } from '../types';
import { addDays, fmtShortDate } from '../lib/time';
import { currentLevel, hasCount, steps, usedFor } from '../lib/stock';
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
                  <td className="n">{lvl.expectedNow === null ? '–' : amt(lvl.expectedNow, ing.unit)}</td>
                  <td>{lvl.last ? <>{amt(lvl.last.value, ing.unit)}<span className="why">{countLabel(lvl.last, WEEKLY(ing))}</span></> : <span className="why">No count yet</span>}</td>
                  <td className="n">{lvl.lastStep ? <span className={'pill ' + (lvl.lastStep.over ? 'p-bad' : 'p-good')}>{signed(lvl.lastStep.difference, ing.unit)}</span> : '–'}</td>
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
            <div className="total"><span>= expected now</span><b>{amt(lvl.expectedNow, ing.unit)}</b></div>
          </div>
        ) : <p className="sub">{hasCount(ing) ? 'No count yet.' : ing.note ?? 'This ingredient is not linked to a count, so only sales use is shown.'}</p>}
      </div>
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
