import { useApp } from '../ctx';
import { Head, MobileWho } from '../components';
import type { SheetSupplierOrder } from '../types';
import { COPY_OLD_MINUTES, ageText, copyAgeMinutes, itemsToOrder, sheetDue, sheetNothing, sheetSent } from '../lib/sheetOrders';
import { fmtLongDate } from '../lib/time';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The sheet's Today's Orders, as it is. Staff place the orders in the staff app; the Portal only shows them. */
export function Orders() {
  const { data, today } = useApp();
  const m = data.sheetOrders;
  const due = sheetDue(data);
  const sent = sheetSent(data);
  const nothing = sheetNothing(data);
  const age = m ? copyAgeMinutes(m.updatedAt) : 0;

  return (
    <>
      <MobileWho />
      <Head
        eyebrow={'Orders placed ' + fmtLongDate(today)}
        title="Orders to send"
        sub="This is a copy of the Google Sheet's Today's Orders, so the Portal and the sheet always show the same. Orders are sent from the staff app."
      />
      {!m && (
        <div className="empty">
          <h2>Waiting for the sheet</h2>
          <p className="sub" style={{ margin: 0 }}>The Google Sheet has not sent Today's Orders yet. It sends about every 10 minutes.</p>
        </div>
      )}
      {m && (
        <div className={'banner ' + (age > COPY_OLD_MINUTES ? 'warn' : 'info')}>
          <span>
            Copied from the sheet {ageText(age)}.
            {age > COPY_OLD_MINUTES && ' This is old. If staff changed an order in the sheet since then, it is not shown here yet.'}
            {m.delivery ? ` Delivery: ${m.delivery}.` : ''}
            {m.notCounted ? ` Not counted yet: ${m.notCounted}.` : ''}
          </span>
        </div>
      )}
      {m?.note && <div className="banner info"><span>{m.note}</span></div>}
      {m?.saturday && (
        <div className="empty">
          <h2>No orders on Saturday</h2>
          <p className="sub" style={{ margin: 0 }}>Nothing is delivered on Sunday. Friday's order arrives on Saturday; Sunday's order arrives on Monday.</p>
        </div>
      )}
      {due.map((s) => <SupplierCard key={s.name} s={s} />)}
      {sent.length > 0 && (
        <div className="panel">
          <div className="panel-h"><h2>Sent today</h2><span className="pill p-good">{sent.length} suppliers</span></div>
          <div className="rows">
            {sent.map((s) => (
              <div className="r" key={s.name}>
                <div className="t"><b>{s.name}</b><span>{itemsToOrder(s).length} items. {s.done}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {m && !m.saturday && (
        <div className="panel">
          <div className="panel-h"><h2>Nothing to order today</h2><span className="pill p-good">{nothing.length} suppliers</span></div>
          <div className="quiet">
            {nothing.map((s) => <span key={s.name} className="pill p-mute">{s.name}</span>)}
          </div>
        </div>
      )}
    </>
  );
}

function SupplierCard({ s }: { s: SheetSupplierOrder }) {
  const { data, toast } = useApp();
  const sup = data.suppliers.find((x) => x.name === s.name);
  const lines = itemsToOrder(s);
  return (
    <section className="sup">
      <div className="sup-h">
        <div className="t"><b>{s.name}</b><span>{s.how}{sup?.delivery ? ` · ${sup.delivery}` : ''}</span></div>
        {sup?.cutoff && <span className="pill p-s1">Cutoff {sup.cutoff}</span>}
      </div>
      <div className="sup-b">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Item</th><th className="n">Have</th><th className="n">Order</th><th>Unit</th></tr></thead>
            <tbody>
              {lines.map((r) => (
                <tr key={r.item}>
                  <td>
                    {r.item}
                    {r.change !== '' && r.suggested !== '' && <span className="why">Sheet suggested {r.suggested}, changed to {r.change}</span>}
                    {r.notes && <span className="why">{r.notes}</span>}
                    {r.coming > 0 && <span className="why">{r.coming} more still coming from an earlier order</span>}
                  </td>
                  <td className="n">{r.count}{r.unit ? ` ${r.unit}` : ''}</td>
                  <td className="n"><b>{r.final}</b></td>
                  <td>{r.orderUnit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {s.message && (
          <div className="msg-box">
            <div className="eyebrow">Message from the sheet</div>
            <div className="msg">{s.message}</div>
            <div className="quiet">
              <button type="button" className="btn sm" onClick={async () => toast((await copy(s.message)) ? 'Copied.' : 'Select the message text to copy it.')}>Copy message</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
