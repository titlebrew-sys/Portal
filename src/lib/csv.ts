import type { SalesRow } from '../types';

/** Small CSV reader that handles quotes and commas inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const n = (s: string | undefined) => {
  const v = Number(String(s ?? '').replace(/[%,\s]/g, '').replace(/^AED/i, ''));
  return Number.isFinite(v) ? v : 0;
};

/** Reads a Loyverse "Sales by item" export. Matches columns by their names. */
export function salesFromLoyverse(text: string): SalesRow[] {
  const [head, ...body] = parseCsv(text);
  if (!head) throw new Error('The file is empty');
  const h = head.map((x) => x.trim().toLowerCase());
  const col = (...names: string[]) => h.findIndex((x) => names.includes(x));
  const iItem = col('item name', 'item', 'name');
  const iCat = col('category');
  const iQty = col('items sold', 'quantity', 'qty');
  const iNet = col('net sales');
  const iGp = col('gross profit');
  const iM = col('margin');
  const iDisc = col('discounts');
  const iTax = col('taxes', 'tax');
  if (iItem < 0 || iNet < 0) throw new Error('This does not look like the Loyverse "Sales by item" export (needs Item name and Net sales columns)');
  const merged = new Map<string, SalesRow>();
  for (const r of body) {
    const item = (r[iItem] ?? '').trim();
    if (!item) continue;
    const row: SalesRow = {
      item, cat: iCat >= 0 ? (r[iCat] ?? '').trim() : '', qty: n(r[iQty]), net: n(r[iNet]),
      gp: iGp >= 0 ? n(r[iGp]) : 0, m: iM >= 0 ? n(r[iM]) : 0, disc: iDisc >= 0 ? n(r[iDisc]) : 0, tax: iTax >= 0 ? n(r[iTax]) : 0,
    };
    const old = merged.get(item);
    if (old) {
      old.qty += row.qty; old.net += row.net; old.gp += row.gp; old.disc += row.disc; old.tax += row.tax;
      old.m = old.net ? (old.gp / old.net) * 100 : 0;
    } else merged.set(item, row);
  }
  return [...merged.values()];
}

/** Days covered by "5 Nov 2025 to 5 Nov 2026"; 365 if it cannot tell. */
export function periodDays(period: string | null): number {
  const m = period?.split(/\s+to\s+/i);
  if (m && m.length === 2) {
    const a = Date.parse(m[0]);
    const b = Date.parse(m[1]);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) return Math.max(1, Math.round((b - a) / 864e5));
  }
  return 365;
}
