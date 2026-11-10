import { useApp } from '../ctx';
import { Head, MobileWho, aed } from '../components';
import { dropped, expiring, lastWeekly, sessionOf, zeroStock } from '../lib/derive';
import { itemsToOrder, sheetDue, sheetSent } from '../lib/sheetOrders';
import { addDays, fmtDayMonth, fmtDubaiTime, fmtLongDate, fmtShortDate, greeting, isShift1Locked } from '../lib/time';
import { fmtNum } from '../lib/ordering';
import { periodInfo } from '../lib/csv';
import { useEffect, useMemo, useState } from 'react';
import type { LiveSales } from '../types';
import { dayTotals } from './SalesToday';
import { useStockData } from '../lib/useStock';
import { soldMoreThanCounted } from '../lib/stock';
import { differenceRows } from './Differences';
import { amt, countLabel, signed } from './stockParts';

export function Today() {
  const { data, me, today, store } = useApp();
  const owner = me.role === 'owner';
  const due = sheetDue(data);
  const sent = sheetSent(data);
  const exp = expiring(data, today);
  const zero = zeroStock(data, today);
  const drop = dropped(data, today);
  const weekAgo = addDays(today, -6);
  const waste7 = data.waste.filter((w) => w.date >= weekAgo);
  const wasteQty = waste7.reduce((a, w) => a + w.qty, 0);
  const weekly = lastWeekly(data, today);
  const locked = isShift1Locked(today);

  const status = (area: 'Bar' | 'Kitchen', shift: 1 | 2) => {
    const s = sessionOf(data, today, shift, area);
    let waiting: { text: string; pill: string; cls: string };
    if (shift === 1) waiting = locked ? { text: 'Locked at 5pm', pill: 'Missed', cls: 'p-bad' } : { text: 'Due before 4pm', pill: 'Not started', cls: 'p-warn' };
    else waiting = locked ? { text: 'Closing count at 9pm', pill: 'Not started', cls: 'p-warn' } : { text: 'Closing count at 9pm', pill: 'Later', cls: 'p-mute' };
    return (
      <div className="r" key={area + shift}>
        <div className="t">
          <b>{area}, Shift {shift}</b>
          <span>{s ? `${s.savedBy} saved at ${fmtDubaiTime(s.savedAt)}` : waiting.text}</span>
        </div>
        {s ? <span className={'pill ' + (s.done < s.total ? 'p-warn' : 'p-good')}>Done {s.done} of {s.total}</span> : <span className={'pill ' + waiting.cls}>{waiting.pill}</span>}
      </div>
    );
  };

  const netYear = data.sales.reduce((a, r) => a + r.net, 0);
  // Same day count as the Sales page: the period typed at import, e.g. 730 days for two years.
  const period = periodInfo(data.salesPeriod);

  return (
    <>
      <MobileWho />
      <Head
        eyebrow={fmtLongDate(today)}
        title={owner ? `${greeting()}, ${me.name}` : 'Today at Title Brew'}
        sub={owner ? 'Everything that needs you today, in one place.' : 'Your tasks for this shift.'}
        right={store.mode === 'demo' ? <span className="proto desk">Demo with prototype data</span> : undefined}
      />
      <div className="grid">
        <div className="panel">
          <div className="panel-h"><h2>Today's counts</h2></div>
          <div className="rows">
            {status('Bar', 1)}
            {status('Bar', 2)}
            {status('Kitchen', 1)}
            {status('Kitchen', 2)}
            <div className="r">
              <div className="t"><b>Weekly</b><span>Packaging, cups, chips</span></div>
              {weekly ? <span className="pill p-good">Done {fmtShortDate(weekly.businessDate)}</span> : <span className="pill p-warn">Due this week</span>}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h2>Orders to send</h2></div>
          <div className="stat">{due.length}<small>suppliers, {due.reduce((a, p) => a + itemsToOrder(p).length, 0)} items</small></div>
          <div className="rows">
            {due.map((p) => (
              <div className="r" key={p.name}>
                <div className="t"><b>{p.name}</b><span>{p.how}</span></div>
                <span className="pill p-s1">Cutoff {data.suppliers.find((x) => x.name === p.name)?.cutoff ?? ''}</span>
              </div>
            ))}
            {sent.length > 0 && (
              <div className="r"><div className="t"><b>Sent today</b><span>{sent.map((o) => o.name).join(', ')}</span></div><span className="pill p-good">{sent.length}</span></div>
            )}
            {!data.sheetOrders && <div className="r"><div className="t"><span>Waiting for the first copy of Today's Orders from the sheet.</span></div></div>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h2>Expiry check</h2></div>
          <div className="rows">
            {exp.length ? (
              exp.map((k) => (
                <div className="r" key={k.item.id}>
                  <div className="t"><b>{k.item.name}</b><span>{fmtNum(k.qty)} in old batch, expires {fmtDayMonth(k.exp)}</span></div>
                  <span className={'pill ' + (k.exp < today ? 'p-bad' : 'p-warn')}>{k.exp < today ? 'Expired' : 'Today'}</span>
                </div>
              ))
            ) : (
              <div className="r"><div className="t"><b>Nothing old in stock is expiring</b><span>Checked against today's Shift 1 count</span></div><span className="pill p-good">Clear</span></div>
            )}
          </div>
        </div>

        {owner && (
          <div className="panel">
            <div className="panel-h"><h2>Sales</h2><a href="#sales">Open</a></div>
            {netYear > 0 ? (
              <div className="stat">{aed(netYear / period.days)}<small>a day, {data.salesPeriod ?? 'last import'} ({period.read ? `${period.days} days` : '365 days assumed'})</small></div>
            ) : null}
            <TodaySales />
            <a className="link mobile-only" href="#rules">Items and rules</a>
          </div>
        )}

        <DifferenceAlerts />

        <div className="panel">
          <div className="panel-h"><h2>Stock to watch</h2></div>
          <div className="rows">
            {zero.map((b) => (
              <div className="r" key={b.id}><div className="t"><b>{b.name}</b><span>Counted 0 {b.unit} today</span></div><span className="pill p-bad">Out</span></div>
            ))}
            {drop.slice(0, 4).map((b) => (
              <div className="r" key={b.item.id}>
                <div className="t"><b>{b.item.name}</b><span><span className="mono">{fmtNum(b.now)}</span> {b.item.unit}, was <span className="mono">{fmtNum(b.was)}</span> last night</span></div>
                <span className="pill p-warn">Down {b.pct}%</span>
              </div>
            ))}
            {!zero.length && !drop.length && <div className="r"><div className="t"><b>Nothing unusual</b><span>After today's Shift 1 count</span></div><span className="pill p-good">Clear</span></div>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h2>Thrown away</h2><a href="#waste">Open</a></div>
          <div className="stat">{fmtNum(wasteQty)}<small>pieces, last 7 days</small></div>
          <div className="rows">
            {waste7.slice(-3).reverse().map((w) => (
              <div className="r" key={w.id}><div className="t"><b>{w.item}</b><span>{fmtShortDate(w.date)}</span></div><span className="pill p-mute">{fmtNum(w.qty)} {w.reason.toLowerCase()}</span></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** Counts from yesterday and today that differ from expected by more than the limit. */
function DifferenceAlerts() {
  const { data, store, today } = useApp();
  const from = addDays(today, -1);
  const sd = useStockData(data, store, from, today);
  const over = useMemo(() => {
    if (!data.book.ingredients.length) return [];
    const seen = new Set<string>();
    return differenceRows(data.book.ingredients.filter((i) => i.active), sd.inputs, from, today).filter((r) => {
      if (!r.step.over || seen.has(r.ing.id)) return false;
      seen.add(r.ing.id);
      return true;
    });
  }, [data.book.ingredients, sd.inputs, from, today]);
  if (!data.book.ingredients.length) return null;
  return (
    <div className="panel">
      <div className="panel-h"><h2>Stock differences</h2><a href="#differences">Open</a></div>
      <div className="rows">
        {sd.loading && <div className="r"><div className="t"><span>Checking the last counts against sales…</span></div></div>}
        {!sd.loading && !over.length && <div className="r"><div className="t"><b>Counts match what was expected</b><span>Yesterday and today, within the limits</span></div><span className="pill p-good">Clear</span></div>}
        {over.slice(0, 6).map((r) => (
          <a key={r.ing.id} className="r" href="#differences" style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="t"><b>{r.ing.name}</b><span>{countLabel(r.step.to)}: counted {amt(r.step.counted, r.ing.unit)}, {soldMoreThanCounted(r.step.expected) > 0 ? `sales used ${amt(soldMoreThanCounted(r.step.expected), r.ing.unit)} more than was counted` : `expected ${amt(r.step.expected, r.ing.unit)}`}</span></div>
            <span className="pill p-bad">{signed(r.step.difference, r.ing.unit)}</span>
          </a>
        ))}
        {over.length > 6 && <div className="r"><div className="t"><span>and {over.length - 6} more</span></div></div>}
      </div>
    </div>
  );
}

/** Today so far, straight from Loyverse, with the till check. */
function TodaySales() {
  const { store } = useApp();
  const [live, setLive] = useState<LiveSales | null | undefined>(undefined);
  useEffect(() => { store.liveSales().then(setLive).catch(() => setLive(null)); }, [store]);
  if (live === undefined) return <p className="sub" style={{ margin: 0 }}>Checking today's sales…</p>;
  if (!live) return <p className="sub" style={{ margin: 0 }}>Could not reach Loyverse right now.</p>;
  const t = dayTotals(live.receipts.filter((r) => r.businessDate === live.today));
  const warn = live.checks.find((c) => c.level !== 'ok');
  return (
    <>
      <p className="sub" style={{ margin: 0 }}><b>Today so far: {aed(t.sales)}</b> from {t.count} receipts.</p>
      {warn && <p className="sub" style={{ margin: 0, color: warn.level === 'bad' ? 'var(--bad)' : 'var(--warn)' }}>{warn.text}</p>}
    </>
  );
}
