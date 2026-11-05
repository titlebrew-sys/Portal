import { useState } from 'react';
import { useApp } from '../ctx';
import { Head, MobileWho, parseNum } from '../components';
import type { WasteReason } from '../types';
import { fmtNum } from '../lib/ordering';
import { addDays, fmtShortDate } from '../lib/time';

const REASONS: WasteReason[] = ['Expired', 'Damaged', 'Not sold'];
const COLOR: Record<WasteReason, string> = { Expired: 'var(--bad)', Damaged: 'var(--warn)', 'Not sold': 'var(--s1)' };

export function Waste() {
  const { data, me, today, store, run } = useApp();
  const names = data.items.filter((i) => i.active && i.area !== 'Weekly').sort((a, b) => (a.area === b.area ? a.sort - b.sort : a.area === 'Kitchen' ? -1 : 1)).map((i) => i.name);
  const [item, setItem] = useState(names[0] ?? '');
  const [qty, setQty] = useState('1');
  const [why, setWhy] = useState<WasteReason>('Expired');
  const weekAgo = addDays(today, -6);
  const by: Record<string, number> = {};
  data.waste.filter((w) => w.date >= weekAgo).forEach((w) => (by[w.reason] = (by[w.reason] || 0) + w.qty));
  const max = Math.max(1, ...Object.values(by));
  const log = data.waste.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <MobileWho />
      <Head eyebrow="Waste and clearance" title="What was thrown away" sub="Every item cleared at closing lands here with its reason. Over time this shows which items you over order." />
      <div className="grid">
        <div className="panel">
          <h2>By reason, last 7 days</h2>
          <div className="bars">
            {REASONS.map((r) => (
              <div className="bar-r" key={r}>
                <span>{r}</span>
                <div className="track"><i style={{ width: `${((by[r] || 0) / max) * 100}%`, background: COLOR[r] }} /></div>
                <span className="mono" style={{ textAlign: 'right' }}>{fmtNum(by[r] || 0)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2>Log something thrown away</h2>
          <div className="fieldset">
            <label>Item<select className="field" value={item} onChange={(e) => setItem(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</select></label>
            <label>Qty<input className="field num mono" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 70 }} /></label>
            <label>Why<select className="field" value={why} onChange={(e) => setWhy(e.target.value as WasteReason)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
          </div>
          <div>
            <button
              type="button"
              className="btn primary sm"
              onClick={() => {
                const q = parseNum(qty);
                if (!q || q <= 0) return;
                run(() => store.addWaste([{ date: today, item, qty: q, reason: why, loggedBy: me.name }]), 'Added to the clearance log.');
              }}
            >
              Add to log
            </button>
          </div>
        </div>
      </div>
      <div className="panel">
        <h2>Clearance log</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Date</th><th>Item</th><th className="n">Qty</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>
              {log.map((w) => (
                <tr key={w.id}><td>{fmtShortDate(w.date)}</td><td>{w.item}</td><td className="n">{fmtNum(w.qty)}</td><td>{w.reason}</td><td>{w.loggedBy}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
