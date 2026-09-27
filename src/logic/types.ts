// Domain types shared by the logic, the local DB and (later) Supabase.
// Units: weights in kg, distances in km, durations in seconds unless the field name says otherwise.

import type { ISODate, Weekday } from './dates';

export type UUID = string;

export type ItemType =
  | 'weight_reps'
  | 'bodyweight_reps'
  | 'timed'
  | 'run_continuous'
  | 'run_intervals'
  | 'free';

// ---------- Progression rules (plan_items.progression) ----------

export interface NoProgression {
  kind: 'none';
}

export interface LinearProgression {
  kind: 'linear';
  /** kg added after a fully successful session, e.g. 2.5 */
  increment: number;
  /** failed sessions in a row at the same weight before a deload (default 3) */
  failuresBeforeDeload: number;
  /** percentage to drop on deload (default 10) */
  deloadPercent: number;
  /** plate step to round deloaded weights to (default 2.5) */
  roundTo: number;
  /** a deload never goes below this (default 20 for barbell lifts) */
  minWeight: number;
}

export interface RepsProgression {
  kind: 'reps';
  /** reps added per set after a successful session (default 1) */
  increment: number;
  maxReps: number;
}

export type StepField = 'duration_min' | 'distance_km' | 'work_s';

export interface StepProgression {
  kind: 'step';
  field: StepField;
  /** amount added each step, in the field's unit */
  amount: number;
  everyWeeks: number;
  cap: number;
}

export type Progression = NoProgression | LinearProgression | RepsProgression | StepProgression;

export const LINEAR_DEFAULTS: Omit<LinearProgression, 'kind' | 'increment'> = {
  failuresBeforeDeload: 3,
  deloadPercent: 10,
  roundTo: 2.5,
  minWeight: 20,
};

export function linear(increment: number, overrides: Partial<LinearProgression> = {}): LinearProgression {
  return { kind: 'linear', increment, ...LINEAR_DEFAULTS, ...overrides };
}

// ---------- Item configs (plan_items.config) ----------

interface ItemBase {
  optional?: boolean;
  /** only show this item on these weekdays (e.g. a Friday-only finisher); absent = every day */
  days?: Weekday[];
}

export interface WeightRepsConfig extends ItemBase {
  sets: number;
  reps: number;
  start_weight: number;
  rest_s: number;
  /** rest after a "Hard" set / after a failed set, when the plan offers it */
  hard_rest_s?: number;
  failed_rest_s?: number;
}

export interface BodyweightRepsConfig extends ItemBase {
  sets: number;
  reps: number;
  rest_s: number;
}

export interface TimedConfig extends ItemBase {
  sets: number;
  seconds: number;
  rest_s: number;
}

export interface RunContinuousConfig extends ItemBase {
  /** display name, e.g. "Easy run" (run items have no exercise) */
  label: string;
  duration_min?: number;
  distance_km?: number;
  pace_note?: string;
}

export interface RunIntervalsConfig extends ItemBase {
  label: string;
  warmup_min: number;
  work_s: number;
  recovery_s: number;
  rounds_min: number;
  rounds_max: number;
  cooldown_min: number;
  /** upper bound of a cool-down range, e.g. 5–10 min */
  cooldown_max_min?: number;
  effort_note?: string;
}

export interface FreeConfig extends ItemBase {
  title: string;
  description?: string;
  duration_min?: number;
}

export type ItemConfigByType = {
  weight_reps: WeightRepsConfig;
  bodyweight_reps: BodyweightRepsConfig;
  timed: TimedConfig;
  run_continuous: RunContinuousConfig;
  run_intervals: RunIntervalsConfig;
  free: FreeConfig;
};

export type ItemConfig = ItemConfigByType[ItemType];

// ---------- Schedule ----------

export type SlotKind = 'rest' | 'workout' | 'rotation';

export interface ScheduleSlot {
  weekday: Weekday;
  slot_kind: SlotKind;
  workout_id: UUID | null;
  rotation_id: UUID | null;
}

export type SessionStatus = 'in_progress' | 'completed' | 'skipped';

export type { ISODate, Weekday };
