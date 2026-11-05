import type { OrderLine, Supplier } from '../types';
import { fmtLongDate, weekdayOf } from './time';
import { fmtNum } from './ordering';

export type Channel = 'whatsapp' | 'email' | 'website';

export function channelOf(s: Supplier): Channel {
  if (/mail/i.test(s.how)) return 'email';
  if (/site/i.test(s.how)) return 'website';
  return 'whatsapp';
}

export function lineText(l: OrderLine): string {
  return `${fmtNum(l.qty)} ${l.unit || ''} ${l.name}`.replace(/\s+/g, ' ').trim();
}

/** The message the supplier receives, built from your opening and closing lines. */
export function orderMessage(s: Supplier, lines: OrderLine[], deliveryDate: string): string {
  if (!lines.length) return 'Nothing to order';
  if (s.usesLpo) {
    const sat = weekdayOf(deliveryDate) === 6;
    const time = (sat ? s.satDeliveryTime : s.deliveryTime) || s.deliveryTime;
    const first = time ? `${s.openText} for ${time} delivery` : s.openText;
    return [first, s.closeText].filter(Boolean).join('\n');
  }
  return [s.openText, ...lines.map(lineText), s.closeText].filter((x) => x && String(x).trim()).join('\n');
}

export function emailSubject(_s: Supplier, deliveryDate: string, lpo: number | null): string {
  return `Title Brew order for ${fmtLongDate(deliveryDate)}${lpo ? `, LPO ${lpo}` : ''}`;
}

export function mailtoLink(s: Supplier, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(s.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Opens WhatsApp with the message ready; you pick the supplier group. */
export function whatsappLink(body: string): string {
  return `https://wa.me/?text=${encodeURIComponent(body)}`;
}

export const VAT_RATE = 0.05;

export function lpoTotals(lines: OrderLine[]) {
  const sub = lines.reduce((a, l) => a + (l.price ?? 0) * l.qty, 0);
  const vat = sub * VAT_RATE;
  return { sub, vat, total: sub + vat, missingPrices: lines.some((l) => l.price === null) };
}
