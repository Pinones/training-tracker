// The plan builder's model. The wizard edits one PlanDraft object; these pure
// functions validate it, convert it to/from database rows, and work out the
// minimal set of row changes to save.

import { z } from 'zod';
import type {
  ISODate,
  ItemConfig,
  ItemType,
  Progression,
  SlotKind,
  UUID,
  Weekday,
} from './types';
import { isISODate } from './dates';

// ---------- Draft shape ----------

export interface DraftItem {
  id: UUID;
  exercise_id: UUID | null;
  type: ItemType;
  config: ItemConfig;
  progression: Progression;
}

export interface DraftWorkout {
  id: UUID;
  name: string;
  items: DraftItem[];
}

export interface DraftRotation {
  id: UUID;
  name: string;
  workout_ids: UUID[];
}

export interface DraftDay {
  /** plan_schedule row id */
  id: UUID;
  weekday: Weekday;
  slot_kind: SlotKind;
  workout_id: UUID | null;
  rotation_id: UUID | null;
}

export interface ReminderDraft {
  enabled: boolean;
  time_local: string; // 'HH:MM'
  weekdays: Weekday[];
  weigh_in_weekdays: Weekday[];
}

export interface PlanDraft {
  id: UUID;
  name: string;
  goal_text: string;
  start_date: ISODate;
  weeks: number | null; // null = ongoing
  template_key: string | null;
  workouts: DraftWorkout[];
  rotations: DraftRotation[];
  /** always 7 entries, Monday first */
  schedule: DraftDay[];
  reminders: ReminderDraft;
}

export const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

// ---------- Validation (Zod) ----------

const int = (min: number, max: number) => z.number({ error: 'Enter a number' }).int('Whole numbers only').min(min).max(max);
const num = (min: number, max: number) => z.number({ error: 'Enter a number' }).min(min).max(max);
const weekday = z.union([0, 1, 2, 3, 4, 5, 6].map((d) => z.literal(d))) as unknown as z.ZodType<Weekday>;

const base = {
  optional: z.boolean().optional(),
  days: z.array(weekday).optional(),
};

const weightReps = z.object({
  ...base,
  sets: int(1, 20),
  reps: int(1, 100),
  start_weight: num(0, 500),
  rest_s: int(0, 1800),
  hard_rest_s: int(0, 1800).optional(),
  failed_rest_s: int(0, 1800).optional(),
});
const bodyweightReps = z.object({ ...base, sets: int(1, 20), reps: int(1, 200), rest_s: int(0, 1800) });
const timed = z.object({ ...base, sets: int(1, 20), seconds: int(1, 3600), rest_s: int(0, 1800) });
const runContinuous = z
  .object({
    ...base,
    label: z.string().trim().min(1, 'Give the run a name'),
    duration_min: num(1, 600).optional(),
    distance_km: num(0.1, 200).optional(),
    pace_note: z.string().optional(),
  })
  .refine((c) => c.duration_min !== undefined || c.distance_km !== undefined, {
    message: 'Set a duration, a distance, or both',
    path: ['duration_min'],
  });
const runIntervals = z
  .object({
    ...base,
    label: z.string().trim().min(1, 'Give the session a name'),
    warmup_min: num(0, 120),
    work_s: int(5, 3600),
    recovery_s: int(0, 3600),
    rounds_min: int(1, 50),
    rounds_max: int(1, 50),
    cooldown_min: num(0, 120),
    cooldown_max_min: num(0, 120).optional(),
    effort_note: z.string().optional(),
  })
  .refine((c) => c.rounds_max >= c.rounds_min, { message: 'Max rounds must be at least min rounds', path: ['rounds_max'] });
const free = z.object({
  ...base,
  title: z.string().trim().min(1, 'Give it a title'),
  description: z.string().optional(),
  duration_min: num(1, 600).optional(),
});

const none = z.object({ kind: z.literal('none') });
const linearP = z.object({
  kind: z.literal('linear'),
  increment: num(0, 50),
  failuresBeforeDeload: int(1, 20),
  deloadPercent: num(0, 50),
  roundTo: num(0, 20),
  minWeight: num(0, 500),
});
const repsP = z.object({ kind: z.literal('reps'), increment: int(1, 20), maxReps: int(1, 200) });
const stepP = z.object({
  kind: z.literal('step'),
  field: z.enum(['duration_min', 'distance_km', 'work_s']),
  amount: num(0.01, 3600),
  everyWeeks: int(1, 52),
  cap: num(0, 36000),
});

const uuid = z.string().min(1);
const item = <T extends ItemType>(type: T, config: z.ZodType, progression: z.ZodType) =>
  z.object({ id: uuid, exercise_id: uuid.nullable(), type: z.literal(type), config, progression });

/** Which progression kinds make sense for each item type. */
export const PROGRESSIONS_FOR: Record<ItemType, Progression['kind'][]> = {
  weight_reps: ['linear', 'reps', 'none'],
  bodyweight_reps: ['reps', 'none'],
  timed: ['none'],
  run_continuous: ['step', 'none'],
  run_intervals: ['step', 'none'],
  free: ['none'],
};

export const itemSchema = z.discriminatedUnion('type', [
  item('weight_reps', weightReps, z.union([linearP, repsP, none])),
  item('bodyweight_reps', bodyweightReps, z.union([repsP, none])),
  item('timed', timed, none),
  item('run_continuous', runContinuous, z.union([stepP, none])),
  item('run_intervals', runIntervals, z.union([stepP, none])),
  item('free', free, none),
]);

const exerciseRequired: ItemType[] = ['weight_reps', 'bodyweight_reps', 'timed'];

export const planSchema = z
  .object({
    id: uuid,
    name: z.string().trim().min(1, 'Give your plan a name').max(80),
    goal_text: z.string().max(200),
    start_date: z.string().refine(isISODate, 'Pick a start date'),
    weeks: int(1, 104).nullable(),
    template_key: z.string().nullable(),
    workouts: z.array(
      z.object({
        id: uuid,
        name: z.string().trim().min(1, 'Give the workout a name').max(60),
        items: z.array(itemSchema).min(1, 'Add at least one exercise'),
      }),
    ),
    rotations: z.array(
      z.object({ id: uuid, name: z.string(), workout_ids: z.array(uuid).min(1, 'Add at least one workout to the rotation') }),
    ),
    schedule: z
      .array(
        z.object({
          id: uuid,
          weekday,
          slot_kind: z.enum(['rest', 'workout', 'rotation']),
          workout_id: uuid.nullable(),
          rotation_id: uuid.nullable(),
        }),
      )
      .length(7),
    reminders: z.object({
      enabled: z.boolean(),
      time_local: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, e.g. 07:30'),
      weekdays: z.array(weekday),
      weigh_in_weekdays: z.array(weekday),
    }),
  })
  .superRefine((plan, ctx) => {
    const workoutIds = new Set(plan.workouts.map((w) => w.id));
    const rotationIds = new Set(plan.rotations.map((r) => r.id));
    plan.workouts.forEach((w, wi) =>
      w.items.forEach((it, ii) => {
        if (exerciseRequired.includes(it.type) && !it.exercise_id) {
          ctx.addIssue({ code: 'custom', message: 'Pick an exercise', path: ['workouts', wi, 'items', ii, 'exercise_id'] });
        }
      }),
    );
    plan.rotations.forEach((r, ri) =>
      r.workout_ids.forEach((id, i) => {
        if (!workoutIds.has(id)) {
          ctx.addIssue({ code: 'custom', message: 'Unknown workout', path: ['rotations', ri, 'workout_ids', i] });
        }
      }),
    );
    plan.schedule.forEach((d, di) => {
      if (d.weekday !== di) ctx.addIssue({ code: 'custom', message: 'Schedule out of order', path: ['schedule', di] });
      if (d.slot_kind === 'workout' && !(d.workout_id && workoutIds.has(d.workout_id))) {
        ctx.addIssue({ code: 'custom', message: 'Pick a workout', path: ['schedule', di, 'workout_id'] });
      }
      if (d.slot_kind === 'rotation' && !(d.rotation_id && rotationIds.has(d.rotation_id))) {
        ctx.addIssue({ code: 'custom', message: 'Pick a rotation', path: ['schedule', di, 'rotation_id'] });
      }
    });
    if (plan.schedule.every((d) => d.slot_kind === 'rest')) {
      ctx.addIssue({ code: 'custom', message: 'Schedule at least one training day', path: ['schedule'] });
    }
  });

// ---------- Editing helpers (pure) ----------

export function emptySchedule(newId: () => UUID): DraftDay[] {
  return WEEKDAYS.map((weekday) => ({ id: newId(), weekday, slot_kind: 'rest', workout_id: null, rotation_id: null }));
}

export const DEFAULT_REMINDERS: ReminderDraft = { enabled: false, time_local: '07:00', weekdays: [], weigh_in_weekdays: [] };

export function emptyPlan(newId: () => UUID, startDate: ISODate): PlanDraft {
  return {
    id: newId(),
    name: '',
    goal_text: '',
    start_date: startDate,
    weeks: null,
    template_key: null,
    workouts: [],
    rotations: [],
    schedule: emptySchedule(newId),
    reminders: { ...DEFAULT_REMINDERS },
  };
}

/** Remove a workout and every reference to it (rotations and schedule days). */
export function removeWorkout(plan: PlanDraft, workoutId: UUID): PlanDraft {
  return {
    ...plan,
    workouts: plan.workouts.filter((w) => w.id !== workoutId),
    rotations: plan.rotations.map((r) => ({ ...r, workout_ids: r.workout_ids.filter((id) => id !== workoutId) })),
    schedule: plan.schedule.map((d) =>
      d.workout_id === workoutId ? { ...d, slot_kind: 'rest', workout_id: null, rotation_id: null } : d,
    ),
  };
}

/** Remove a rotation; days that used it become rest days. */
export function removeRotation(plan: PlanDraft, rotationId: UUID): PlanDraft {
  return {
    ...plan,
    rotations: plan.rotations.filter((r) => r.id !== rotationId),
    schedule: plan.schedule.map((d) =>
      d.rotation_id === rotationId ? { ...d, slot_kind: 'rest', workout_id: null, rotation_id: null } : d,
    ),
  };
}

/** Deep copy with fresh ids everywhere, keeping all internal references intact. */
export function duplicatePlan(plan: PlanDraft, newId: () => UUID, name: string): PlanDraft {
  const map = new Map<UUID, UUID>();
  const remap = (id: UUID) => {
    let n = map.get(id);
    if (!n) map.set(id, (n = newId()));
    return n;
  };
  return {
    ...structuredClone(plan),
    id: newId(),
    name,
    workouts: plan.workouts.map((w) => ({
      id: remap(w.id),
      name: w.name,
      items: w.items.map((it) => ({ ...structuredClone(it), id: newId() })),
    })),
    rotations: plan.rotations.map((r) => ({ id: remap(r.id), name: r.name, workout_ids: r.workout_ids.map(remap) })),
    schedule: plan.schedule.map((d) => ({
      ...d,
      id: newId(),
      workout_id: d.workout_id ? remap(d.workout_id) : null,
      rotation_id: d.rotation_id ? remap(d.rotation_id) : null,
    })),
  };
}

/** Sessions per week the schedule asks for. */
export function sessionsPerWeek(plan: PlanDraft): number {
  return plan.schedule.filter((d) => d.slot_kind !== 'rest').length;
}

// ---------- Rows <-> draft ----------

interface RowBase {
  id: UUID;
  user_id: UUID | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type PlanStatus = 'draft' | 'active' | 'archived';

export interface PlanRows {
  plan: RowBase & { name: string; goal_text: string; start_date: ISODate; weeks: number | null; status: PlanStatus; template_key: string | null };
  workouts: (RowBase & { plan_id: UUID; name: string; sort_order: number })[];
  items: (RowBase & DraftItem & { workout_id: UUID; sort_order: number })[];
  rotations: (RowBase & { plan_id: UUID; name: string; workout_ids: UUID[] })[];
  schedule: (RowBase & DraftDay & { plan_id: UUID })[];
}

export function draftToRows(plan: PlanDraft, userId: UUID, status: PlanStatus, now: string): PlanRows {
  const b = (id: UUID): RowBase => ({ id, user_id: userId, created_at: now, updated_at: now, deleted_at: null });
  return {
    plan: {
      ...b(plan.id),
      name: plan.name.trim(),
      goal_text: plan.goal_text.trim(),
      start_date: plan.start_date,
      weeks: plan.weeks,
      status,
      template_key: plan.template_key,
    },
    workouts: plan.workouts.map((w, i) => ({ ...b(w.id), plan_id: plan.id, name: w.name.trim(), sort_order: i })),
    items: plan.workouts.flatMap((w) =>
      w.items.map((it, i) => ({
        ...b(it.id),
        workout_id: w.id,
        exercise_id: it.exercise_id,
        type: it.type,
        sort_order: i,
        // copies, so later edits to the draft can never alter rows already produced
        config: structuredClone(it.config),
        progression: structuredClone(it.progression),
      })),
    ),
    rotations: plan.rotations.map((r) => ({ ...b(r.id), plan_id: plan.id, name: r.name, workout_ids: [...r.workout_ids] })),
    schedule: plan.schedule.map((d) => ({ ...b(d.id), ...d, plan_id: plan.id })),
  };
}

const alive = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at);
const bySort = <T extends { sort_order: number; id: string }>(a: T, b: T) => a.sort_order - b.sort_order || a.id.localeCompare(b.id);

/** Rebuild the editable draft from stored rows (soft-deleted rows are ignored). */
export function rowsToDraft(
  rows: {
    plan: PlanRows['plan'];
    workouts: PlanRows['workouts'];
    items: PlanRows['items'];
    rotations: PlanRows['rotations'];
    schedule: PlanRows['schedule'];
  },
  reminders: ReminderDraft,
  newId: () => UUID,
): PlanDraft {
  const workouts = alive(rows.workouts).sort(bySort);
  const workoutIds = new Set(workouts.map((w) => w.id));
  const rotations = alive(rows.rotations);
  const rotationIds = new Set(rotations.map((r) => r.id));
  const days = alive(rows.schedule);
  return {
    id: rows.plan.id,
    name: rows.plan.name,
    goal_text: rows.plan.goal_text,
    start_date: rows.plan.start_date,
    weeks: rows.plan.weeks,
    template_key: rows.plan.template_key,
    workouts: workouts.map((w) => ({
      id: w.id,
      name: w.name,
      items: alive(rows.items)
        .filter((it) => it.workout_id === w.id)
        .sort(bySort)
        .map((it) => ({ id: it.id, exercise_id: it.exercise_id, type: it.type, config: it.config, progression: it.progression })),
    })),
    rotations: rotations
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .map((r) => ({ id: r.id, name: r.name, workout_ids: r.workout_ids.filter((id) => workoutIds.has(id)) })),
    schedule: WEEKDAYS.map((weekday) => {
      const d = days.find((x) => x.weekday === weekday);
      if (!d) return { id: newId(), weekday, slot_kind: 'rest', workout_id: null, rotation_id: null };
      const valid =
        d.slot_kind === 'rest' ||
        (d.slot_kind === 'workout' && d.workout_id && workoutIds.has(d.workout_id)) ||
        (d.slot_kind === 'rotation' && d.rotation_id && rotationIds.has(d.rotation_id));
      return valid
        ? { id: d.id, weekday, slot_kind: d.slot_kind, workout_id: d.workout_id, rotation_id: d.rotation_id }
        : { id: d.id, weekday, slot_kind: 'rest', workout_id: null, rotation_id: null };
    }),
    reminders,
  };
}

// ---------- Minimal row diff ----------

const IGNORED = new Set(['created_at', 'updated_at', 'deleted_at']);

/** JSON with sorted keys, so Postgres' jsonb key order doesn't count as a change. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function content(row: object): string {
  return stableStringify(Object.fromEntries(Object.entries(row).filter(([k]) => !IGNORED.has(k))));
}

/**
 * Rows to write so that `existing` becomes `desired`: new or changed rows (keeping
 * their original created_at), plus existing rows that are no longer wanted, which
 * get soft-deleted. Unchanged rows are left alone so they don't sync needlessly.
 */
export function diffRows<T extends RowBase>(existing: readonly T[], desired: readonly T[], now: string): { upsert: T[]; softDelete: T[] } {
  const byId = new Map(existing.map((r) => [r.id, r]));
  const wanted = new Set(desired.map((r) => r.id));
  const upsert: T[] = [];
  for (const d of desired) {
    const e = byId.get(d.id);
    if (!e) upsert.push(d);
    else if (e.deleted_at || content(e) !== content(d)) upsert.push({ ...d, created_at: e.created_at });
  }
  const softDelete = existing.filter((e) => !wanted.has(e.id) && !e.deleted_at).map((e) => ({ ...e, deleted_at: now }));
  return { upsert, softDelete };
}

/** Status changes to make `planId` the only active plan. The previous one is archived. */
export function activationChanges<P extends { id: UUID; status: PlanStatus; deleted_at: string | null }>(
  plans: readonly P[],
  planId: UUID,
): P[] {
  return plans
    .filter((p) => !p.deleted_at && (p.id === planId ? p.status !== 'active' : p.status === 'active'))
    .map((p) => ({ ...p, status: p.id === planId ? 'active' : 'archived' }));
}
