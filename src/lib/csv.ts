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
    // Skip empty rows and any totals line, so sales are not counted twice.
    if (!item || /^(grand\s+)?totals?$/i.test(item)) continue;
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

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** UTC day number for a valid date, or null (rejects 31 Feb and the like). */
function dayNumber(y: number, m: number, d: number): number | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, m - 1, d);
  const x = new Date(t);
  if (x.getUTCFullYear() !== y || x.getUTCMonth() !== m - 1 || x.getUTCDate() !== d) return null;
  return t / 864e5;
}

/**
 * Reads one date without Date.parse, so every browser (including Safari on iPhone) agrees.
 * Accepts "5 Nov 2024" / "5 November 2024", "05/11/2024" (day first; also . or -) and "2024-11-05".
 */
export function parseDay(text: string): number | null {
  const t = normalise(text).trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return dayNumber(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return dayNumber(+m[3], +m[2], +m[1]);
  m = t.match(/^(\d{1,2}) ([A-Za-z]{3,})\.? (\d{4})$/);
  if (m) {
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return mon < 0 ? null : dayNumber(+m[3], mon + 1, +m[1]);
  }
  return null;
}

/** Arabic-Indic and Persian digits (from an Arabic phone keyboard) to 0-9; odd spaces to plain spaces. */
function normalise(text: string): string {
  return text
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[   ]/g, ' ');
}

/**
 * Days covered by a period such as "5 Nov 2024 to 5 Nov 2026" (730).
 * Between the dates: "to", "until", "till", or a dash (-, –, —) with or without spaces.
 * `read` is false when the dates could not be read; then 365 is assumed.
 */
export function periodInfo(period: string | null): { days: number; read: boolean } {
  const t = normalise(period ?? '');
  // Try every place a separator could be; keep the split where both sides are dates.
  const sep = /\s+(?:to|until|till)\s+|\s*[-–—]\s*/gi;
  for (const m of t.matchAll(sep)) {
    const a = parseDay(t.slice(0, m.index));
    const b = parseDay(t.slice(m.index + m[0].length));
    if (a !== null && b !== null && b > a) return { days: b - a, read: true };
  }
  return { days: 365, read: false };
}

export function periodDays(period: string | null): number {
  return periodInfo(period).days;
}
