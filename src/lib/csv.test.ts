import { describe, expect, it } from 'vitest';
import { parseDay, periodDays, periodInfo } from './csv';

describe('sales period, read the same in every browser', () => {
  it('accepts the three date formats', () => {
    const want = Date.UTC(2024, 10, 5) / 864e5;
    expect(parseDay('5 Nov 2024')).toBe(want);
    expect(parseDay('5 November 2024')).toBe(want);
    expect(parseDay('05/11/2024')).toBe(want); // day first
    expect(parseDay('5/11/2024')).toBe(want);
    expect(parseDay('2024-11-05')).toBe(want);
  });
  it('reads day first, not month first', () => {
    expect(parseDay('01/02/2025')).toBe(Date.UTC(2025, 1, 1) / 864e5); // 1 Feb
  });
  it('rejects impossible or unknown dates', () => {
    expect(parseDay('31/02/2025')).toBeNull();
    expect(parseDay('5 Foo 2024')).toBeNull();
    expect(parseDay('Nov 5')).toBeNull();
  });
  it('counts the days in a period', () => {
    expect(periodInfo('5 Nov 2024 to 5 Nov 2026')).toEqual({ days: 730, read: true });
    expect(periodDays('05/11/2024 to 05/11/2026')).toBe(730);
    expect(periodDays('2024-11-05 to 2026-11-05')).toBe(730);
    expect(periodDays('5 Nov 2025 to 5 Nov 2026')).toBe(365);
    expect(periodDays('1 Jan 2024 to 1 Jan 2025')).toBe(366); // leap year
    expect(periodDays('5 Nov 2024 - 05/11/2025')).toBe(365); // mixed formats
  });
  it('falls back to 365 when it cannot read the period', () => {
    expect(periodInfo('last year')).toEqual({ days: 365, read: false });
    expect(periodInfo(null)).toEqual({ days: 365, read: false });
    expect(periodInfo('5 Nov 2026 to 5 Nov 2024')).toEqual({ days: 365, read: false });
  });
});
