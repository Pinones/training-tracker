import Dexie, { type EntityTable } from 'dexie';
import type { MetaEntry, OutboxEntry, SyncedTableName, SyncedTables } from './types';

// Index notes: the first key is the primary key (device-generated UUID).
// `updated_at` is indexed on every synced table for incremental pulls.
// NEVER edit an existing version's schema; add a new db.version(n) instead.
const SYNCED_SCHEMA: Record<SyncedTableName, string> = {
  profiles: 'id, user_id, updated_at',
  exercises: 'id, user_id, name, is_global, updated_at',
  plans: 'id, user_id, status, updated_at',
  plan_workouts: 'id, user_id, plan_id, updated_at',
  plan_items: 'id, user_id, workout_id, exercise_id, updated_at',
  plan_rotations: 'id, user_id, plan_id, updated_at',
  plan_schedule: 'id, user_id, plan_id, [plan_id+weekday], updated_at',
  sessions: 'id, user_id, plan_id, workout_id, date, status, updated_at',
  session_items: 'id, user_id, session_id, exercise_id, updated_at',
  set_logs: 'id, user_id, session_item_id, updated_at',
  weight_overrides: 'id, user_id, exercise_id, effective_date, updated_at',
  bodyweights: 'id, user_id, [user_id+date], date, updated_at',
  reminder_settings: 'id, user_id, updated_at',
  push_subscriptions: 'id, user_id, endpoint, updated_at',
  daily_briefs: 'id, user_id, [user_id+date], date, updated_at',
};

type Tables = { [K in SyncedTableName]: EntityTable<SyncedTables[K], 'id'> };

export type TrainingDB = Dexie &
  Tables & {
    outbox: EntityTable<OutboxEntry, 'seq'>;
    meta: EntityTable<MetaEntry, 'key'>;
  };

export const SYNCED_TABLES = Object.keys(SYNCED_SCHEMA) as SyncedTableName[];

export function createDB(name = 'training-tracker'): TrainingDB {
  const db = new Dexie(name) as TrainingDB;
  db.version(1).stores({
    ...SYNCED_SCHEMA,
    outbox: '++seq, [table+row_id], table',
    meta: 'key',
  });
  return db;
}

export const db = createDB();

/**
 * Ask the browser not to evict our IndexedDB data under storage pressure.
 * Supabase stays the source of truth; this just makes local loss less likely.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
