import { useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { Head, MobileWho, aed } from '../components';
import type { Order } from '../types';
import { fmtNum } from '../lib/ordering';
import { addDays, businessDate, fmtDubaiTime, fmtShortDate } from '../lib/time';
import { DateRange } from './stockParts';
import { ReceiveCard } from './Receive';

type Kind = 'confirmed' | 'assumed' | 'shop' | 'extra' | 'waiting';

interface DeliveryView {
  order: Order;
  supplier: string;
  day: string;
  kind: Kind;
  by: string;
  at: string | null;
  paid: number | null;
  why: string;
  lines: { name: string; ordered: number | null; arrived: number }[];
}

/** What kind of delivery a record is, from who saved it. */
function kindOf(o: Order): Kind {
  const by = o.receivedBy ?? '';
  if (!o.receivedAt) return 'waiting';
  if (by.includes('(not ordered)')) return o.message.startsWith('Bought from a shop') ? 'shop' : 'extra';
  if (by.includes('taken as delivered')) return 'assumed';
  return 'confirmed';
}

export function toView(o: Order, supplierName: string): DeliveryView {
  const kind = kindOf(o);
  const paid = o.message.match(/AED ([\d.]+)/);
  const parts = o.message.split(' · ');
  const lines =
    kind === 'shop' || kind === 'extra'
      ? o.lines.map((l) => ({ name: l.name, ordered: null, arrived: l.qty }))
      : o.lines.map((l) => ({ name: l.name, ordered: l.qty, arrived: o.received?.find((r) => r.ruleId === l.ruleId)?.qty ?? (kind === 'waiting' ? 0 : l.qty) }));
  return {
    order: o,
    supplier: kind === 'shop' ? 'Bought from a shop' : supplierName,
    day: o.receivedAt ? businessDate(new Date(o.receivedAt)) : o.businessDate,
    kind,
    by: (o.receivedBy ?? '').replace(/\s*\((confirmed|not ordered)\)$/, ''),
    at: o.receivedAt,
    paid: paid ? Number(paid[1]) : null,
    why: kind === 'shop' || kind === 'extra' ? parts.slice(paid ? 2 : 1).join(' · ') : '',
    lines,
  };
}

/** Deliveries: what was ordered and what arrived, as confirmed in the staff app, plus shop purchases. */
export function Deliveries() {
  const { data, today } = useApp();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const supplierName = (id: string) => data.suppliers.find((s) => s.id === id)?.name ?? (id === 'sup-shop' ? 'Bought from a shop' : id);
  const all = useMemo(() => data.orders.map((o) => toView(o, supplierName(o.supplierId))), [data.orders, data.suppliers]); // eslint-disable-line react-hooks/exhaustive-deps
  const waiting = data.orders.filter((o) => !o.receivedAt && o.businessDate >= addDays(today, -7));
  const shown = all.filter((d) => d.kind !== 'waiting' && d.day >= from && d.day <= to && d.day <= today);
  const days = [...new Set(shown.map((d) => d.day))].sort().reverse();
  const notConfirmed = shown.filter((d) => d.kind === 'assumed');
  const short = shown.filter((d) => d.kind === 'confirmed' && d.lines.some((l) => l.ordered !== null && l.arrived < l.ordered));

  // Shop spending: this week and the 3 weeks before (weeks start on Monday)
  const shop = all.filter((d) => d.kind === 'shop');
  const monday = (iso: string) => addDays(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7));
  const thisWeek = monday(today);
  const weeks = [0, 1, 2, 3].map((n) => {
    const start = addDays(thisWeek, -7 * n);
    const list = shop.filter((d) => d.day >= start && d.day <= addDays(start, 6));
    return { start, total: list.reduce((a, d) => a + (d.paid ?? 0), 0), count: list.length };
  });
  const bought = new Map<string, number>();
  for (const d of shop.filter((x) => x.day >= addDays(today, -29))) for (const l of d.lines) bought.set(l.name, (bought.get(l.name) ?? 0) + 1);
  const often = [...bought].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <>
      <MobileWho />
      <Head eyebrow="Deliveries" title="Deliveries" sub="What was ordered and what arrived, as confirmed by staff in the app, plus anything bought from a shop." />
      <DateRange from={from} to={to} today={today} onChange={(f, t) => { setFrom(f); setTo(t); }} />

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <div className="panel"><div className="stat">{notConfirmed.length}</div><p className="sub" style={{ margin: 0 }}>Deliveries nobody confirmed</p></div>
        <div className="panel"><div className="stat">{short.length}</div><p className="sub" style={{ margin: 0 }}>Deliveries that came short</p></div>
        <div className="panel"><div className="stat">{aed(weeks[0].total)}</div><p className="sub" style={{ margin: 0 }}>Spent in shops this week ({weeks[0].count} {weeks[0].count === 1 ? 'time' : 'times'})</p></div>
      </div>

      {waiting.map((o) => <ReceiveCard key={o.id} o={o} />)}

      {days.map((day) => (
        <div className="panel" key={day}>
          <h2>{day === today ? 'Today' : fmtShortDate(day)}</h2>
          <div className="rows">
            {shown.filter((d) => d.day === day).map((d) => <DeliveryRow key={d.order.id} d={d} />)}
          </div>
        </div>
      ))}
      {!days.length && <div className="empty"><h2>No deliveries in these days</h2><p className="sub" style={{ margin: 0 }}>They appear after the 5pm and 11pm saves in the sheet.</p></div>}

      <div className="grid">
        <div className="panel">
          <h2>Shop spending by week</h2>
          <div className="rows">
            {weeks.map((w, i) => (
              <div className="r" key={w.start}>
                <div className="t"><b>{i === 0 ? 'This week' : `Week of ${fmtShortDate(w.start)}`}</b><span>{w.count} {w.count === 1 ? 'purchase' : 'purchases'}</span></div>
                <b className="mono">{aed(w.total)}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2>Bought from shops most often</h2>
          <p className="sub" style={{ margin: 0 }}>Last 30 days. Items that keep running out may need a bigger order.</p>
          <div className="rows">
            {often.length ? often.map(([n, c]) => (
              <div className="r" key={n}><div className="t"><b>{n}</b></div><span className="pill p-warn">{c} {c === 1 ? 'time' : 'times'}</span></div>
            )) : <div className="r"><div className="t"><span>Nothing bought from shops.</span></div></div>}
          </div>
        </div>
      </div>
    </>
  );
}

function DeliveryRow({ d }: { d: DeliveryView }) {
  const [open, setOpen] = useState(false);
  const shortItems = d.lines.filter((l) => l.ordered !== null && l.arrived !== l.ordered);
  const status =
    d.kind === 'confirmed' ? { cls: shortItems.length ? 'p-warn' : 'p-good', text: shortItems.length ? 'Different from the order' : 'Confirmed' }
      : d.kind === 'assumed' ? { cls: 'p-bad', text: 'Not confirmed' }
        : d.kind === 'shop' ? { cls: 'p-s1', text: d.paid !== null ? aed(d.paid) : 'Bought' }
          : { cls: 'p-s1', text: 'Extra, not ordered' };
  const who =
    d.kind === 'assumed' ? 'Nobody confirmed it. The portal assumes everything ordered arrived.'
      : `${d.by || 'Staff'}${d.at ? `, ${fmtDubaiTime(d.at)}` : ''}${d.why ? ` · ${d.why}` : ''}`;
  return (
    <div className="r" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <button type="button" className="link" style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'inherit', textAlign: 'left' }} onClick={() => setOpen(!open)}>
        <span className="t" style={{ flex: 1 }}><b>{d.supplier}</b><span>{who}</span></span>
        <span className={'pill ' + status.cls}>{status.text}</span>
      </button>
      {open && (
        <div className="tap-body">
          <table>
            <thead><tr><th>Item</th>{d.lines.some((l) => l.ordered !== null) && <th className="n">Ordered</th>}<th className="n">Arrived</th></tr></thead>
            <tbody>
              {d.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.name}</td>
                  {l.ordered !== null && <td className="n">{fmtNum(l.ordered)}</td>}
                  <td className="n" style={{ color: l.ordered !== null && l.arrived !== l.ordered ? 'var(--warn)' : undefined, fontWeight: l.ordered !== null && l.arrived !== l.ordered ? 700 : undefined }}>{fmtNum(l.arrived)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
