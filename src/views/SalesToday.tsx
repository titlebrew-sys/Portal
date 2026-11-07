import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { Head, MobileWho, aed } from '../components';
import type { LiveReceipt, LiveSales } from '../types';
import { fmtDubaiTime, fmtLongDate } from '../lib/time';

/** Totals for one day: refunds taken off, cancelled receipts left out. */
export function dayTotals(receipts: LiveReceipt[]) {
  let sales = 0, count = 0, items = 0, refunds = 0, cancelled = 0, discounts = 0;
  for (const r of receipts) {
    if (r.cancelled) { cancelled++; continue; }
    const sign = r.type === 'REFUND' ? -1 : 1;
    sales += sign * r.total;
    discounts += sign * r.discount;
    if (sign > 0) count++; else refunds++;
    for (const l of r.lines) items += sign * l.qty;
  }
  return { sales, count, items, refunds, cancelled, discounts };
}

const PILL = { ok: 'p-good', warn: 'p-warn', bad: 'p-bad' } as const;
const MARK = { ok: '✓', warn: '!', bad: '✕' } as const;

/** Yesterday's and today's sales, straight from Loyverse, refreshed every minute. */
export function SalesToday() {
  const { store } = useApp();
  const [live, setLive] = useState<LiveSales | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const load = useCallback(async () => {
    setBusy(true);
    try {
      setLive(await store.liveSales());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [store]);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const date = live ? (day === 'today' ? live.today : live.yesterday) : null;
  const receipts = useMemo(() => (live?.receipts ?? []).filter((r) => r.businessDate === date), [live, date]);
  const t = dayTotals(receipts);

  return (
    <>
      <MobileWho />
      <Head eyebrow={date ? fmtLongDate(date) : 'Loyverse'} title="Sales today" sub="Straight from Loyverse, refreshed every minute. A shop day runs from 4am to 4am, Dubai time." />
      <div className="head noprint" style={{ alignItems: 'center' }}>
        <div className="tabs">
          <button className="btn sm" aria-pressed={day === 'today'} onClick={() => setDay('today')}>Today</button>
          <button className="btn sm" aria-pressed={day === 'yesterday'} onClick={() => setDay('yesterday')}>Yesterday</button>
        </div>
        <div className="quiet" style={{ alignItems: 'center' }}>
          {live && <span className="sub" style={{ margin: 0 }}>Updated {fmtDubaiTime(live.checkedAt)}</span>}
          <button className="btn sm" onClick={load} disabled={busy}>{busy ? 'Checking…' : 'Refresh now'}</button>
        </div>
      </div>

      <div className="panel">
        <h2>Is the till live?</h2>
        {!live && !error && <p className="sub">Checking Loyverse…</p>}
        {error && <div className="banner bad">{error}</div>}
        <div className="rows">
          {live?.checks.map((c, i) => (
            <div className="r" key={i}>
              <span className={'pill ' + PILL[c.level]} aria-label={c.level}>{MARK[c.level]}</span>
              <div className="t"><b style={{ fontWeight: 500 }}>{c.text}</b></div>
            </div>
          ))}
        </div>
      </div>

      {live && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
            <div className="panel"><div className="stat">{aed(t.sales)}</div><p className="sub" style={{ margin: 0 }}>Sales</p></div>
            <div className="panel"><div className="stat">{t.count}</div><p className="sub" style={{ margin: 0 }}>Receipts</p></div>
            <div className="panel"><div className="stat">{t.count ? aed(t.sales / t.count) : '–'}</div><p className="sub" style={{ margin: 0 }}>Average receipt</p></div>
            <div className="panel"><div className="stat">{Math.round(t.items)}</div><p className="sub" style={{ margin: 0 }}>Items sold</p></div>
          </div>
          <p className="sub" style={{ margin: 0 }}>
            {t.refunds} refund{t.refunds === 1 ? '' : 's'} taken off · {t.cancelled} cancelled receipt{t.cancelled === 1 ? '' : 's'} left out · discounts given {aed(t.discounts)}
          </p>
          <ByHour receipts={receipts} />
          <ByItem receipts={receipts} />
          <Receipts receipts={receipts} />
        </>
      )}
    </>
  );
}

function ByHour({ receipts }: { receipts: LiveReceipt[] }) {
  const hours = new Map<number, number>();
  for (const r of receipts) {
    if (r.cancelled) continue;
    const h = new Date(Date.parse(r.at) + 4 * 3600_000).getUTCHours();
    hours.set(h, (hours.get(h) ?? 0) + (r.type === 'REFUND' ? -r.total : r.total));
  }
  const list = [...hours].sort((a, b) => a[0] - b[0]);
  const max = Math.max(1, ...list.map((x) => x[1]));
  if (!list.length) return null;
  return (
    <div className="panel">
      <h2>By hour</h2>
      <div className="bars">
        {list.map(([h, v]) => (
          <div key={h} className="bar-r" style={{ gridTemplateColumns: '56px minmax(0,1fr) 90px' }}>
            <span>{String(h).padStart(2, '0')}:00</span><div className="track"><i style={{ width: `${(v / max) * 100}%`, background: 'var(--s1)' }} /></div>
            <span className="mono" style={{ textAlign: 'right' }}>{aed(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ByItem({ receipts }: { receipts: LiveReceipt[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const items = new Map<string, { qty: number; sales: number; choices: Map<string, number> }>();
  for (const r of receipts) {
    if (r.cancelled) continue;
    const sign = r.type === 'REFUND' ? -1 : 1;
    for (const l of r.lines) {
      const name = l.variant ? `${l.item} (${l.variant})` : l.item;
      const it = items.get(name) ?? { qty: 0, sales: 0, choices: new Map() };
      it.qty += sign * l.qty;
      it.sales += sign * l.total;
      for (const m of l.modifiers) it.choices.set(`${m.group}: ${m.option}`, (it.choices.get(`${m.group}: ${m.option}`) ?? 0) + sign * l.qty);
      items.set(name, it);
    }
  }
  const list = [...items].sort((a, b) => b[1].sales - a[1].sales);
  if (!list.length) return null;
  return (
    <div className="panel">
      <h2>By item</h2>
      <p className="sub" style={{ margin: 0 }}>Tap an item to see the choices (milk, beans, syrup…).</p>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Item</th><th className="n">Sold</th><th className="n">Sales</th></tr></thead>
          <tbody>
            {list.map(([name, v]) => [
              <tr key={name} className="clickable" onClick={() => setOpen(open === name ? null : name)}>
                <td>{name}{v.choices.size > 0 && <span className="why">{v.choices.size} choice{v.choices.size > 1 ? 's' : ''}</span>}</td>
                <td className="n">{Math.round(v.qty)}</td><td className="n">{aed(v.sales)}</td>
              </tr>,
              open === name && v.choices.size > 0 && (
                <tr key={name + '-c'}><td colSpan={3}><div className="tap-body">
                  {[...v.choices].sort((a, b) => b[1] - a[1]).map(([c, q]) => <p key={c} className="sub" style={{ margin: '2px 0' }}>{c}: <b>{q}</b></p>)}
                </div></td></tr>
              ),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Receipts({ receipts }: { receipts: LiveReceipt[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const shown = receipts.filter((r) => !q || r.number.includes(q) || r.lines.some((l) => l.item.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="panel">
      <div className="panel-h"><h2>Every receipt ({receipts.length})</h2>
        <input className="field" placeholder="Receipt number or item" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} /></div>
      <div className="rows">
        {shown.slice(0, 200).map((r) => (
          <div key={r.number} className="r" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <button type="button" className="link" style={{ textAlign: 'left', color: 'inherit', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}
              onClick={() => setOpen(open === r.number ? null : r.number)}>
              <b className="mono">{fmtDubaiTime(r.at)}</b>
              <span style={{ flex: 1, minWidth: 160 }}>{r.lines.map((l) => `${l.qty} ${l.item}`).join(', ')}</span>
              {r.cancelled && <span className="pill p-mute">Cancelled</span>}
              {r.type === 'REFUND' && <span className="pill p-warn">Refund</span>}
              <b className="mono">{aed(r.type === 'REFUND' ? -r.total : r.total)}</b>
            </button>
            {open === r.number && (
              <div className="tap-body">
                <p className="sub" style={{ margin: '0 0 6px' }}>
                  Receipt {r.number} · {fmtDubaiTime(r.at)} · {r.employee ?? 'Staff not recorded'} · {r.dining ?? 'Dine in'}
                  {r.payments.length ? ` · Paid by ${r.payments.map((p) => `${p.name} ${aed(p.amount)}`).join(', ')}` : ' · No payment recorded'}
                  {r.store ? ` · ${r.store}` : ''}
                </p>
                {r.lines.map((l, i) => (
                  <p key={i} style={{ margin: '3px 0' }}>
                    <b>{l.qty} × {l.item}{l.variant ? ` (${l.variant})` : ''}</b> {aed(l.total)}
                    {l.modifiers.length > 0 && <span className="why">{l.modifiers.map((m) => `${m.option}${m.amount ? ` +${m.amount}` : ''}`).join(', ')}</span>}
                    {l.discount > 0 && <span className="why">Discount {aed(l.discount)}</span>}
                    {l.note && <span className="why">Note: {l.note}</span>}
                    {!l.inMenu && <span className="why" style={{ color: 'var(--warn)' }}>Not on the Loyverse menu (typed in by hand)</span>}
                  </p>
                ))}
                {r.discount > 0 && <p className="sub" style={{ margin: '4px 0 0' }}>Receipt discount {aed(r.discount)}</p>}
                {Date.parse(r.createdAt) - Date.parse(r.at) > 15 * 60_000 && (
                  <p className="sub" style={{ margin: '4px 0 0', color: 'var(--warn)' }}>Reached Loyverse at {fmtDubaiTime(r.createdAt)}, {Math.round((Date.parse(r.createdAt) - Date.parse(r.at)) / 60000)} minutes after the sale.</p>
                )}
              </div>
            )}
          </div>
        ))}
        {!shown.length && <p className="sub">No receipts.</p>}
      </div>
    </div>
  );
}
