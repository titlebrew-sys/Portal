import { useState } from 'react';
import { useApp } from '../ctx';
import type { Order } from '../types';
import { deliveryDate } from '../lib/ordering';
import { emailSubject, mailtoLink } from '../lib/messages';
import { LPO_ADDRESS, fillLpoXlsx, linesNotOnLpo, lpoDate, lpoFileName, lpoRows, lpoTotals } from '../lib/lpo';
import templateUrl from '../assets/bakery-lpo-template.xlsx?url';

const money = (v: number) => v.toFixed(2);

/** The Bakery LPO: same layout as The Bakery's Excel sheet, plus a download of the real .xlsx. */
export function LpoDoc({ order, onBack }: { order: Order; onBack: () => void }) {
  const { data, toast } = useApp();
  const s = data.suppliers.find((x) => x.id === order.supplierId)!;
  const delivery = deliveryDate(s, order.businessDate);
  const rows = lpoRows(order, data.rules);
  const t = lpoTotals(rows);
  const extra = linesNotOnLpo(order);
  const noPrice = rows.filter((r) => r.sheetPriceUsed && r.qty > 0);
  const [busy, setBusy] = useState(false);
  const n = order.lpoNumber!;

  async function download() {
    setBusy(true);
    try {
      const tpl = new Uint8Array(await (await fetch(templateUrl)).arrayBuffer());
      const bytes = fillLpoXlsx(tpl, { lpoNumber: n, deliveryDate: delivery, contact: s.lpoContact ?? '', rows });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = lpoFileName(n);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast(`Downloaded ${lpoFileName(n)}`);
    } catch (e) {
      toast('Could not make the file: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="head noprint">
        <div>
          <div className="eyebrow">LPO {n}</div>
          <h1>{s.name} purchase order</h1>
          <p className="sub">1. Tap Download LPO. 2. Open the email. 3. Attach "{lpoFileName(n)}" and send.</p>
        </div>
        <div className="quiet">
          <button className="btn" onClick={onBack}>Back to orders</button>
          <button className="btn primary" disabled={busy} onClick={download}>{busy ? 'Preparing…' : 'Download LPO (Excel)'}</button>
          <a className="btn" href={mailtoLink(s, emailSubject(s, delivery, n), order.message)}>Open email</a>
        </div>
      </div>
      {!s.lpoContact && <div className="banner warn noprint">The contact line is empty. Add it once on Items and rules, Suppliers, The Bakery.</div>}
      {noPrice.length > 0 && <div className="banner warn noprint">No price in your rules for {noPrice.map((r) => r.title).join(', ')}. The Bakery sheet price was used.</div>}
      {extra.length > 0 && <div className="banner bad noprint">Not on The Bakery's LPO list, so not in the file: {extra.map((l) => l.name).join(', ')}.</div>}
      <div className="xl-wrap">
        <table className="xl">
          <colgroup>
            <col style={{ width: '9.75ch' }} /><col style={{ width: '57.9ch' }} /><col style={{ width: '8.5ch' }} /><col style={{ width: '9.6ch' }} />
            <col style={{ width: '11ch' }} /><col style={{ width: '8.6ch' }} /><col style={{ width: '12.4ch' }} />
          </colgroup>
          <tbody>
            <tr className="xl-title"><td colSpan={7}>TITLE BREW</td></tr>
            <tr className="xl-gap"><td colSpan={7} /></tr>
            <tr className="xl-head">
              <td className="b10">Address:</td><td className="b10">{LPO_ADDRESS}</td><td />
              <td className="red">Delivery Date:</td><td /><td /><td className="red">{lpoDate(delivery)}</td>
            </tr>
            <tr className="xl-head">
              <td className="b10">Contact Number:</td><td className="b9">{s.lpoContact ? ' ' + s.lpoContact : ''}</td><td />
              <td className="red">Lpo No:</td><td /><td /><td className="b10">{n}</td>
            </tr>
            <tr className="xl-head"><td colSpan={7} /></tr>
            <tr className="xl-cols">
              <td>Code </td><td>Item Name</td><td>Uom</td><td>Unit price</td><td>Total</td><td>Vat</td><td>Net Amount With Vat</td>
            </tr>
            {rows.map((r) => (
              <tr key={r.code} className={'xl-item' + (r.qty > 0 ? ' on' : '')}>
                <td className="code">{r.code}</td>
                <td className="name">
                  <b>{r.title}</b>{r.size && <b className="size"> {r.size}</b>}
                  <span>{r.desc}</span>
                </td>
                <td className="num">{r.qty}</td>
                <td className="num">{money(r.price)}</td>
                <td className="num">{money(r.total)}</td>
                <td className="num">{money(r.vat)}</td>
                <td className="num">{money(r.net)}</td>
              </tr>
            ))}
            <tr className="xl-total">
              <td colSpan={2}>Total</td><td>{t.qty}</td><td /><td /><td /><td>{money(t.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="sub noprint">Total before VAT AED {money(t.total)}, VAT 5% AED {money(t.vat)}, net AED {money(t.net)}.</p>
    </>
  );
}
