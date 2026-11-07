import { useState } from 'react';
import { useApp } from '../ctx';
import { Head, MobileWho, aed, parseNum } from '../components';
import type { Order, OrderLine } from '../types';
import { LpoDoc } from './Lpo';
import { fmtNum, noOrdersOn, plan, type SupplierPlan } from '../lib/ordering';
import { channelOf, emailSubject, lpoTotals, mailtoLink, orderMessage, whatsappLink } from '../lib/messages';
import { dubaiClock, fmtLongDate, fmtShortDate } from '../lib/time';

/** "4:45pm" -> minutes after midnight, or null if it is not a plain time. */
function cutoffMinutes(c: string): number | null {
  const m = c.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'pm') h += 12;
  return h * 60 + Number(m[2] || 0);
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function Orders() {
  const { data, today } = useApp();
  const [lpoView, setLpoView] = useState<string | null>(null);
  const plans = plan(data, today);
  const sentToday = data.orders.filter((o) => o.businessDate === today);
  const isSent = (p: SupplierPlan) => sentToday.some((o) => o.supplierId === p.supplier.id);
  const closed = noOrdersOn(today);
  const due = closed ? [] : plans.filter((p) => !isSent(p) && p.lines.some((l) => l.qty > 0));
  const quiet = closed ? [] : plans.filter((p) => !isSent(p) && !p.lines.some((l) => l.qty > 0));

  if (lpoView) {
    const o = data.orders.find((x) => x.id === lpoView);
    if (o) return <LpoDoc order={o} onBack={() => setLpoView(null)} />;
  }

  return (
    <>
      <MobileWho />
      <Head
        eyebrow={'Orders placed ' + fmtLongDate(today)}
        title="Orders to send"
        sub="Suggestions come from today's Shift 1 count and your rules. Change any number, then copy the message or create the email."
      />
      {closed && (
        <div className="empty">
          <h2>No orders on Saturday</h2>
          <p className="sub" style={{ margin: 0 }}>Nothing is delivered on Sunday. Friday's order arrives on Saturday; Sunday's order arrives on Monday.</p>
        </div>
      )}
      {due.map((p) => <SupplierCard key={p.supplier.id} p={p} onLpo={setLpoView} />)}
      {sentToday.length > 0 && (
        <div className="panel">
          <div className="panel-h"><h2>Sent today</h2><span className="pill p-good">{sentToday.length} suppliers</span></div>
          <div className="rows">
            {sentToday.map((o) => {
              const s = data.suppliers.find((x) => x.id === o.supplierId);
              return (
                <div className="r" key={o.id}>
                  <div className="t"><b>{s?.name}</b><span>{o.lines.length} items, by {o.sentBy}{o.lpoNumber ? `, LPO ${o.lpoNumber}` : ''}</span></div>
                  {o.lpoNumber && <button className="btn sm" onClick={() => setLpoView(o.id)}>View LPO</button>}
                  {o.receivedAt ? <span className="pill p-good">Received</span> : <span className="pill p-warn">Waiting</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!closed && <div className="panel">
        <div className="panel-h"><h2>Nothing to order today</h2><span className="pill p-good">{quiet.length} suppliers</span></div>
        <div className="quiet">
          {quiet.map((p) => {
            const missing = p.lines.filter((l) => l.missing).length;
            return <span key={p.supplier.id} className={'pill ' + (missing ? 'p-warn' : 'p-mute')} title={missing ? `${missing} items not counted` : undefined}>{p.supplier.name}{missing ? ` · ${missing} not counted` : ''}</span>;
          })}
        </div>
      </div>}
    </>
  );
}

function SupplierCard({ p, onLpo }: { p: SupplierPlan; onLpo: (id: string) => void }) {
  const { data, me, today, store, run, toast } = useApp();
  const s = p.supplier;
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const qtyOf = (ruleId: string, sugg: number) => (ruleId in edits ? parseNum(edits[ruleId]) ?? 0 : sugg);
  const lines: OrderLine[] = p.lines
    .map((l) => ({ ruleId: l.rule.id, name: l.rule.orderItem, qty: qtyOf(l.rule.id, l.qty), unit: l.rule.orderUnit, price: l.rule.price }))
    .filter((l) => l.qty > 0);
  const msg = orderMessage(s, lines, p.deliveryDate);
  const ch = channelOf(s);
  const shown = p.lines.filter((l) => showAll || l.qty > 0 || (l.rule.id in edits));
  const missing = p.lines.filter((l) => l.missing);
  const totals = lpoTotals(lines);
  const cut = cutoffMinutes(s.cutoff);
  const clock = dubaiClock();
  const pastCutoff = cut !== null && clock.hour * 60 + clock.minute > cut;

  async function markSent(): Promise<Order | null> {
    let saved: Order | null = null;
    const ok = await run(async () => {
      saved = await store.sendOrder(
        { businessDate: today, supplierId: s.id, lines, message: msg, sentBy: me.name, sentAt: new Date().toISOString() },
        s.usesLpo,
      );
    }, s.usesLpo ? undefined : `${s.name} marked as sent. It now waits on the Receive page.`);
    return ok ? saved : null;
  }

  return (
    <section className="sup">
      <div className="sup-h">
        <div className="t"><b>{s.name}</b><span>{s.how} · {s.delivery} · arrives {fmtShortDate(p.deliveryDate)}</span></div>
        <span className={'pill ' + (pastCutoff ? 'p-bad' : 'p-s1')}>{pastCutoff ? 'Past cutoff ' : 'Cutoff '}{s.cutoff}</span>
        {s.usesLpo && <span className="pill p-mute">LPO {data.lpoNext}</span>}
      </div>
      <div className="sup-b">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Item</th><th className="n">Have</th><th className="n">Order</th><th>Unit</th></tr></thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.rule.id}>
                  <td>{l.rule.orderItem}<span className="why">{l.note}</span></td>
                  <td className="n">{fmtNum(l.have)}</td>
                  <td className="n">
                    <input inputMode="decimal" aria-label={'Order ' + l.rule.orderItem} value={l.rule.id in edits ? edits[l.rule.id] : fmtNum(l.qty)} onChange={(e) => setEdits({ ...edits, [l.rule.id]: e.target.value })} />
                  </td>
                  <td>{l.rule.orderUnit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="link" style={{ marginTop: 10 }} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show only suggested items' : `Add another item (${p.lines.length} on this supplier)`}
          </button>
          {missing.length > 0 && <p className="sub">Not counted yet: {missing.map((l) => l.rule.orderItem).join(', ')}.</p>}
          {s.notes && <p className="sub">{s.notes}</p>}
          {!totals.missingPrices && lines.length > 0 && (
            <p className="sub">
              Order value about {aed(totals.sub)}
              {s.minOrder && totals.sub < s.minOrder && <b style={{ color: 'var(--bad)' }}>. Below the {aed(s.minOrder)} minimum.</b>}
              {s.freeDelivery && totals.sub < s.freeDelivery && <b style={{ color: 'var(--warn)' }}>. Free delivery from {aed(s.freeDelivery)}.</b>}
            </p>
          )}
        </div>
        <div className="msg-box">
          <div className="eyebrow">{ch === 'email' ? 'Email' : ch === 'website' ? 'Shopping list' : 'WhatsApp message'}</div>
          <div className="msg">{msg}</div>
          {s.usesLpo && <p className="sub" style={{ margin: 0 }}>The LPO with the items goes as an attachment. Creating it takes number {data.lpoNext} and moves to the next.</p>}
          <div className="quiet">
            <button type="button" className="btn sm primary" onClick={async () => toast((await copy(msg)) ? (ch === 'whatsapp' ? 'Message copied. Paste it in the WhatsApp group.' : 'Copied.') : 'Select the message text to copy it.')}>
              Copy message
            </button>
            {ch === 'whatsapp' && <a className="btn sm" href={whatsappLink(msg)} target="_blank" rel="noreferrer">Open WhatsApp</a>}
            {ch === 'email' && !s.usesLpo && <a className="btn sm" href={mailtoLink(s, emailSubject(s, p.deliveryDate, null), msg)}>Open email</a>}
            {s.usesLpo ? (
              <button type="button" className="btn sm" disabled={!lines.length} onClick={async () => { const o = await markSent(); if (o) onLpo(o.id); }}>
                Create LPO {data.lpoNext}
              </button>
            ) : (
              <button type="button" className="btn sm" disabled={!lines.length} onClick={markSent}>Mark as sent</button>
            )}
          </div>
          {ch === 'email' && !s.email && <p className="sub" style={{ margin: 0 }}>Add {s.name}'s email address on Items and rules to fill it in automatically.</p>}
        </div>
      </div>
    </section>
  );
}
