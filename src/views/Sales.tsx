import { useState } from 'react';
import { SalesToday } from './SalesToday';
import { useApp } from '../ctx';
import { Head, MobileWho, aed } from '../components';
import { periodInfo, salesFromLoyverse } from '../lib/csv';

const daysLabel = (p: string | null) => {
  const i = periodInfo(p);
  return i.read ? `${i.days} days` : `dates not recognised, 365 days assumed`;
};

function FileSales() {
  const { data, store, run, toast } = useApp();
  const [period, setPeriod] = useState(data.salesPeriod ?? '');
  const s = data.sales;

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const rows = salesFromLoyverse(await f.text());
      await run(() => store.importSales(rows, period.trim() || 'Imported ' + new Date().toLocaleDateString('en-GB')), `Imported ${rows.length} items.`);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const importer = (
    <div className="panel noprint">
      <h2>{s.length ? 'Replace with a newer export' : 'Import your Loyverse sales'}</h2>
      <p className="sub" style={{ margin: 0 }}>
        In Loyverse Back Office open Reports, then Sales by item, choose the dates, and tap Export. Type the dates below, then pick the file.
        Sales stay private: only the owner login can see them.
      </p>
      <div className="fieldset">
        <label>Period<input className="field" placeholder="5 Nov 2025 to 5 Nov 2026" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 260 }} />
          {period.trim() && <span style={{ fontWeight: 500, color: periodInfo(period).read ? 'var(--good)' : 'var(--bad)' }}>{daysLabel(period)}</span>}
        </label>
        <label>Loyverse file (.csv)<input className="field" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} style={{ paddingTop: 8 }} /></label>
      </div>
    </div>
  );

  if (!s.length)
    return (
      <>
        <MobileWho />
        <Head eyebrow="Loyverse item sales" title="Sales" sub="Import a Loyverse export to see what earns the most and what to fix." />
        {importer}
      </>
    );

  const days = periodInfo(data.salesPeriod).days;
  const sum = (k: 'net' | 'gp' | 'qty' | 'disc') => s.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const net = sum('net'), gp = sum('gp'), qty = sum('qty'), disc = sum('disc');
  const cats: Record<string, number> = {};
  s.forEach((r) => { const c = r.cat === 'Miscellaneous' ? 'Hot Drinks' : r.cat || 'Other'; cats[c] = (cats[c] || 0) + r.net; });
  const catList = Object.entries(cats).filter((c) => c[1] > net * 0.005).sort((a, b) => b[1] - a[1]);
  const cmax = catList[0]?.[1] || 1;
  const top = s.slice().sort((a, b) => b.gp - a.gp).slice(0, 10);
  const food = s.filter((r) => /dessert|sandwich|food|bakery|pastr/i.test(r.cat) && r.qty >= 50).sort((a, b) => a.m - b.m).slice(0, 8);
  const slowCut = Math.round((60 * days) / 365);
  const slow = s.filter((r) => r.qty < slowCut && !/consumable/i.test(r.cat)).sort((a, b) => a.qty - b.qty);
  const noVat = s.filter((r) => r.net > 100 && Number(r.tax) === 0);
  const drinks = (cats['Hot Drinks'] || 0) + (cats['Cold Drinks'] || 0);
  const tile = (v: string, l: string) => <div className="panel"><div className="stat">{v}</div><p className="sub" style={{ margin: 0 }}>{l}</p></div>;

  return (
    <>
      <MobileWho />
      <Head eyebrow={`Loyverse item sales, ${data.salesPeriod ?? ''} (${daysLabel(data.salesPeriod)})`} title="Sales" sub="From your Loyverse export. Profit uses the recipe costs set in Loyverse, so it is only as good as those recipes." />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        {tile(aed(net), `Net sales, about ${aed(net / days)} a day`)}
        {tile(net ? Math.round((gp / net) * 100) + '%' : '–', `Gross margin, ${aed(gp)} profit`)}
        {tile(String(Math.round(qty / days)), 'Items sold per day on average')}
        {tile(aed(disc), `Given in discounts, ${net + disc ? ((disc / (net + disc)) * 100).toFixed(1) : 0}% of gross sales`)}
      </div>
      <div className="grid">
        <div className="panel">
          <h2>Where the money comes from</h2>
          <div className="bars">
            {catList.map(([c, v]) => (
              <div className="bar-r" key={c} style={{ gridTemplateColumns: '110px minmax(0,1fr) 64px' }}>
                <span>{c}</span><div className="track"><i style={{ width: `${(v / cmax) * 100}%`, background: 'var(--s1)' }} /></div>
                <span className="mono" style={{ textAlign: 'right' }}>{Math.round((v / net) * 100)}%</span>
              </div>
            ))}
          </div>
          {drinks > 0 && <p className="sub" style={{ margin: 0 }}>Coffee and other drinks bring in {Math.round((drinks / net) * 100)}% of sales.</p>}
        </div>
        <div className="panel">
          <h2>Food with the thinnest margin</h2>
          <div className="rows">
            {food.map((r) => (
              <div className="r" key={r.item}><div className="t"><b>{r.item}</b><span><span className="mono">{r.qty}</span> sold, {aed(r.gp)} profit</span></div><span className={'pill ' + (r.m < 42 ? 'p-bad' : 'p-warn')}>{r.m.toFixed(0)}%</span></div>
            ))}
          </div>
          <p className="sub" style={{ margin: 0 }}>A price rise or a cheaper supplier is worth checking on these.</p>
        </div>
      </div>
      <div className="panel">
        <h2>Top 10 by profit</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Item</th><th className="n">Sold</th><th className="n">Net sales</th><th className="n">Profit</th><th className="n">Margin</th></tr></thead>
            <tbody>
              {top.map((r) => (
                <tr key={r.item}><td>{r.item}</td><td className="n">{r.qty.toLocaleString('en-US')}</td><td className="n">{Math.round(r.net).toLocaleString('en-US')}</td><td className="n">{Math.round(r.gp).toLocaleString('en-US')}</td><td className="n">{r.m.toFixed(0)}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid">
        <div className="panel">
          <div className="panel-h"><h2>Slow sellers</h2><span className="pill p-mute">{slow.length} items</span></div>
          <p className="sub" style={{ margin: 0 }}>Fewer than {slowCut} sold in this period. Candidates to drop or relaunch.</p>
          <div className="quiet">{slow.map((r) => <span key={r.item} className="pill p-mute">{r.item} <span className="mono">{r.qty}</span></span>)}</div>
        </div>
        <div className="panel">
          <div className="panel-h"><h2>Check in Loyverse</h2><span className={'pill ' + (noVat.length ? 'p-bad' : 'p-good')}>{noVat.length} items</span></div>
          <div className="rows">
            {noVat.length ? noVat.map((r) => (
              <div className="r" key={r.item}><div className="t"><b>{r.item} charges no VAT</b><span>{r.qty} sold for {aed(r.net)} with 0 tax</span></div><span className="pill p-bad">Fix</span></div>
            )) : <div className="r"><div className="t"><b>Every item charges VAT</b></div></div>}
          </div>
        </div>
      </div>
      <div className="empty">
        <h2>Next: daily and hourly sales</h2>
        <p className="sub" style={{ margin: 0 }}>This export is a period total. A receipts export, or connecting Loyverse directly, adds trends by month, weekday and hour, plus a check of expected stock use against your counts.</p>
      </div>
      {importer}
    </>
  );
}

/** Sales: live from Loyverse, or from an exported file (older history). */
export function Sales() {
  const [tab, setTab] = useState<'live' | 'file'>('live');
  return (
    <>
      <div className="tabs noprint">
        <button className="btn sm" aria-pressed={tab === 'live'} onClick={() => setTab('live')}>Today and yesterday</button>
        <button className="btn sm" aria-pressed={tab === 'file'} onClick={() => setTab('file')}>From a Loyverse file</button>
      </div>
      {tab === 'live' ? <SalesToday /> : <FileSales />}
    </>
  );
}
