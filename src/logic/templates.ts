// Starter templates (plan.md §5). A template is copied into the user's own plan
// with fresh ids, and everything in it stays editable.

import { EX } from './exercises';
import { emptySchedule, DEFAULT_REMINDERS, type DraftItem, type PlanDraft } from './plan';
import { linear, type ISODate, type Progression, type SlotKind, type UUID, type Weekday } from './types';

type ItemSpec = Omit<DraftItem, 'id'>;
type DaySpec = { kind: 'rest' } | { kind: 'workout'; workout: string } | { kind: 'rotation'; rotation: string };

export interface Template {
  key: string;
  name: string;
  description: string;
  weeks: number | null;
  goal: string;
  workouts: { key: string; name: string; items: ItemSpec[] }[];
  rotations: { key: string; name: string; workouts: string[] }[];
  /** Monday first; missing days are rest */
  days: Partial<Record<Weekday, DaySpec>>;
}

// ---------- item builders ----------

const barbell = (increment: number) => linear(increment); // min 20 kg for barbell lifts
const machine = (increment: number) => linear(increment, { minWeight: 0 });

function lift(
  exercise_id: UUID,
  sets: number,
  reps: number,
  start_weight: number,
  progression: Progression,
  extra: { rest_s?: number; hard_rest_s?: number; failed_rest_s?: number } = {},
): ItemSpec {
  return {
    exercise_id,
    type: 'weight_reps',
    config: { sets, reps, start_weight, rest_s: extra.rest_s ?? 90, ...extra },
    progression,
  };
}

function hold(exercise_id: UUID, sets: number, seconds: number): ItemSpec {
  return { exercise_id, type: 'timed', config: { sets, seconds, rest_s: 60 }, progression: { kind: 'none' } };
}

// StrongLifts rest: 90 s default, "Hard set" 3 min, 5 min after a failed set.
const SL_REST = { rest_s: 90, hard_rest_s: 180, failed_rest_s: 300 };

/** The hybrid plan's optional Friday finisher, in both A and B but only shown on Fridays. */
const FINISHER: ItemSpec = {
  exercise_id: null,
  type: 'free',
  config: {
    title: 'Finisher: swings, ropes or bag',
    description: '10 min, 40 s on / 20 s off',
    duration_min: 10,
    optional: true,
    days: [4],
  },
  progression: { kind: 'none' },
};

// ---------- templates ----------

export const TEMPLATES: Template[] = [
  {
    key: 'hybrid_stronglifts_running',
    name: 'Hybrid StrongLifts 5×5 + running',
    description: '12 weeks, 5 sessions a week: alternating 5×5 workouts A/B on Mon/Wed/Fri, an easy run on Tuesday and intervals on Saturday.',
    weeks: 12,
    goal: 'Get stronger and fitter',
    workouts: [
      {
        key: 'A',
        name: 'Workout A',
        items: [
          lift(EX.squat, 5, 5, 20, barbell(2.5), SL_REST),
          lift(EX.benchPress, 5, 5, 20, barbell(2.5), SL_REST),
          lift(EX.barbellRow, 5, 5, 20, barbell(2.5), SL_REST),
          FINISHER,
        ],
      },
      {
        key: 'B',
        name: 'Workout B',
        items: [
          lift(EX.squat, 5, 5, 20, barbell(2.5), SL_REST),
          lift(EX.overheadPress, 5, 5, 20, barbell(2.5), SL_REST),
          lift(EX.deadlift, 1, 5, 40, barbell(5), SL_REST),
          FINISHER,
        ],
      },
      {
        key: 'run',
        name: 'Easy run',
        items: [
          {
            exercise_id: null,
            type: 'run_continuous',
            config: { label: 'Easy run', duration_min: 30, pace_note: 'Conversational pace' },
            progression: { kind: 'step', field: 'duration_min', amount: 5, everyWeeks: 2, cap: 45 },
          },
        ],
      },
      {
        key: 'intervals',
        name: 'Intervals',
        items: [
          {
            exercise_id: null,
            type: 'run_intervals',
            config: {
              label: 'Intervals',
              warmup_min: 10,
              work_s: 60,
              recovery_s: 120,
              rounds_min: 6,
              rounds_max: 8,
              cooldown_min: 5,
              cooldown_max_min: 10,
              effort_note: 'Hard means 8 out of 10 effort',
            },
            progression: { kind: 'none' },
          },
        ],
      },
    ],
    rotations: [{ key: 'AB', name: 'A / B', workouts: ['A', 'B'] }],
    days: {
      0: { kind: 'rotation', rotation: 'AB' },
      1: { kind: 'workout', workout: 'run' },
      2: { kind: 'rotation', rotation: 'AB' },
      4: { kind: 'rotation', rotation: 'AB' },
      5: { kind: 'workout', workout: 'intervals' },
    },
  },
  {
    key: 'full_body_3',
    name: 'Full body, 3 days',
    description: 'Mon / Wed / Fri, alternating two full-body workouts. 3×8–10 with linear progression.',
    weeks: null,
    goal: 'Build general strength',
    workouts: [
      {
        key: 'A',
        name: 'Workout A',
        items: [
          lift(EX.squat, 3, 8, 20, barbell(2.5)),
          lift(EX.benchPress, 3, 8, 20, barbell(2.5)),
          lift(EX.barbellRow, 3, 8, 20, barbell(2.5)),
          hold(EX.plank, 3, 30),
        ],
      },
      {
        key: 'B',
        name: 'Workout B',
        items: [
          lift(EX.romanianDeadlift, 3, 8, 20, barbell(2.5)),
          lift(EX.overheadPress, 3, 8, 20, barbell(2.5)),
          lift(EX.latPulldown, 3, 10, 20, machine(2.5)),
          lift(EX.lunges, 3, 10, 10, machine(2)),
        ],
      },
    ],
    rotations: [{ key: 'AB', name: 'A / B', workouts: ['A', 'B'] }],
    days: {
      0: { kind: 'rotation', rotation: 'AB' },
      2: { kind: 'rotation', rotation: 'AB' },
      4: { kind: 'rotation', rotation: 'AB' },
    },
  },
  {
    key: 'upper_lower_4',
    name: 'Upper / Lower, 4 days',
    description: 'Mon Upper, Tue Lower, Thu Upper, Fri Lower.',
    weeks: null,
    goal: 'Build strength and muscle',
    workouts: [
      {
        key: 'upper',
        name: 'Upper',
        items: [
          lift(EX.benchPress, 3, 8, 20, barbell(2.5)),
          lift(EX.barbellRow, 3, 8, 20, barbell(2.5)),
          lift(EX.overheadPress, 3, 10, 20, barbell(2.5)),
          lift(EX.latPulldown, 3, 10, 20, machine(2.5)),
          lift(EX.bicepsCurl, 2, 12, 8, machine(1)),
        ],
      },
      {
        key: 'lower',
        name: 'Lower',
        items: [
          lift(EX.squat, 3, 8, 20, barbell(2.5)),
          lift(EX.romanianDeadlift, 3, 8, 20, barbell(2.5)),
          lift(EX.legPress, 3, 10, 40, machine(5)),
          lift(EX.hipThrust, 3, 10, 20, barbell(2.5)),
          lift(EX.calfRaise, 2, 15, 20, machine(2.5)),
        ],
      },
    ],
    rotations: [],
    days: {
      0: { kind: 'workout', workout: 'upper' },
      1: { kind: 'workout', workout: 'lower' },
      3: { kind: 'workout', workout: 'upper' },
      4: { kind: 'workout', workout: 'lower' },
    },
  },
  {
    key: 'beginner_running_3',
    name: 'Beginner running, 3 days',
    description: 'Mon / Wed / Sat run/walk intervals. The running part grows by 30 s every week, up to 8 min.',
    weeks: null,
    goal: 'Run 5K',
    workouts: [
      {
        key: 'runwalk',
        name: 'Run / walk',
        items: [
          {
            exercise_id: null,
            type: 'run_intervals',
            config: {
              label: 'Run / walk',
              warmup_min: 5,
              work_s: 60,
              recovery_s: 120,
              rounds_min: 8,
              rounds_max: 8,
              cooldown_min: 5,
              effort_note: 'Warm up and cool down walking. Run easy; walk the recoveries.',
            },
            progression: { kind: 'step', field: 'work_s', amount: 30, everyWeeks: 1, cap: 480 },
          },
        ],
      },
    ],
    rotations: [],
    days: {
      0: { kind: 'workout', workout: 'runwalk' },
      2: { kind: 'workout', workout: 'runwalk' },
      5: { kind: 'workout', workout: 'runwalk' },
    },
  },
];

export const SCRATCH_KEY = 'scratch';

export function findTemplate(key: string): Template | undefined {
  return TEMPLATES.find((t) => t.key === key);
}

/** Copy a template into a brand-new, fully editable plan draft. */
export function instantiateTemplate(t: Template, startDate: ISODate, newId: () => UUID): PlanDraft {
  const workoutIds = new Map(t.workouts.map((w) => [w.key, newId()]));
  const rotationIds = new Map(t.rotations.map((r) => [r.key, newId()]));
  const schedule = emptySchedule(newId).map((d) => {
    const spec = t.days[d.weekday];
    let slot: { slot_kind: SlotKind; workout_id: UUID | null; rotation_id: UUID | null } = {
      slot_kind: 'rest',
      workout_id: null,
      rotation_id: null,
    };
    if (spec?.kind === 'workout') slot = { slot_kind: 'workout', workout_id: workoutIds.get(spec.workout)!, rotation_id: null };
    if (spec?.kind === 'rotation') slot = { slot_kind: 'rotation', workout_id: null, rotation_id: rotationIds.get(spec.rotation)! };
    return { ...d, ...slot };
  });
  const trainingDays = schedule.filter((d) => d.slot_kind !== 'rest').map((d) => d.weekday);
  return {
    id: newId(),
    name: t.name,
    goal_text: t.goal,
    start_date: startDate,
    weeks: t.weeks,
    template_key: t.key,
    workouts: t.workouts.map((w) => ({
      id: workoutIds.get(w.key)!,
      name: w.name,
      items: w.items.map((it) => ({ ...structuredClone(it), id: newId() })),
    })),
    rotations: t.rotations.map((r) => ({
      id: rotationIds.get(r.key)!,
      name: r.name,
      workout_ids: r.workouts.map((k) => workoutIds.get(k)!),
    })),
    schedule,
    reminders: { ...DEFAULT_REMINDERS, weekdays: trainingDays },
  };
}
