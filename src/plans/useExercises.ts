import { db } from '../db/db';
import type { ExerciseRow } from '../db/types';
import { useLiveQuery } from '../lib/useLiveQuery';

/** The exercise library: global seed exercises plus the user's own, by id. */
export function useExercises(userId: string): Map<string, ExerciseRow> | undefined {
  return useLiveQuery(async () => {
    const rows = await db.exercises.filter((e) => !e.deleted_at && (e.is_global || e.user_id === userId)).toArray();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return new Map(rows.map((r) => [r.id, r]));
  }, [userId]);
}
