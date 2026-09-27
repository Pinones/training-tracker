// Progression is always *derived* by replaying an exercise's history with these
// pure functions. Nothing here is stored; editing or deleting a past session and
// replaying again gives the corrected current state.

import { compareDates, daysBetween, type ISODate } from './dates';
import type { LinearProgression, RepsProgression, StepProgression } from './types';

/** Round to 2 decimals to keep kg/km values free of float noise (e.g. 42.50000001). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Round to the nearest multiple of `step` (e.g. the nearest 2.5 kg plate step). */
export function roundToStep(value: number, step: number): number {
  if (step <= 0) return round2(value);
  return round2(Math.round(round2(value / step)) * step);
}

// ---------- History events ----------

export interface SetResult {
  targetReps: number;
  /** null = the set was never logged (counts as 0 reps if the exercise was started) */
  repsDone: number | null;
  weight: number | null;
}

export interface SessionEvent {
  type: 'session';
  date: ISODate;
  /** timestamp used to order events on the same date */
  at?: string;
  sets: SetResult[];
}

export interface OverrideEvent {
  type: 'override';
  date: ISODate;
  at?: string;
  weight: number;
}

export type ExerciseEvent = SessionEvent | OverrideEvent;

export function sortEvents<T extends { date: ISODate; at?: string }>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => compareDates(a.date, b.date) || (a.at ?? '').localeCompare(b.at ?? ''));
}

/** A session only counts toward progression if at least one set was logged. */
export function isAttempted(sets: readonly SetResult[]): boolean {
  return sets.some((s) => s.repsDone !== null);
}

/** Every set reached its target reps (unlogged sets count as 0 reps). */
export function isSuccess(sets: readonly SetResult[]): boolean {
  return sets.length > 0 && sets.every((s) => (s.repsDone ?? 0) >= s.targetReps);
}

/** The working weight of a session: the heaviest set that was logged. */
export function workingWeight(sets: readonly SetResult[]): number | null {
  let max: number | null = null;
  for (const s of sets) {
    if (s.repsDone === null || s.weight === null) continue;
    if (max === null || s.weight > max) max = s.weight;
  }
  return max;
}

// ---------- Linear (weight) ----------

export type LinearOutcome = 'success' | 'fail' | 'deload' | 'override';

export interface LinearStep {
  date: ISODate;
  outcome: LinearOutcome;
  /** weight used in the session (or the override value) */
  weight: number;
  /** the target weight for the next session after this event */
  next: number;
}

export interface LinearState {
  /** target weight for the next session */
  weight: number;
  /** failed sessions in a row at the current weight */
  failStreak: number;
  timeline: LinearStep[];
}

export function deloadWeight(weight: number, rule: LinearProgression): number {
  const dropped = roundToStep(weight * (1 - rule.deloadPercent / 100), rule.roundTo);
  // Never below the minimum, but never *raise* a weight that was already under it.
  return round2(Math.min(weight, Math.max(dropped, rule.minWeight)));
}

export function replayLinear(
  rule: LinearProgression,
  startWeight: number,
  events: readonly ExerciseEvent[],
): LinearState {
  let weight = startWeight;
  let failStreak = 0;
  let failWeight: number | null = null;
  const timeline: LinearStep[] = [];

  for (const ev of sortEvents(events)) {
    if (ev.type === 'override') {
      weight = ev.weight;
      failStreak = 0;
      failWeight = null;
      timeline.push({ date: ev.date, outcome: 'override', weight: ev.weight, next: weight });
      continue;
    }
    if (!isAttempted(ev.sets)) continue;
    const used = workingWeight(ev.sets) ?? weight;

    if (isSuccess(ev.sets)) {
      weight = round2(used + rule.increment);
      failStreak = 0;
      failWeight = null;
      timeline.push({ date: ev.date, outcome: 'success', weight: used, next: weight });
      continue;
    }

    failStreak = failWeight === used ? failStreak + 1 : 1;
    failWeight = used;
    if (failStreak >= rule.failuresBeforeDeload) {
      weight = deloadWeight(used, rule);
      failStreak = 0;
      failWeight = null;
      timeline.push({ date: ev.date, outcome: 'deload', weight: used, next: weight });
    } else {
      weight = used;
      timeline.push({ date: ev.date, outcome: 'fail', weight: used, next: weight });
    }
  }

  return { weight, failStreak, timeline };
}

// ---------- Reps ----------

export interface RepsState {
  /** target reps per set for the next session */
  reps: number;
  /** the target has reached the maximum: suggest adding weight */
  atMax: boolean;
}

export function replayReps(
  rule: RepsProgression,
  startReps: number,
  events: readonly ExerciseEvent[],
): RepsState {
  let reps = startReps;
  for (const ev of sortEvents(events)) {
    if (ev.type !== 'session' || !isAttempted(ev.sets)) continue;
    const target = Math.max(...ev.sets.map((s) => s.targetReps));
    reps = isSuccess(ev.sets) ? Math.min(rule.maxReps, target + rule.increment) : target;
  }
  return { reps, atMax: reps >= rule.maxReps };
}

// ---------- Step (time based) ----------

/**
 * Value of a stepped target on `date`: +amount every `everyWeeks` weeks since the
 * plan's start date, up to the cap. A base already above the cap is left alone.
 */
export function stepValue(base: number, rule: StepProgression, startDate: ISODate, date: ISODate): number {
  const days = daysBetween(startDate, date);
  if (days < 0 || rule.everyWeeks <= 0) return base;
  const steps = Math.floor(Math.floor(days / 7) / rule.everyWeeks);
  const cap = Math.max(rule.cap, base);
  return round2(Math.min(cap, base + steps * rule.amount));
}
