import { describe, expect, it } from 'vitest';
import {
  activationChanges,
  diffRows,
  draftToRows,
  duplicatePlan,
  emptyPlan,
  planSchema,
  removeRotation,
  removeWorkout,
  rowsToDraft,
  stableStringify,
  type PlanDraft,
} from './plan';
import { findTemplate, instantiateTemplate } from './templates';

let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const USER = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-09-27T10:00:00.000Z';
const LATER = '2026-09-27T11:00:00.000Z';

const hybrid = () => instantiateTemplate(findTemplate('hybrid_stronglifts_running')!, '2026-09-28', newId);

function issues(plan: PlanDraft): string[] {
  const r = planSchema.safeParse(plan);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('validation', () => {
  it('an empty from-scratch plan needs a name and a training day', () => {
    const msgs = issues(emptyPlan(newId, '2026-09-28'));
    expect(msgs).toContain('name: Give your plan a name');
    expect(msgs).toContain('schedule: Schedule at least one training day');
  });

  it('rejects a schedule day pointing at a missing workout', () => {
    const plan = hybrid();
    plan.schedule[1] = { ...plan.schedule[1]!, workout_id: 'nope' };
    expect(issues(plan)).toContain('schedule.1.workout_id: Pick a workout');
  });

  it('rejects impossible numbers', () => {
    const plan = hybrid();
    (plan.workouts[0]!.items[0]!.config as { sets: number }).sets = 0;
    (plan.workouts[0]!.items[1]!.config as { start_weight: number }).start_weight = -5;
    expect(issues(plan).length).toBe(2);
  });

  it('a strength item needs an exercise', () => {
    const plan = hybrid();
    plan.workouts[0]!.items[0]!.exercise_id = null;
    expect(issues(plan)).toContain('workouts.0.items.0.exercise_id: Pick an exercise');
  });

  it('a run needs a duration or a distance', () => {
    const plan = hybrid();
    const run = plan.workouts[2]!.items[0]!;
    run.config = { label: 'Easy run' };
    expect(issues(plan)).toContain('workouts.2.items.0.config.duration_min: Set a duration, a distance, or both');
    run.config = { label: 'Easy run', distance_km: 5 };
    expect(issues(plan)).toEqual([]);
  });

  it('progression must suit the item type', () => {
    const plan = hybrid();
    plan.workouts[2]!.items[0]!.progression = { kind: 'reps', increment: 1, maxReps: 10 };
    expect(issues(plan).length).toBeGreaterThan(0);
  });

  it('reminder time is 24-hour HH:MM', () => {
    const plan = hybrid();
    plan.reminders.time_local = '7:30 PM';
    expect(issues(plan)).toContain('reminders.time_local: Use 24-hour time, e.g. 07:30');
  });
});

describe('editing helpers', () => {
  it('removing a workout clears it from rotations and the schedule', () => {
    const plan = hybrid();
    const a = plan.workouts[0]!.id;
    const edited = removeWorkout(plan, a);
    expect(edited.rotations[0]!.workout_ids).not.toContain(a);
    const run = plan.workouts[2]!.id;
    const noRun = removeWorkout(plan, run);
    expect(noRun.schedule[1]).toMatchObject({ slot_kind: 'rest', workout_id: null });
  });

  it('removing a rotation turns its days into rest days', () => {
    const plan = hybrid();
    const edited = removeRotation(plan, plan.rotations[0]!.id);
    expect(edited.schedule.filter((d) => d.slot_kind === 'rotation')).toEqual([]);
    expect(edited.schedule[0]!.slot_kind).toBe('rest');
  });

  it('duplicating gives all-new ids with references intact', () => {
    const plan = hybrid();
    const copy = duplicatePlan(plan, newId, 'Copy');
    expect(issues(copy)).toEqual([]);
    const oldIds = new Set([plan.id, ...plan.workouts.map((w) => w.id), ...plan.rotations.map((r) => r.id)]);
    expect(oldIds.has(copy.id)).toBe(false);
    expect(copy.workouts.some((w) => oldIds.has(w.id))).toBe(false);
    expect(copy.rotations[0]!.workout_ids).toEqual([copy.workouts[0]!.id, copy.workouts[1]!.id]);
    expect(copy.schedule[1]!.workout_id).toBe(copy.workouts[2]!.id);
    // editing the copy leaves the original untouched
    (copy.workouts[0]!.items[0]!.config as { sets: number }).sets = 3;
    expect((plan.workouts[0]!.items[0]!.config as { sets: number }).sets).toBe(5);
  });
});

describe('rows', () => {
  it('draft → rows → draft round-trips', () => {
    const plan = hybrid();
    const rows = draftToRows(plan, USER, 'active', NOW);
    expect(rows.plan.status).toBe('active');
    expect(rows.items.every((i) => i.user_id === USER)).toBe(true);
    expect(rowsToDraft(rows, plan.reminders, newId)).toEqual(plan);
  });

  it('keeps item order through sort_order', () => {
    const plan = hybrid();
    const rows = draftToRows(plan, USER, 'active', NOW);
    rows.items.reverse();
    expect(rowsToDraft(rows, plan.reminders, newId).workouts[0]!.items.map((i) => i.id)).toEqual(
      plan.workouts[0]!.items.map((i) => i.id),
    );
  });

  it('ignores soft-deleted rows and repairs dangling schedule references', () => {
    const plan = hybrid();
    const rows = draftToRows(plan, USER, 'active', NOW);
    rows.workouts[2]!.deleted_at = NOW; // Easy run workout deleted on another device
    const draft = rowsToDraft(rows, plan.reminders, newId);
    expect(draft.workouts).toHaveLength(3);
    expect(draft.schedule[1]).toMatchObject({ slot_kind: 'rest', workout_id: null });
  });

  it('fills in missing schedule days as rest', () => {
    const plan = hybrid();
    const rows = draftToRows(plan, USER, 'active', NOW);
    rows.schedule = rows.schedule.slice(0, 3);
    expect(rowsToDraft(rows, plan.reminders, newId).schedule).toHaveLength(7);
  });
});

describe('diffRows', () => {
  it('writes nothing when nothing changed, even if jsonb key order differs', () => {
    const plan = hybrid();
    const stored = draftToRows(plan, USER, 'active', NOW);
    // Postgres returns jsonb with its own key order.
    stored.items = stored.items.map((i) => ({ ...i, config: JSON.parse(stableStringify(i.config)) }));
    const desired = draftToRows(plan, USER, 'active', LATER);
    expect(diffRows(stored.items, desired.items, LATER)).toEqual({ upsert: [], softDelete: [] });
    expect(diffRows([stored.plan], [desired.plan], LATER).upsert).toEqual([]);
  });

  it('writes only the changed row, keeping its created_at', () => {
    const plan = hybrid();
    const stored = draftToRows(plan, USER, 'active', NOW);
    (plan.workouts[0]!.items[0]!.config as { sets: number }).sets = 3;
    const { upsert, softDelete } = diffRows(stored.items, draftToRows(plan, USER, 'active', LATER).items, LATER);
    expect(upsert.map((r) => r.id)).toEqual([plan.workouts[0]!.items[0]!.id]);
    expect(upsert[0]!.created_at).toBe(NOW);
    expect(softDelete).toEqual([]);
  });

  it('soft-deletes removed rows instead of dropping them', () => {
    const plan = hybrid();
    const stored = draftToRows(plan, USER, 'active', NOW);
    const removed = plan.workouts[0]!.items.pop()!;
    const { softDelete } = diffRows(stored.items, draftToRows(plan, USER, 'active', LATER).items, LATER);
    expect(softDelete).toHaveLength(1);
    expect(softDelete[0]).toMatchObject({ id: removed.id, deleted_at: LATER });
  });

  it('re-adding a soft-deleted row restores it', () => {
    const plan = hybrid();
    const stored = draftToRows(plan, USER, 'active', NOW);
    stored.items[0]!.deleted_at = NOW;
    const { upsert } = diffRows(stored.items, draftToRows(plan, USER, 'active', LATER).items, LATER);
    expect(upsert.map((r) => [r.id, r.deleted_at])).toEqual([[stored.items[0]!.id, null]]);
  });

  it('reordering updates sort_order only on moved rows', () => {
    const plan = hybrid();
    const stored = draftToRows(plan, USER, 'active', NOW);
    const [first, second] = plan.workouts[0]!.items;
    plan.workouts[0]!.items.splice(0, 2, second!, first!);
    const { upsert } = diffRows(stored.items, draftToRows(plan, USER, 'active', LATER).items, LATER);
    expect(upsert.map((r) => r.id).sort()).toEqual([first!.id, second!.id].sort());
  });
});

describe('activation', () => {
  const p = (id: string, status: 'draft' | 'active' | 'archived', deleted_at: string | null = null) => ({ id, status, deleted_at });

  it('activating a plan archives the previously active one', () => {
    expect(activationChanges([p('a', 'active'), p('b', 'archived'), p('c', 'draft')], 'b')).toEqual([
      p('a', 'archived'),
      p('b', 'active'),
    ]);
  });

  it('activating the active plan changes nothing', () => {
    expect(activationChanges([p('a', 'active'), p('b', 'archived')], 'a')).toEqual([]);
  });

  it('a draft can be activated when saved', () => {
    expect(activationChanges([p('c', 'draft')], 'c')).toEqual([p('c', 'active')]);
  });
});

describe('item defaults', () => {
  it('every new item and every progression switch is valid', async () => {
    const { newItemForExercise, newRunItem, newIntervalsItem, newFreeItem, defaultProgression } = await import('./itemDefaults');
    const { itemSchema, PROGRESSIONS_FOR } = await import('./plan');
    const items = [
      newItemForExercise({ id: 'x', default_type: 'weight_reps', default_increment: 2.5, is_barbell: true }, 'a'),
      newItemForExercise({ id: 'x', default_type: 'bodyweight_reps', default_increment: 0, is_barbell: false }, 'b'),
      newItemForExercise({ id: 'x', default_type: 'timed', default_increment: 0, is_barbell: false }, 'c'),
      newRunItem('d'),
      newIntervalsItem('e'),
      newFreeItem('f'),
    ];
    for (const item of items) {
      expect(itemSchema.safeParse(item).success, item.type).toBe(true);
      for (const kind of PROGRESSIONS_FOR[item.type]) {
        const withKind = { ...item, progression: defaultProgression(kind, item.type) };
        expect(itemSchema.safeParse(withKind).success, `${item.type}/${kind}`).toBe(true);
      }
    }
  });

  it('non-barbell lifts may go below 20 kg', async () => {
    const { newItemForExercise } = await import('./itemDefaults');
    const curl = newItemForExercise({ id: 'x', default_type: 'weight_reps', default_increment: 1, is_barbell: false }, 'a');
    expect(curl.progression).toMatchObject({ kind: 'linear', increment: 1, minWeight: 0 });
    expect(curl.config).toMatchObject({ start_weight: 10 });
  });
});
