import { useState, type ReactNode } from 'react';
import type { Ingredient, SyncRun } from '../types';
import type { Step, UseBit } from '../lib/stock';
import { addDays, dubaiClock, fmtDubaiTime, fmtShortDate } from '../lib/time';
import { amount } from '../lib/usage';

/** "1,234.5 g" — always g, ml or pieces. */
export const amt = (qty: number | null | undefined, unit: string) => {
  if (qty === null || qty === undefined || Number.isNaN(qty)) return '–';
  const v = Math.round(qty * 10) / 10;
  if (unit === 'pcs') return `${v.toLocaleString('en-US')} ${Math.abs(v) === 1 ? 'piece' : 'pieces'}`;
  return `${v.toLocaleString('en-US')} ${unit}`;
};
export const signed = (qty: number, unit: string) => (qty > 0 ? '+' : qty < 0 ? '−' : '') + amt(Math.abs(qty), unit);

export const whenText = (iso: string) => `${fmtShortDate(new Date(Date.parse(iso)).toISOString().slice(0, 10))} ${fmtDubaiTime(iso)}`;
export const countLabel = (s: { businessDate: string; shift: number }, weekly = false) =>
  `${weekly ? 'Weekly count' : s.shift === 2 ? 'Closing count' : `Shift ${s.shift}`}, ${fmtShortDate(s.businessDate)}`;

/** "Sat 7 Nov" or "Fri 6 Nov to Sat 7 Nov": the business days a difference covers. */
export const daysText = (step: Step) => {
  const first = addDays(step.from.businessDate, 1);
  return first === step.to.businessDate ? fmtShortDate(first) : `${fmtShortDate(first)} to ${fmtShortDate(step.to.businessDate)}`;
};

/** From/to date picker with quick choices. Dates are business days (4am to 4am Dubai). */
export function DateRange({ from, to, onChange, today }: { from: string; to: string; today: string; onChange: (from: string, to: string) => void }) {
  const quick: [string, string, string][] = [
    ['Today', today, today],
    ['Yesterday', addDays(today, -1), addDays(today, -1)],
    ['Last 7 days', addDays(today, -6), today],
    ['Last 30 days', addDays(today, -29), today],
  ];
  return (
    <div className="fieldset noprint" style={{ alignItems: 'flex-end' }}>
      <label>From<input className="field date" type="date" value={from} max={to} onChange={(e) => e.target.value && onChange(e.target.value, to)} /></label>
      <label>To<input className="field date" type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && onChange(from, e.target.value)} /></label>
      <div className="quiet">
        {quick.map(([l, f, t]) => (
          <button key={l} type="button" className="btn sm" aria-pressed={from === f && to === t} onClick={() => onChange(f, t)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

/** A number that opens to show how it was worked out. */
export function Tap({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="link tap" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>
      {open && <div className="tap-body">{children}</div>}
    </>
  );
}

/** Each sale that used this ingredient, with the receipt number, time, choices and why. */
export function UsedList({ used, unit }: { used: UseBit[]; unit: string }) {
  if (!used.length) return <p className="sub">No sales used this.</p>;
  const byItem = new Map<string, number>();
  for (const u of used) byItem.set(u.item, (byItem.get(u.item) ?? 0) + u.qty);
  return (
    <>
      <p className="sub" style={{ margin: '0 0 6px' }}>
        {[...byItem].sort((a, b) => b[1] - a[1]).map(([i, q]) => `${i} ${amt(q, unit)}`).join(' · ')}
      </p>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Time</th><th>Receipt</th><th>Sold</th><th className="n">Used</th><th>Why</th></tr></thead>
          <tbody>
            {used.slice().sort((a, b) => (a.at < b.at ? -1 : 1)).map((u, i) => (
              <tr key={i}>
                <td>{whenText(u.at)}</td><td className="mono">{u.receipt}</td>
                <td>{u.item}{u.choices && <span className="why">{u.choices}</span>}</td>
                <td className="n">{amt(u.qty, unit)}</td><td style={{ fontSize: 13, color: 'var(--muted)' }}>{u.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** One count compared with what was expected, in words, every number tappable. */
export function StepCard({ ing, step, weekly = false }: { ing: Ingredient; step: Step; weekly?: boolean }) {
  const u = ing.unit;
  return (
    <div className={'item' + (step.over ? ' flag' : '')} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div className="panel-h">
        <b>{countLabel(step.to, weekly)}</b>
        <span className={'pill ' + (step.over ? 'p-bad' : 'p-good')}>
          {step.over ? 'Above the limit' : 'Within the limit'}: {signed(step.difference, u)}{step.pct !== null ? ` (${step.pct > 0 ? '+' : ''}${step.pct}%)` : ''}
        </span>
      </div>
      <div className="breakdown">
        <div><span>Last count ({countLabel(step.from, weekly)}, {step.from.countedBy})</span><Tap label={amt(step.from.value, u)}><CountParts parts={step.from.parts} unit={u} /></Tap></div>
        <p className="sub" style={{ margin: 0 }}>Sales, deliveries and waste of {daysText(step)} (whole day, 4am to 4am).</p>
        <div><span>+ arrived</span>
          {step.arrived.length ? <Tap label={amt(step.arrivedTotal, u)}>{step.arrived.map((a, i) => <p key={i} className="sub" style={{ margin: 0 }}>{whenText(a.at)}: {amt(a.qty, u)} from {a.supplier}</p>)}</Tap> : <b>{amt(0, u)}</b>}
        </div>
        <div><span>− used by sales</span><Tap label={amt(step.usedTotal, u)}><UsedList used={step.used} unit={u} /></Tap></div>
        <div><span>− thrown away</span>
          {step.waste.length ? <Tap label={amt(step.wasteTotal, u)}>{step.waste.map((w, i) => <p key={i} className="sub" style={{ margin: 0 }}>{whenText(w.at)}: {w.item} {amt(w.qty, u)} ({w.reason.toLowerCase()})</p>)}</Tap> : <b>{amt(0, u)}</b>}
        </div>
        <div className="total"><span>= expected</span><b>{amt(step.expected, u)}</b></div>
        <div><span>Counted ({step.to.countedBy})</span><Tap label={amt(step.counted, u)}><CountParts parts={step.to.parts} unit={u} /></Tap></div>
        <div className="total"><span>Difference = counted − expected</span><b style={{ color: step.over ? 'var(--bad)' : undefined }}>{signed(step.difference, u)}</b></div>
      </div>
    </div>
  );
}

export function CountParts({ parts, unit }: { parts: { name: string; qty: number; factor: number }[]; unit: string }) {
  return (
    <p className="sub" style={{ margin: 0 }}>
      {parts.map((p) => (p.factor === 1 ? `${p.name}: ${p.qty}` : `${p.name}: ${p.qty} × ${p.factor} = ${amt(p.qty * p.factor, unit)}`)).join(' · ')}
    </p>
  );
}

/** "Last sync 3 minutes ago: 12 receipts" */
export function SyncLine({ runs }: { runs: SyncRun[] }) {
  const ly = runs.find((r) => r.kind === 'loyverse');
  const sheet = runs.find((r) => r.kind === 'sheet');
  const ago = (iso: string) => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    return m < 1 ? 'just now' : m < 60 ? `${m} minute${m === 1 ? '' : 's'} ago` : m < 1440 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`;
  };
  const stopped = (r: SyncRun) => !r.finishedAt && Date.now() - Date.parse(r.startedAt) > 3 * 60_000;
  const lyText = (r: SyncRun) => (stopped(r) ? 'stopped before finishing, the next run carries on' : r.message);
  const latest = runs.filter((r) => r.kind === 'loyverse' && r.latestReceiptAt).map((r) => r.latestReceiptAt!).sort().pop();
  return (
    <div className="rows">
      <div className="r">
        <div className="t">
          <b>Loyverse sales</b>
          <span>{ly ? `Last checked ${ago(ly.startedAt)}: ${lyText(ly)}` : 'Not connected yet'}{latest ? `. Newest sale ${whenText(latest)}` : ''}</span>
        </div>
        <span className={'pill ' + (!ly ? 'p-mute' : stopped(ly) ? 'p-warn' : ly.ok ? 'p-good' : 'p-bad')}>{!ly ? 'Off' : stopped(ly) ? 'Catching up' : ly.ok ? 'Working' : 'Problem'}</span>
      </div>
      <div className="r">
        <div className="t"><b>Google Sheet counts</b><span>{sheet ? `Last received ${ago(sheet.startedAt)}: ${sheet.message}` : 'Nothing received yet'}</span></div>
        <span className={'pill ' + (!sheet ? 'p-mute' : sheet.ok ? 'p-good' : 'p-warn')}>{!sheet ? 'Waiting' : sheet.ok ? 'Working' : 'Check'}</span>
      </div>
    </div>
  );
}

export const hourNow = () => dubaiClock().hour;
export { amount };
