/**
 * Shop clock. Everything runs on Asia/Dubai time, whatever the phone is set to.
 * - A new business day starts at 4am (a count saved at 1am belongs to the day before).
 * - Shift 1 locks at 5pm. After that only the owner can change it.
 */
export const TZ = 'Asia/Dubai';
export const NEW_DAY_HOUR = 4;
export const SHIFT1_LOCK_HOUR = 17;
/** Dubai is UTC+4 all year (no daylight saving). */
const DUBAI_OFFSET_MS = 4 * 3600_000;

export interface DubaiClock {
  /** Calendar date in Dubai, YYYY-MM-DD. */
  date: string;
  hour: number;
  minute: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
}

export function dubaiClock(now: Date = new Date()): DubaiClock {
  const d = new Date(now.getTime() + DUBAI_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

/** The business day a moment belongs to. Before 4am counts as the previous day. */
export function businessDate(now: Date = new Date()): string {
  return dubaiClock(new Date(now.getTime() - NEW_DAY_HOUR * 3600_000)).date;
}

/** True once it is 5pm or later in Dubai on that business day (or the day is over). */
export function isShift1Locked(forDate: string, now: Date = new Date()): boolean {
  const today = businessDate(now);
  if (forDate < today) return true;
  if (forDate > today) return false;
  const c = dubaiClock(now);
  // Between midnight and 4am the business day is still "today" and it is well past 5pm.
  return c.hour >= SHIFT1_LOCK_HOUR || c.hour < NEW_DAY_HOUR;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
}

export function weekdayOf(iso: string): number {
  return new Date(iso + 'T00:00:00Z').getUTCDay();
}

export function fmtLongDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function fmtShortDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function fmtDayMonth(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "16:12" in Dubai time for a stored ISO timestamp. */
export function fmtDubaiTime(isoTs: string): string {
  const c = dubaiClock(new Date(isoTs));
  return `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}

export function greeting(now: Date = new Date()): string {
  const h = dubaiClock(now).hour;
  if (h < 12 && h >= NEW_DAY_HOUR) return 'Good morning';
  if (h < 17 && h >= 12) return 'Good afternoon';
  return 'Good evening';
}
