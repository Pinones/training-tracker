import { addDays, compareDates, startOfWeek, type ISODate } from './dates';
import { round2 } from './progression';

export interface BodyweightEntry {
  date: ISODate;
  weight: number;
  deleted_at?: string | null;
}

export interface WeeklyAverage {
  /** Monday of the week */
  weekStart: ISODate;
  average: number;
  count: number;
}

/** Average bodyweight per Monday–Sunday week, oldest first. Weeks without entries are omitted. */
export function weeklyAverages(entries: readonly BodyweightEntry[]): WeeklyAverage[] {
  const weeks = new Map<ISODate, { sum: number; count: number }>();
  for (const e of entries) {
    if (e.deleted_at) continue;
    const key = startOfWeek(e.date);
    const w = weeks.get(key) ?? { sum: 0, count: 0 };
    w.sum += e.weight;
    w.count += 1;
    weeks.set(key, w);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => compareDates(a, b))
    .map(([weekStart, { sum, count }]) => ({ weekStart, average: round2(sum / count), count }));
}

/**
 * Plateau hint: the latest weekly average is not lower than the average two
 * weeks before it. Only applies when the goal is to lose weight.
 */
export function isPlateau(averages: readonly WeeklyAverage[], goalKg: number | null): boolean {
  const latest = averages.at(-1);
  if (!latest) return false;
  if (goalKg !== null && latest.average <= goalKg) return false;
  const twoWeeksEarlier = averages.find((w) => w.weekStart === addDays(latest.weekStart, -14));
  if (!twoWeeksEarlier) return false;
  return latest.average >= twoWeeksEarlier.average;
}
