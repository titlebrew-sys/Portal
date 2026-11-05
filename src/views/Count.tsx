import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../ctx';
import { Head, MobileWho, Seg, parseNum } from '../components';
import type { Area, CountItem, CountRow, Shift, WasteReason } from '../types';
import { activeItems, countOf, lastWeekly } from '../lib/derive';
import { addDays, fmtDayMonth, fmtShortDate, isShift1Locked } from '../lib/time';
import { fmtNum } from '../lib/ordering';

interface Draft {
  qty: string;
  oldQty: string;
  newQty: string;
  frozenQty: string;
  expOld: string;
  expNew: string;
  thrown: string;
  reason: WasteReason | '';
}

const blank: Draft = { qty: '', oldQty: '', newQty: '', frozenQty: '', expOld: '', expNew: '', thrown: '', reason: '' };
const s = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

function draftFrom(c: CountRow | undefined): Draft {
  if (!c) return { ...blank };
  return { ...blank, qty: s(c.qty), oldQty: s(c.oldQty), newQty: s(c.newQty), frozenQty: s(c.frozenQty), expOld: c.expOld ?? '', expNew: c.expNew ?? '' };
}

function totalOf(item: CountItem, d: Draft): number | null {
  if (!item.hasBatches && !item.hasFrozen) return parseNum(d.qty);
  const parts = [item.hasBatches ? parseNum(d.oldQty) : null, item.hasBatches ? parseNum(d.newQty) : null, item.hasFrozen ? parseNum(d.frozenQty) : null];
  if (parts.every((p) => p === null)) return null;
  return parts.reduce<number>((a, p) => a + (p ?? 0), 0);
}

export function Count() {
  const { data, me, today, store, run } = useApp();
  const [area, setArea] = useState<Area>('Bar');
  const [shift, setShift] = useState<Shift>(1);
  const effShift: Shift = area === 'Weekly' ? 1 : shift;
  // Weekly counts are saved once a week: show the latest from the last 7 days.
  const weekly = area === 'Weekly' ? lastWeekly(data, today) : undefined;
  const sourceDate = weekly?.businessDate ?? today;
  const items = useMemo(() => activeItems(data, area), [data, area]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [dirty, setDirty] = useState(false);

  // Load saved numbers when the screen changes, or when new data arrives and nothing is being typed.
  const viewKey = `${area}|${effShift}|${sourceDate}`;
  const lastKey = useRef('');
  useEffect(() => {
    if (dirty && lastKey.current === viewKey) return;
    lastKey.current = viewKey;
    setDrafts(Object.fromEntries(items.map((i) => [i.id, draftFrom(countOf(data, sourceDate, effShift, i.id))])));
    setDirty(false);
  }, [items, data, sourceDate, effShift, viewKey, dirty]);

  const locked = effShift === 1 && area !== 'Weekly' && isShift1Locked(today);
  const readOnly = locked && me.role !== 'owner';
  const set = (id: string, patch: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? blank), ...patch } }));
    setDirty(true);
  };

  const sections = useMemo(() => {
    const m = new Map<string, CountItem[]>();
    for (const i of items) m.set(i.section, [...(m.get(i.section) ?? []), i]);
    return [...m.entries()];
  }, [items]);

  const done = items.filter((i) => totalOf(i, drafts[i.id] ?? blank) !== null).length;

  const ref = (i: CountItem): { text: string; base: number | null } => {
    if (area === 'Weekly') return { text: i.hint || 'Count once a week', base: null };
    if (effShift === 1) {
      const y = countOf(data, addDays(today, -1), 2, i.id)?.qty ?? null;
      return { text: area === 'Bar' ? `Last night ${y === null ? 'not counted' : fmtNum(y) + ' ' + i.unit}` : '', base: y };
    }
    const t = countOf(data, today, 1, i.id)?.qty ?? null;
    return { text: `Shift 1 today ${t === null ? 'not counted' : fmtNum(t) + ' ' + i.unit}`, base: t };
  };

  async function save() {
    const now = new Date().toISOString();
    const rows: CountRow[] = [];
    const waste: { date: string; item: string; qty: number; reason: WasteReason; loggedBy: string }[] = [];
    for (const i of items) {
      const d = drafts[i.id] ?? blank;
      const qty = totalOf(i, d);
      if (qty === null) continue;
      rows.push({
        businessDate: today, shift: effShift, itemId: i.id, qty,
        oldQty: i.hasBatches ? parseNum(d.oldQty) : null,
        newQty: i.hasBatches ? parseNum(d.newQty) : null,
        frozenQty: i.hasFrozen ? parseNum(d.frozenQty) : null,
        expOld: i.hasBatches && d.expOld ? d.expOld : null,
        expNew: i.hasBatches && d.expNew ? d.expNew : null,
        countedBy: me.name, savedAt: now,
      });
      const t = parseNum(d.thrown);
      if (t && t > 0) {
        if (!d.reason) throw new Error(`Pick a reason for ${i.name}`);
        waste.push({ date: today, item: i.name, qty: t, reason: d.reason, loggedBy: me.name });
      }
    }
    if (!rows.length) throw new Error('Nothing counted yet');
    await store.saveCounts(rows, { businessDate: today, shift: effShift, area, savedBy: me.name, savedAt: now, done, total: items.length });
    if (waste.length) await store.addWaste(waste);
  }

  const sub =
    area === 'Weekly'
      ? weekly ? `Last counted ${fmtShortDate(weekly.businessDate)} by ${weekly.savedBy}. Saving sets today as the count date.` : 'Count once a week. Saving sets today as the count date.'
      : effShift === 1 ? 'Count before 4pm. Orders use these numbers. Locks at 5pm.' : 'Closing count at 9pm. Pick a reason for anything thrown away.';

  return (
    <>
      <MobileWho />
      <Head eyebrow="Stock count" title={area + (area === 'Weekly' ? ' count' : ', Shift ' + effShift)} sub={sub} />
      <div className="head" style={{ alignItems: 'center' }}>
        <div className="tabs">
          {(['Bar', 'Kitchen', 'Weekly'] as Area[]).map((a) => (
            <button key={a} type="button" className="btn sm" aria-pressed={area === a} onClick={() => setArea(a)}>{a}</button>
          ))}
        </div>
        {area !== 'Weekly' && <Seg label="Shift" value={shift} onChange={setShift} options={[{ v: 1 as Shift, l: 'Shift 1' }, { v: 2 as Shift, l: 'Shift 2' }]} />}
      </div>
      {locked && (
        <div className={'banner ' + (readOnly ? 'bad' : 'warn')}>
          <b>Shift 1 locked at 5pm.</b> {readOnly ? 'Ask Rimma if a number needs changing.' : 'Staff can no longer change it. As owner you still can.'}
        </div>
      )}
      <div className="items">
        {sections.map(([title, list]) => (
          <div key={title} className="items">
            {sections.length > 1 && <div className="sec-t">{title}</div>}
            {list.map((i) => {
              const d = drafts[i.id] ?? blank;
              const v = totalOf(i, d);
              const { text, base } = ref(i);
              const off = base !== null && base > 0 && v !== null && (v >= base * 8 || (v > 0 && v <= base / 8)) && Math.abs(v - base) >= 10;
              const batches = i.hasBatches || i.hasFrozen;
              const expNote = i.hasBatches && d.expOld && d.expOld <= today && (parseNum(d.oldQty) ?? 0) > 0;
              return (
                <div key={i.id} className={'item' + (off || expNote ? ' flag' : '')}>
                  <div className="t">
                    <b>{i.name}</b>
                    <span>{[text, i.hint].filter(Boolean).join(' · ')}</span>
                    {off && <span style={{ color: 'var(--warn)', fontWeight: 600 }}>Looks very different from {fmtNum(base)}. Check before saving.</span>}
                    {expNote && <span style={{ color: 'var(--bad)', fontWeight: 600 }}>Old batch {d.expOld < today ? 'expired' : 'expires today'} ({fmtDayMonth(d.expOld)}). Clear it at closing.</span>}
                  </div>
                  {!batches ? (
                    <>
                      <div className="step">
                        <button type="button" disabled={readOnly} aria-label={'One less ' + i.name} onClick={() => set(i.id, { qty: String(Math.max(0, (parseNum(d.qty) ?? 0) - 1)) })}>&minus;</button>
                        <input inputMode="decimal" value={d.qty} disabled={readOnly} aria-label={i.name} onChange={(e) => set(i.id, { qty: e.target.value })} />
                        <button type="button" disabled={readOnly} aria-label={'One more ' + i.name} onClick={() => set(i.id, { qty: String((parseNum(d.qty) ?? 0) + 1) })}>+</button>
                      </div>
                      <span className="unit">{i.unit}</span>
                    </>
                  ) : (
                    <span className="mono" style={{ fontWeight: 600 }}>{v === null ? '–' : fmtNum(v)} <span className="unit">{i.unit}</span></span>
                  )}
                  {batches && (
                    <div className="batch">
                      {i.hasBatches && (
                        <>
                          <label>Old batch<input className="n" inputMode="decimal" disabled={readOnly} value={d.oldQty} onChange={(e) => set(i.id, { oldQty: e.target.value })} /></label>
                          <label>Old expires<input type="date" disabled={readOnly} value={d.expOld} onChange={(e) => set(i.id, { expOld: e.target.value })} /></label>
                          <label>New batch<input className="n" inputMode="decimal" disabled={readOnly} value={d.newQty} onChange={(e) => set(i.id, { newQty: e.target.value })} /></label>
                          <label>New expires<input type="date" disabled={readOnly} value={d.expNew} onChange={(e) => set(i.id, { expNew: e.target.value })} /></label>
                        </>
                      )}
                      {i.hasFrozen && <label>Frozen<input className="n" inputMode="decimal" disabled={readOnly} value={d.frozenQty} onChange={(e) => set(i.id, { frozenQty: e.target.value })} /></label>}
                    </div>
                  )}
                  {area === 'Kitchen' && effShift === 2 && (
                    <div className="batch">
                      <label>Thrown away<input className="n" inputMode="decimal" value={d.thrown} onChange={(e) => set(i.id, { thrown: e.target.value })} /></label>
                      <label>Why
                        <select className="field" style={{ height: 38 }} value={d.reason} onChange={(e) => set(i.id, { reason: e.target.value as WasteReason })}>
                          <option value="">Choose</option><option>Expired</option><option>Damaged</option><option>Not sold</option>
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="savebar">
        <span><b className="mono">{done}</b> of <b className="mono">{items.length}</b> counted</span>
        <div className="prog"><i style={{ width: `${items.length ? Math.round((done / items.length) * 100) : 0}%` }} /></div>
        <button type="button" className="btn primary" disabled={readOnly || !dirty} onClick={async () => { if (await run(save, `Saved ${area} ${area === 'Weekly' ? 'weekly count' : 'Shift ' + effShift}.`)) setDirty(false); }}>
          {dirty ? 'Save counts' : 'Saved'}
        </button>
      </div>
    </>
  );
}
