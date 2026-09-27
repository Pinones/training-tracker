// The only way the app writes synced data. Every write goes to IndexedDB and the
// outbox in one transaction, so a change is never saved without being queued for sync.

import type { TrainingDB } from './db';
import { newId } from './ids';
import type { BaseRow, SyncedTableName, SyncedTables } from './types';

type Listener = () => void;
const writeListeners = new Set<Listener>();

/** Subscribe to local writes (the sync controller uses this to push soon after). */
export function onLocalWrite(listener: Listener): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Fill the base columns for a brand-new row. */
export function baseRow(userId: string, id: string = newId()): BaseRow {
  const now = nowIso();
  return { id, user_id: userId, created_at: now, updated_at: now, deleted_at: null };
}

/**
 * Save rows and queue them for sync, atomically. updated_at gets the device clock
 * until the server stamps its own value on push.
 */
export async function saveRows<T extends SyncedTableName>(
  db: TrainingDB,
  table: T,
  rows: SyncedTables[T][],
): Promise<void> {
  if (rows.length === 0) return;
  const now = nowIso();
  const stamped = rows.map((r) => ({ ...r, updated_at: now }));
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    await db.table(table).bulkPut(stamped);
    await db.outbox.bulkAdd(stamped.map((r) => ({ table, row_id: r.id, queued_at: now })));
  });
  writeListeners.forEach((l) => l());
}

export function saveRow<T extends SyncedTableName>(db: TrainingDB, table: T, row: SyncedTables[T]): Promise<void> {
  return saveRows(db, table, [row]);
}

/** Apply a partial change to an existing row. Returns false if the row does not exist. */
export async function updateRow<T extends SyncedTableName>(
  db: TrainingDB,
  table: T,
  id: string,
  changes: Partial<SyncedTables[T]>,
): Promise<boolean> {
  const current = (await db.table(table).get(id)) as SyncedTables[T] | undefined;
  if (!current) return false;
  await saveRow(db, table, { ...current, ...changes, id });
  return true;
}

/** Soft delete: rows are never removed, only marked. */
export function softDelete(db: TrainingDB, table: SyncedTableName, id: string): Promise<boolean> {
  return updateRow(db, table, id, { deleted_at: nowIso() });
}

export function restore(db: TrainingDB, table: SyncedTableName, id: string): Promise<boolean> {
  return updateRow(db, table, id, { deleted_at: null });
}
