import { useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { Head, MobileWho } from '../components';
import { addDays, fmtDubaiTime, fmtShortDate } from '../lib/time';
import { diffClass, soldMoreThanCounted, steps, type Step } from '../lib/stock';
import { useStockData } from '../lib/useStock';
import { downloadBytes, makeXlsx } from '../lib/xlsxWrite';
import type { Ingredient } from '../types';
import { DateRange, StepCard, amt, countLabel, signed } from './stockParts';

export interface DiffRow { ing: Ingredient; step: Step }

/** Every count of every ingredient in the range, newest first. */
export function differenceRows(ings: Ingredient[], inputs: Parameters<typeof steps>[1], from: string, to: string): DiffRow[] {
  return ings
    .flatMap((ing) => steps(ing, inputs).map((step) => ({ ing, step })))
    .filter((r) => r.step.to.businessDate >= from && r.step.to.businessDate <= to)
    .sort((a, b) => (a.step.to.at < b.step.to.at ? 1 : a.step.to.at > b.step.to.at ? -1 : a.ing.sort - b.ing.sort));
}

export function Differences() {
  const { data, store, today } = useApp();
  const [from, setFrom] = useState(addDays(today, -1));
  const [to, setTo] = useState(today);
  const [item, setItem] = useState('');
  const [onlyOver, setOnlyOver] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const sd = useStockData(data, store, from, to);
  const rows = useMemo(
    () => differenceRows(data.book.ingredients.filter((i) => i.active && (!item || i.id === item)), sd.inputs, from, to).filter((r) => !onlyOver || r.step.over),
    [data.book.ingredients, sd.inputs, from, to, item, onlyOver],
  );

  function exportXlsx() {
    const header = ['Count', 'Date', 'Shift', 'Ingredient', 'Unit', 'Last count', 'Arrived', 'Used by sales', 'Thrown away', 'Expected', 'Counted', 'Difference', 'Difference %', 'Limit %', 'Above limit', 'Counted by'];
    const body = rows.map(({ ing, step: s }) => [
      countLabel(s.to), s.to.businessDate, s.to.shift, ing.name, ing.unit, s.from.value, s.arrivedTotal, round(s.usedTotal), s.wasteTotal, round(s.expected), s.counted,
      round(s.difference), s.pct, ing.unit === 'pcs' ? 0 : ing.limitPct, s.over ? 'Yes' : 'No', s.to.countedBy,
    ]);
    downloadBytes(makeXlsx('Differences', header, body, [26, 12, 7, 26, 6, 12, 10, 14, 12, 12, 12, 12, 12, 9, 11, 14]), `Title Brew differences ${from} to ${to}.xlsx`);
  }

  return (
    <>
      <MobileWho />
      <Head eyebrow="Stock" title="Differences" sub="Difference = counted − expected. Tap a line to see how it was worked out, down to each receipt." />
      <DateRange from={from} to={to} today={today} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      <div className="banner info"><span>For now: sales come live from Loyverse for <b>yesterday and today</b>. Counts come from your Google Sheet. Deliveries are taken from the sheet's orders, as arriving the next morning.</span></div>
      <div className="fieldset noprint" style={{ alignItems: 'flex-end' }}>
        <label>Ingredient
          <select className="field" value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="">All</option>
            {data.book.ingredients.filter((i) => i.active).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={onlyOver} onChange={(e) => setOnlyOver(e.target.checked)} /> Only above the limit</label>
        <button className="btn sm" onClick={exportXlsx} disabled={!rows.length}>Download Excel</button>
      </div>
      {sd.loading && <p className="sub">Loading sales…</p>}
      {sd.error && <div className="banner bad">Could not load sales: {sd.error}</div>}
      {!sd.loading && !rows.length && <div className="empty"><h2>No differences to show</h2><p className="sub" style={{ margin: 0 }}>Differences appear once an ingredient has been counted twice in these days.</p></div>}
      {rows.length > 0 && (
        <div className="panel">
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Count</th><th>Ingredient</th><th className="n">Expected</th><th className="n">Counted</th><th className="n">Difference</th></tr></thead>
              <tbody>
                {rows.map((r, i) => [
                  <tr key={i} className="clickable" onClick={() => setOpen(open === i ? null : i)}>
                    <td style={{ whiteSpace: 'nowrap' }}><b>{fmtShortDate(r.step.to.businessDate)}</b><span className="why">{r.ing.countFrom.includes('wk-') ? 'Weekly' : `Shift ${r.step.to.shift}`}, {fmtDubaiTime(r.step.to.at)}</span></td>
                    <td>{r.ing.name}</td>
                    <td className="n">{amt(r.step.expected, r.ing.unit)}{soldMoreThanCounted(r.step.expected) > 0 && <span className="why">Sold more than was counted</span>}</td>
                    <td className="n">{amt(r.step.counted, r.ing.unit)}</td>
                    <td className="n"><span className={'pill ' + diffClass(r.step)}>{signed(r.step.difference, r.ing.unit)}{r.step.pct !== null ? ` (${r.step.pct}%)` : ''}</span></td>
                  </tr>,
                  open === i && <tr key={i + 'x'}><td colSpan={5}><StepCard ing={r.ing} step={r.step} weekly={r.ing.countFrom.includes('wk-')} /></td></tr>,
                ])}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

const round = (v: number) => Math.round(v * 10) / 10;
