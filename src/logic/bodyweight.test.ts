import { describe, expect, it } from 'vitest';
import { isPlateau, weeklyAverages, type WeeklyAverage } from './bodyweight';

describe('weeklyAverages', () => {
  it('groups by Monday–Sunday weeks', () => {
    const avgs = weeklyAverages([
      { date: '2026-09-21', weight: 90 }, // Mon
      { date: '2026-09-27', weight: 88 }, // Sun, same week
      { date: '2026-09-28', weight: 87 }, // Mon, next week
    ]);
    expect(avgs).toEqual([
      { weekStart: '2026-09-21', average: 89, count: 2 },
      { weekStart: '2026-09-28', average: 87, count: 1 },
    ]);
  });

  it('sorts oldest first regardless of input order and rounds to 2 decimals', () => {
    const avgs = weeklyAverages([
      { date: '2026-09-30', weight: 80.1 },
      { date: '2026-09-15', weight: 81 },
      { date: '2026-09-29', weight: 80.2 },
      { date: '2026-09-28', weight: 80.2 },
    ]);
    expect(avgs.map((a) => a.weekStart)).toEqual(['2026-09-14', '2026-09-28']);
    expect(avgs[1]!.average).toBe(80.17);
  });

  it('skips soft-deleted entries and empty weeks', () => {
    const avgs = weeklyAverages([
      { date: '2026-09-01', weight: 90 },
      { date: '2026-09-02', weight: 200, deleted_at: '2026-09-02T10:00:00Z' },
      { date: '2026-09-22', weight: 88 },
    ]);
    expect(avgs).toEqual([
      { weekStart: '2026-08-31', average: 90, count: 1 },
      { weekStart: '2026-09-21', average: 88, count: 1 },
    ]);
  });

  it('returns nothing for no entries', () => {
    expect(weeklyAverages([])).toEqual([]);
  });
});

describe('isPlateau', () => {
  const w = (weekStart: string, average: number): WeeklyAverage => ({ weekStart, average, count: 7 });

  it('flags when the average has not dropped in 2 weeks', () => {
    expect(isPlateau([w('2026-09-07', 90), w('2026-09-14', 89.5), w('2026-09-21', 90)], 80)).toBe(true);
  });

  it('does not flag while the average is dropping', () => {
    expect(isPlateau([w('2026-09-07', 90), w('2026-09-14', 90.2), w('2026-09-21', 89.6)], 80)).toBe(false);
  });

  it('needs the week two weeks earlier to exist', () => {
    expect(isPlateau([w('2026-09-14', 90), w('2026-09-21', 90)], 80)).toBe(false);
  });

  it('does not flag once the goal is reached', () => {
    expect(isPlateau([w('2026-09-07', 79), w('2026-09-21', 79.5)], 80)).toBe(false);
  });
});
