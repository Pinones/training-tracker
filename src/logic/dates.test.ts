import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isISODate, startOfWeek, todayIn, weekday } from './dates';

describe('dates', () => {
  it('uses Monday = 0 … Sunday = 6', () => {
    expect(weekday('2026-09-28')).toBe(0); // Monday
    expect(weekday('2026-09-27')).toBe(6); // Sunday
  });

  it('finds the Monday of a week', () => {
    expect(startOfWeek('2026-09-27')).toBe('2026-09-21');
    expect(startOfWeek('2026-09-28')).toBe('2026-09-28');
  });

  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // EU DST starts 2026-03-29
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2); // DST ends 2026-10-25
  });

  it('validates ISO dates', () => {
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-9-1')).toBe(false);
  });

  it('computes today in Stockholm, not UTC', () => {
    // 23:30 UTC on Sep 27 is already Sep 28 in Stockholm (UTC+2 in summer time).
    expect(todayIn('Europe/Stockholm', new Date('2026-09-27T23:30:00Z'))).toBe('2026-09-28');
  });
});
