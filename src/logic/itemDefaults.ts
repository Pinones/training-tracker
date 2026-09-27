// Sensible defaults for new plan items and for switching progression kinds.

import type { DraftItem } from './plan';
import { linear, type ItemType, type Progression, type UUID } from './types';

export interface ExerciseInfo {
  id: UUID;
  default_type: ItemType;
  default_increment: number;
  is_barbell: boolean;
}

export function newItemForExercise(ex: ExerciseInfo, id: UUID): DraftItem {
  switch (ex.default_type) {
    case 'bodyweight_reps':
      return {
        id,
        exercise_id: ex.id,
        type: 'bodyweight_reps',
        config: { sets: 3, reps: 10, rest_s: 90 },
        progression: { kind: 'reps', increment: 1, maxReps: 20 },
      };
    case 'timed':
      return { id, exercise_id: ex.id, type: 'timed', config: { sets: 3, seconds: 30, rest_s: 60 }, progression: { kind: 'none' } };
    default:
      return {
        id,
        exercise_id: ex.id,
        type: 'weight_reps',
        config: { sets: 3, reps: 8, start_weight: ex.is_barbell ? 20 : 10, rest_s: 90 },
        progression: defaultProgression('linear', 'weight_reps', ex),
      };
  }
}

export function newRunItem(id: UUID): DraftItem {
  return {
    id,
    exercise_id: null,
    type: 'run_continuous',
    config: { label: 'Run', duration_min: 30 },
    progression: { kind: 'none' },
  };
}

export function newIntervalsItem(id: UUID): DraftItem {
  return {
    id,
    exercise_id: null,
    type: 'run_intervals',
    config: { label: 'Intervals', warmup_min: 10, work_s: 60, recovery_s: 120, rounds_min: 6, rounds_max: 6, cooldown_min: 5 },
    progression: { kind: 'none' },
  };
}

export function newFreeItem(id: UUID): DraftItem {
  return { id, exercise_id: null, type: 'free', config: { title: 'Free item' }, progression: { kind: 'none' } };
}

/** The progression rule to start from when the user switches kind. */
export function defaultProgression(
  kind: Progression['kind'],
  type: ItemType,
  ex?: Pick<ExerciseInfo, 'default_increment' | 'is_barbell'>,
): Progression {
  switch (kind) {
    case 'none':
      return { kind: 'none' };
    case 'linear':
      return linear(ex?.default_increment || 2.5, ex && !ex.is_barbell ? { minWeight: 0 } : {});
    case 'reps':
      return { kind: 'reps', increment: 1, maxReps: type === 'weight_reps' ? 12 : 20 };
    case 'step':
      return type === 'run_intervals'
        ? { kind: 'step', field: 'work_s', amount: 30, everyWeeks: 1, cap: 480 }
        : { kind: 'step', field: 'duration_min', amount: 5, everyWeeks: 2, cap: 60 };
  }
}
