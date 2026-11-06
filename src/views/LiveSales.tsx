import { useEffect, useState } from 'react';
import { useApp } from '../ctx';
import { Head, MobileWho, aed } from '../components';
import type { Receipt, SalesReport } from '../types';
import { addDays, fmtShortDate } from '../lib/time';
import { dayEnd, dayStart, receiptsBetween } from '../lib/useStock';
import { DateRange, Tap, whenText } from './stockParts';

/** Same dates one year earlier. */
const lastYear = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`.replace(/-02-29$/, '-02-28');

function change(now: number, before: number | undefined) {
  if (before === undefined || before === 0) return null;
  const p = Math.round(((now - before) / Math.abs(before)) * 100);
  return <span className={'pill ' + (p >= 0 ? 'p-good' : 'p-bad')}>{p >= 0 ? '+' : ''}{p}% vs last year</span>;
}

export function LiveSales() {
  const { store, today } = useApp();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [now, setNow] = useState<SalesReport | null>(null);
  const [before, setBefore] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let live = true;
    setNow(null);
    Promise.all([store.salesReport(from, to), store.salesReport(lastYear(from), lastYear(to))])
      .then(([a, b]) => { if (live) { setNow(a); setBefore(b); setError(null); } })
      .catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [store, from, to]);

  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  const t = now?.totals;
  const bt = before?.totals;
  const maxDay = Math.max(1, ...(now?.byDay ?? []).map((d) => d.sales));
  const maxHour = Math.max(1, ...(now?.byHour ?? []).map((d) => d.sales));
  const lyItem = new Map((before?.byItem ?? []).map((i) => [i.item, i]));
  const items = (now?.byItem ?? []).filter((i) => !q || i.item.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <MobileWho />
      <Head eyebrow={`Loyverse sales, ${fmtShortDate(from)} to ${fmtShortDate(to)} (${days} ${days === 1 ? 'day' : 'days'})`} title="Sales"
        sub="Live from Loyverse, updated every 5 minutes. A day runs from 4am to 4am, Dubai time. Refunds are taken off; cancelled receipts are left out." />
      <DateRange from={from} to={to} today={today} onChange={(f, tt) => { setFrom(f); setTo(tt); }} />
      {error && <div className="banner bad">Could not load sales: {error}</div>}
      {!now && !error && <p className="sub">Loading…</p>}
      {now && t && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
            <div className="panel"><div className="stat">{aed(t.sales)}</div><p className="sub" style={{ margin: 0 }}>Sales, about {aed(t.sales / days)} a day</p>{change(t.sales, bt?.sales)}</div>
            <div className="panel"><div className="stat">{t.receipts.toLocaleString('en-US')}</div><p className="sub" style={{ margin: 0 }}>Receipts</p>{change(t.receipts, bt?.receipts)}</div>
            <div className="panel"><div className="stat">{t.receipts ? aed(t.sales / t.receipts) : '–'}</div><p className="sub" style={{ margin: 0 }}>Average receipt</p>{bt?.receipts ? change(t.sales / t.receipts, bt.sales / bt.receipts) : null}</div>
            <div className="panel"><div className="stat">{Math.round(t.items).toLocaleString('en-US')}</div><p className="sub" style={{ margin: 0 }}>Items sold</p>{change(t.items, bt?.items)}</div>
          </div>
          {bt && <p className="sub">Last year, same dates ({fmtShortDate(lastYear(from))} to {fmtShortDate(lastYear(to))}): {aed(bt.sales)} from {bt.receipts.toLocaleString('en-US')} receipts.</p>}
          <div className="grid">
            <div className="panel">
              <h2>By day</h2>
              <div className="bars">
                {now.byDay.map((d) => (
                  <div key={d.date}>
                    <div className="bar-r" style={{ gridTemplateColumns: '92px minmax(0,1fr) 90px' }}>
                      <span>{fmtShortDate(d.date)}</span><div className="track"><i style={{ width: `${(d.sales / maxDay) * 100}%`, background: 'var(--s1)' }} /></div>
                      <span className="mono" style={{ textAlign: 'right' }}><Tap label={aed(d.sales)}><DayReceipts day={d.date} /></Tap></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <h2>By hour (Dubai time)</h2>
              <div className="bars">
                {now.byHour.map((h) => (
                  <div key={h.hour} className="bar-r" style={{ gridTemplateColumns: '60px minmax(0,1fr) 90px' }}>
                    <span>{String(h.hour).padStart(2, '0')}:00</span><div className="track"><i style={{ width: `${(h.sales / maxHour) * 100}%`, background: 'var(--s2)' }} /></div>
                    <span className="mono" style={{ textAlign: 'right' }}>{aed(h.sales)}</span>
                  </div>
                ))}
              </div>
              <p className="sub" style={{ margin: 0 }}>{now.byHour.length ? `Busiest: ${String(now.byHour.reduce((a, b) => (b.sales > a.sales ? b : a)).hour).padStart(2, '0')}:00` : ''}</p>
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><h2>By item</h2><input className="field" placeholder="Find an item" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} /></div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Item</th><th className="n">Sold</th><th className="n">Sales</th><th className="n">Last year sold</th></tr></thead>
                <tbody>
                  {items.slice(0, 60).map((i) => (
                    <tr key={i.item}><td>{i.item}</td><td className="n">{Math.round(i.qty).toLocaleString('en-US')}</td><td className="n">{aed(i.sales)}</td><td className="n">{lyItem.get(i.item)?.qty?.toLocaleString('en-US') ?? '–'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <h2>By choice</h2>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Choice</th><th className="n">Times chosen</th><th className="n">Extra charged</th></tr></thead>
                <tbody>
                  {now.byModifier.slice(0, 60).map((m) => (
                    <tr key={m.group + m.option}><td>{m.group}: {m.option}</td><td className="n">{Math.round(m.qty).toLocaleString('en-US')}</td><td className="n">{m.sales ? aed(m.sales) : '–'}</td></tr>
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

/** Receipts of one day, opened from a day total. */
function DayReceipts({ day }: { day: string }) {
  const { store } = useApp();
  const [list, setList] = useState<Receipt[] | null>(null);
  useEffect(() => { receiptsBetween(store, dayStart(day), dayEnd(day)).then(setList).catch(() => setList([])); }, [store, day]);
  if (!list) return <p className="sub">Loading…</p>;
  return (
    <div className="tbl-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
      <table>
        <tbody>
          {list.filter((r) => !r.cancelled).map((r) => (
            <tr key={r.number}><td>{whenText(r.at)}</td><td className="mono">{r.number}</td><td>{r.lines.map((l) => `${l.qty} ${l.itemName}`).join(', ')}</td><td className="n">{r.total !== null ? aed(r.type === 'REFUND' ? -r.total : r.total) : ''}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
