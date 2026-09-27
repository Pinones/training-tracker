import { describe, expect, it } from 'vitest';
import { describeFlags, describeItem, describeProgression } from './describe';
import { EX } from './exercises';
import { planSchema, sessionsPerWeek } from './plan';
import { projectSchedule } from './rotation';
import { instantiateTemplate, TEMPLATES, findTemplate } from './templates';
import { stepValue } from './progression';

let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const NAMES = Object.fromEntries(Object.entries(EX).map(([k, v]) => [v, k]));

describe('templates', () => {
  it.each(TEMPLATES.map((t) => [t.key, t] as const))('%s produces a valid plan', (_key, t) => {
    const plan = instantiateTemplate(t, '2026-09-28', newId);
    const result = planSchema.safeParse(plan);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    expect(plan.template_key).toBe(t.key);
  });

  it('every template id is fresh and unique', () => {
    const plan = instantiateTemplate(findTemplate('hybrid_stronglifts_running')!, '2026-09-28', newId);
    const ids = [
      plan.id,
      ...plan.workouts.map((w) => w.id),
      ...plan.workouts.flatMap((w) => w.items.map((i) => i.id)),
      ...plan.rotations.map((r) => r.id),
      ...plan.schedule.map((d) => d.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    const again = instantiateTemplate(findTemplate('hybrid_stronglifts_running')!, '2026-09-28', newId);
    expect(again.id).not.toBe(plan.id);
  });

  it('copies are independent of the template', () => {
    const t = findTemplate('full_body_3')!;
    const plan = instantiateTemplate(t, '2026-09-28', newId);
    (plan.workouts[0]!.items[0]!.config as { sets: number }).sets = 99;
    expect(instantiateTemplate(t, '2026-09-28', newId).workouts[0]!.items[0]!.config).toMatchObject({ sets: 3 });
  });
});

describe('hybrid StrongLifts + running', () => {
  const plan = instantiateTemplate(findTemplate('hybrid_stronglifts_running')!, '2026-09-28', newId);
  const byName = (name: string) => plan.workouts.find((w) => w.name === name)!;

  it('is 12 weeks with 5 sessions a week', () => {
    expect(plan.weeks).toBe(12);
    expect(sessionsPerWeek(plan)).toBe(5);
  });

  it('Workout A: squat, bench, row at 5×5 from 20 kg, +2.5 kg', () => {
    const a = byName('Workout A').items.filter((i) => i.type === 'weight_reps');
    expect(a.map((i) => NAMES[i.exercise_id!])).toEqual(['squat', 'benchPress', 'barbellRow']);
    for (const i of a) {
      expect(i.config).toMatchObject({ sets: 5, reps: 5, start_weight: 20, rest_s: 90, hard_rest_s: 180, failed_rest_s: 300 });
      expect(i.progression).toMatchObject({ kind: 'linear', increment: 2.5, failuresBeforeDeload: 3, deloadPercent: 10, minWeight: 20 });
    }
  });

  it('Workout B: deadlift 1×5 from 40 kg, +5 kg', () => {
    const dl = byName('Workout B').items.find((i) => i.exercise_id === EX.deadlift)!;
    expect(dl.config).toMatchObject({ sets: 1, reps: 5, start_weight: 40 });
    expect(dl.progression).toMatchObject({ kind: 'linear', increment: 5 });
  });

  it('Friday gets an optional finisher; Mon/Wed do not', () => {
    const fin = byName('Workout A').items.find((i) => i.type === 'free')!;
    expect(fin.config).toMatchObject({ optional: true, days: [4] });
    expect(describeFlags(fin)).toBe('optional · Fri only');
  });

  it('alternates A/B on Mon/Wed/Fri with a run on Tue and intervals on Sat', () => {
    const rot = plan.rotations[0]!;
    const week = projectSchedule(plan.schedule, plan.rotations, [], '2026-09-28', 14);
    const names = week.map(({ slot }) => (slot.kind === 'rest' ? 'rest' : plan.workouts.find((w) => w.id === slot.workoutId)!.name));
    expect(names).toEqual([
      'Workout A', 'Easy run', 'Workout B', 'rest', 'Workout A', 'Intervals', 'rest',
      'Workout B', 'Easy run', 'Workout A', 'rest', 'Workout B', 'Intervals', 'rest',
    ]);
    expect(rot.workout_ids).toEqual([byName('Workout A').id, byName('Workout B').id]);
  });

  it('easy run steps 30 → 45 min, +5 every 2 weeks', () => {
    const run = byName('Easy run').items[0]!;
    if (run.progression.kind !== 'step') throw new Error('expected step');
    const base = (run.config as { duration_min: number }).duration_min;
    expect([0, 2, 4, 6, 8].map((w) => stepValue(base, run.progression as never, plan.start_date, addWeeks(plan.start_date, w))))
      .toEqual([30, 35, 40, 45, 45]);
  });

  it('reminders default to the training days', () => {
    expect(plan.reminders.weekdays).toEqual([0, 1, 2, 4, 5]);
  });
});

function addWeeks(date: string, w: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + w * 7);
  return d.toISOString().slice(0, 10);
}

describe('describe', () => {
  const plan = instantiateTemplate(findTemplate('hybrid_stronglifts_running')!, '2026-09-28', newId);
  const items = plan.workouts.flatMap((w) => w.items);

  it('summarises each item type', () => {
    expect(describeItem(items[0]!, 'Squat')).toBe('Squat 5×5 @ 20 kg');
    expect(describeItem(items.find((i) => i.type === 'run_continuous')!, undefined)).toBe('Easy run 30 min');
    expect(describeItem(items.find((i) => i.type === 'run_intervals')!, undefined)).toBe(
      'Intervals: 10 min warm-up, 1 min hard / 2 min easy × 6–8, 5–10 min cool-down',
    );
    expect(describeItem(items.find((i) => i.type === 'free')!, undefined)).toBe('Finisher: swings, ropes or bag, 10 min');
    const plank = instantiateTemplate(findTemplate('full_body_3')!, '2026-09-28', newId).workouts[0]!.items[3]!;
    expect(describeItem(plank, 'Plank')).toBe('Plank 3×30 s');
  });

  it('summarises progression rules', () => {
    expect(describeProgression(items[0]!.progression)).toBe(
      '+2.5 kg when every set hits its reps · after 3 failed sessions drop 10% (never below 20 kg)',
    );
    expect(describeProgression({ kind: 'step', field: 'duration_min', amount: 5, everyWeeks: 2, cap: 45 })).toBe(
      '+5 min every 2 weeks, up to 45 min',
    );
    expect(describeProgression({ kind: 'step', field: 'work_s', amount: 30, everyWeeks: 1, cap: 480 })).toBe(
      '+30 s work time every week, up to 8 min',
    );
    expect(describeProgression({ kind: 'step', field: 'distance_km', amount: 0.5, everyWeeks: 1, cap: 10 })).toBe(
      '+0.5 km every week, up to 10 km',
    );
    expect(describeProgression({ kind: 'reps', increment: 1, maxReps: 12 })).toBe('+1 rep per set after a good session, up to 12');
  });
});
