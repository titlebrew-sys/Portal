import type { CountItem, CountRow } from '../types';
import { fmtDayMonth } from './time';
import { fmtNum } from './ordering';

export interface CountParts {
  qty: number | null;
  oldQty: number | null;
  newQty: number | null;
  frozenQty: number | null;
}

/**
 * The quantity saved for a count. Kitchen items with batches or frozen stock always
 * save qty = old + new + frozen (blank parts count as 0; all blank = not counted).
 * Other items save the number typed.
 */
export function countTotal(item: CountItem, p: CountParts): number | null {
  if (!item.hasBatches && !item.hasFrozen) return p.qty;
  const parts = [item.hasBatches ? p.oldQty : null, item.hasBatches ? p.newQty : null, item.hasFrozen ? p.frozenQty : null];
  if (parts.every((x) => x === null)) return null;
  return Math.round(parts.reduce<number>((a, x) => a + (x ?? 0), 0) * 1000) / 1000;
}

/**
 * Reference line under an item on the Count screen, e.g.
 * "Last night 0 old, 2 new, 22 frozen · Old expires 4 Nov · New expires 6 Nov".
 */
export function referenceText(label: string, item: CountItem, row: CountRow | undefined): string {
  if (!row || row.qty === null) return `${label} not counted`;
  if (!item.hasBatches && !item.hasFrozen) return `${label} ${fmtNum(row.qty)} ${item.unit}`;
  const parts: string[] = [];
  if (item.hasBatches) parts.push(`${fmtNum(row.oldQty ?? 0)} old`, `${fmtNum(row.newQty ?? 0)} new`);
  if (item.hasFrozen) parts.push(`${fmtNum(row.frozenQty ?? 0)} frozen`);
  const out = [`${label} ${parts.join(', ')}`];
  if (item.hasBatches && row.expOld) out.push(`Old expires ${fmtDayMonth(row.expOld)}`);
  if (item.hasBatches && row.expNew) out.push(`New expires ${fmtDayMonth(row.expNew)}`);
  return out.join(' · ');
}
