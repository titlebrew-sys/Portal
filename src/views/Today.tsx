import { useApp } from '../ctx';
import { Head, MobileWho, aed } from '../components';
import { dropped, dueToday, expiring, lastWeekly, sessionOf, zeroStock } from '../lib/derive';
import { addDays, fmtDayMonth, fmtDubaiTime, fmtLongDate, fmtShortDate, greeting, isShift1Locked } from '../lib/time';
import { fmtNum } from '../lib/ordering';

export function Today() {
  const { data, me, today, store } = useApp();
  const owner = me.role === 'owner';
  const due = dueToday(data, today);
  const sent = data.orders.filter((o) => o.businessDate === today);
  const exp = expiring(data, today);
  const zero = zeroStock(data, today);
  const drop = dropped(data, today);
  const weekAgo = addDays(today, -6);
  const waste7 = data.waste.filter((w) => w.date >= weekAgo);
  const wasteQty = waste7.reduce((a, w) => a + w.qty, 0);
  const weekly = lastWeekly(data, today);
  const locked = isShift1Locked(today);

  const status = (area: 'Bar' | 'Kitchen') => {
    const s = sessionOf(data, today, 1, area);
    return (
      <div className="r">
        <div className="t">
          <b>{area}</b>
          <span>{s ? `${s.savedBy} saved at ${fmtDubaiTime(s.savedAt)}` : locked ? 'Locked at 5pm' : 'Due before 4pm'}</span>
        </div>
        {s ? <span className="pill p-good">Done {s.done} of {s.total}</span> : <span className={'pill ' + (locked ? 'p-bad' : 'p-warn')}>{locked ? 'Missed' : 'Not started'}</span>}
      </div>
    );
  };

  const netYear = data.sales.reduce((a, r) => a + r.net, 0);

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
          <div className="panel-h"><h2>Shift 1 counts</h2><a href="#count">Open</a></div>
          <div className="rows">
            {status('Bar')}
            {status('Kitchen')}
            <div className="r">
              <div className="t"><b>Weekly</b><span>Packaging, cups, chips</span></div>
              {weekly ? <span className="pill p-good">Done {fmtShortDate(weekly.businessDate)}</span> : <span className="pill p-warn">Due this week</span>}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h2>Orders to send</h2><a href="#orders">Open</a></div>
          <div className="stat">{due.length}<small>suppliers, {due.reduce((a, p) => a + p.lines.filter((l) => l.qty > 0).length, 0)} items</small></div>
          <div className="rows">
            {due.map((p) => (
              <div className="r" key={p.supplier.id}>
                <div className="t"><b>{p.supplier.name}</b><span>{p.supplier.how}</span></div>
                <span className="pill p-s1">Cutoff {p.supplier.cutoff}</span>
              </div>
            ))}
            {sent.length > 0 && (
              <div className="r"><div className="t"><b>Sent today</b><span>{sent.map((o) => data.suppliers.find((s) => s.id === o.supplierId)?.name).join(', ')}</span></div><span className="pill p-good">{sent.length}</span></div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h2>Expiry check</h2><a href="#count">Kitchen</a></div>
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
              <div className="stat">{aed(netYear / 365)}<small>a day, {data.salesPeriod ?? 'last import'}</small></div>
            ) : (
              <p className="sub" style={{ margin: 0 }}>Import your Loyverse item sales export on the Sales page.</p>
            )}
            <p className="sub" style={{ margin: 0 }}>Today's live sales appear here once Loyverse is connected.</p>
            <a className="link mobile-only" href="#rules">Items and rules</a>
          </div>
        )}

        <div className="panel">
          <div className="panel-h"><h2>Stock to watch</h2><a href="#count">Bar</a></div>
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
