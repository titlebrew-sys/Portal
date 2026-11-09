/**
 * Orders come from the Google Sheet's Today's Orders tab. The Portal only shows a copy of it, so the
 * Portal and the sheet can never suggest different things. Nothing here works out an order.
 */
import type { AppData, SheetOrderRow, SheetSupplierOrder } from '../types';

/** Items the sheet will order from this supplier (final order above 0). */
export const itemsToOrder = (s: SheetSupplierOrder): SheetOrderRow[] => s.rows.filter((r) => r.final > 0);

/** Suppliers to order from that nobody has sent yet today (nothing in the Orders Log). */
export function sheetDue(data: AppData): SheetSupplierOrder[] {
  const m = data.sheetOrders;
  if (!m || m.saturday) return [];
  return m.suppliers.filter((s) => s.toOrder && !s.done);
}

/** Suppliers that are ordered from today and already sent (draft saved or WhatsApp opened in the staff app). */
export function sheetSent(data: AppData): SheetSupplierOrder[] {
  const m = data.sheetOrders;
  if (!m || m.saturday) return [];
  return m.suppliers.filter((s) => s.toOrder && !!s.done);
}

/** Suppliers with nothing to order. */
export function sheetNothing(data: AppData): SheetSupplierOrder[] {
  const m = data.sheetOrders;
  if (!m || m.saturday) return [];
  return m.suppliers.filter((s) => !s.toOrder);
}

/** How old the copy is, in whole minutes. */
export const copyAgeMinutes = (updatedAt: string, now = Date.now()) => Math.max(0, Math.round((now - Date.parse(updatedAt)) / 60000));

/** "3 minutes ago", "2 hours ago": plain words for the copy's age. */
export function ageText(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  if (minutes < 1440) { const h = Math.round(minutes / 60); return `${h} hour${h === 1 ? '' : 's'} ago`; }
  const d = Math.round(minutes / 1440);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** The copy is old when nothing has arrived from the sheet for this long (the sheet sends about every 10 minutes). */
export const COPY_OLD_MINUTES = 45;
