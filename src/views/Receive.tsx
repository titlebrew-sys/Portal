import { useState } from 'react';
import { useApp } from '../ctx';
import { Head, MobileWho, parseNum } from '../components';
import type { Order } from '../types';
import { fmtNum } from '../lib/ordering';
import { addDays, fmtDubaiTime, fmtShortDate } from '../lib/time';

export function Receive() {
  const { data, today } = useApp();
  const from = addDays(today, -7);
  const waiting = data.orders.filter((o) => !o.receivedAt && o.businessDate >= from).sort((a, b) => (a.sentAt < b.sentAt ? -1 : 1));
  const done = data.orders.filter((o) => o.receivedAt && o.businessDate >= addDays(today, -2)).sort((a, b) => (a.receivedAt! < b.receivedAt! ? 1 : -1));
  return (
    <>
      <MobileWho />
      <Head
        eyebrow="Deliveries"
        title="Receive a delivery"
        sub="When a delivery arrives, check what came in and fix any short or extra items. Received stock feeds the daily use the portal learns."
      />
      {!waiting.length && (
        <div className="empty">
          <h2>Nothing waiting</h2>
          <p className="sub" style={{ margin: 0 }}>Orders appear here after someone taps Mark as sent or Create LPO on the Orders page.</p>
        </div>
      )}
      {waiting.map((o) => <ReceiveCard key={o.id} o={o} />)}
      {done.length > 0 && (
        <div className="panel">
          <h2>Received recently</h2>
          <div className="rows">
            {done.map((o) => (
              <div className="r" key={o.id}>
                <div className="t"><b>{data.suppliers.find((s) => s.id === o.supplierId)?.name}</b><span>{fmtShortDate(o.receivedAt!.slice(0, 10))} at {fmtDubaiTime(o.receivedAt!)} by {o.receivedBy}</span></div>
                <span className="pill p-good">Received</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ReceiveCard({ o }: { o: Order }) {
  const { data, me, store, run } = useApp();
  const s = data.suppliers.find((x) => x.id === o.supplierId);
  const [got, setGot] = useState<Record<string, string>>(Object.fromEntries(o.lines.map((l) => [l.ruleId, String(l.qty)])));
  return (
    <section className="sup">
      <div className="sup-h">
        <div className="t"><b>{s?.name}</b><span>{o.lines.length} items ordered {fmtShortDate(o.businessDate)} by {o.sentBy}{o.lpoNumber ? `, LPO ${o.lpoNumber}` : ''}</span></div>
        <span className="pill p-warn">Expected</span>
      </div>
      <div className="sup-b" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Item</th><th className="n">Ordered</th><th className="n">Arrived</th><th>Unit</th></tr></thead>
            <tbody>
              {o.lines.map((l) => {
                const short = (parseNum(got[l.ruleId] ?? '') ?? 0) !== l.qty;
                return (
                  <tr key={l.ruleId}>
                    <td>{l.name}{short && <span className="why" style={{ color: 'var(--warn)' }}>Different from the order</span>}</td>
                    <td className="n">{fmtNum(l.qty)}</td>
                    <td className="n"><input inputMode="decimal" aria-label={'Arrived ' + l.name} value={got[l.ruleId] ?? ''} onChange={(e) => setGot({ ...got, [l.ruleId]: e.target.value })} /></td>
                    <td>{l.unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="quiet">
          <button
            type="button"
            className="btn primary"
            onClick={() => run(() => store.receiveOrder(o.id, o.lines.map((l) => ({ ruleId: l.ruleId, qty: parseNum(got[l.ruleId] ?? '') ?? 0 })), me.name), `${s?.name} delivery received.`)}
          >
            Confirm delivery
          </button>
        </div>
      </div>
    </section>
  );
}
