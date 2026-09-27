import type { SyncedTableName, SyncedTables } from './types';

const BASE = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at'] as const;

type Columns<T> = readonly (keyof T & string)[];

/**
 * The exact server columns of every synced table. Pushes and backup imports only
 * ever send these keys, so a stray local field can never make an upsert fail.
 * Must match supabase/migrations.
 */
export const COLUMNS: { [K in SyncedTableName]: Columns<SyncedTables[K]> } = {
  profiles: [...BASE, 'display_name', 'timezone', 'track_bodyweight', 'bw_goal_kg'],
  exercises: [...BASE, 'name', 'category', 'default_type', 'default_increment', 'is_barbell', 'is_global'],
  plans: [...BASE, 'name', 'goal_text', 'start_date', 'weeks', 'status', 'template_key'],
  plan_workouts: [...BASE, 'plan_id', 'name', 'sort_order'],
  plan_items: [...BASE, 'workout_id', 'exercise_id', 'type', 'sort_order', 'config', 'progression'],
  plan_rotations: [...BASE, 'plan_id', 'name', 'workout_ids'],
  plan_schedule: [...BASE, 'plan_id', 'weekday', 'slot_kind', 'workout_id', 'rotation_id'],
  sessions: [...BASE, 'plan_id', 'workout_id', 'date', 'status', 'started_at', 'finished_at', 'notes'],
  session_items: [...BASE, 'session_id', 'exercise_id', 'type', 'sort_order', 'prescribed', 'result'],
  set_logs: [...BASE, 'session_item_id', 'set_index', 'target_reps', 'reps_done', 'weight', 'is_hard'],
  weight_overrides: [...BASE, 'exercise_id', 'weight', 'effective_date'],
  bodyweights: [...BASE, 'date', 'weight'],
  reminder_settings: [...BASE, 'enabled', 'time_local', 'weekdays', 'weigh_in_weekdays'],
  push_subscriptions: [...BASE, 'endpoint', 'keys', 'device_label'],
  daily_briefs: [...BASE, 'date', 'title', 'body', 'sent_at'],
};

/** Copy only the known server columns of a row. Missing columns become null. */
export function pickColumns<T extends SyncedTableName>(table: T, row: Record<string, unknown>): SyncedTables[T] {
  const out: Record<string, unknown> = {};
  for (const col of COLUMNS[table]) out[col] = row[col] ?? null;
  return out as unknown as SyncedTables[T];
}
