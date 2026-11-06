import type { ReactNode } from 'react';
import { useApp } from './ctx';

export const ICON: Record<string, ReactNode> = {
  home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  count: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  orders: (
    <>
      <path d="M4 5h2l2 11h10l2-8H7" />
      <circle cx="10" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
    </>
  ),
  receive: (
    <>
      <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
      <path d="M3 7l9 4 9-4M12 11v10" />
    </>
  ),
  waste: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  sales: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  stock: (
    <>
      <path d="M4 7l8-4 8 4-8 4z" />
      <path d="M4 12l8 4 8-4M4 17l8 4 8-4" />
    </>
  ),
  diff: (
    <>
      <path d="M12 3v18M5 7h14M3 15l2-8 2 8a2.5 2.5 0 01-4 0zM17 15l2-8 2 8a2.5 2.5 0 01-4 0z" />
    </>
  ),
  recipes: (
    <>
      <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z" />
      <path d="M5 17a3 3 0 013-3h11M9 8h6" />
    </>
  ),
  how: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5M12 17h.01" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </>
  ),
  rules: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
    </>
  ),
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON[name]}
    </svg>
  );
}

export function Head({ eyebrow, title, sub, right }: { eyebrow: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={o.v === value} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

/** Phone-only strip: demo label + Owner/Staff switch (demo) or who is signed in. */
export function MobileWho() {
  const { store, me, setDemoRole } = useApp();
  return (
    <div className="mobile-who">
      {store.mode === 'demo' ? <span className="proto">Demo with prototype data</span> : <span className="sub" style={{ margin: 0 }}>{me.name}</span>}
      {setDemoRole && <Seg label="Viewing as" value={me.role} onChange={setDemoRole} options={[{ v: 'owner', l: 'Owner' }, { v: 'staff', l: 'Staff' }]} />}
    </div>
  );
}

export const aed = (v: number) => 'AED ' + Math.round(v).toLocaleString('en-US');

/** Reads "12,5" or "12.5" or "" safely. */
export function parseNum(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
