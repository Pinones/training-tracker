import { z } from 'zod';
import { pickColumns } from '../db/columns';
import { SYNCED_TABLES, type TrainingDB } from '../db/db';
import { UUID_RE } from '../db/ids';
import type { BaseRow, SyncedTableName } from '../db/types';
import { saveRows } from '../db/write';

export const BACKUP_FORMAT = 'training-tracker-backup';
export const BACKUP_VERSION = 1;

/** Device-specific rows that make no sense in a backup. */
const NOT_BACKED_UP: SyncedTableName[] = ['push_subscriptions'];
const BACKUP_TABLES = SYNCED_TABLES.filter((t) => !NOT_BACKED_UP.includes(t));

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  user_id: string;
  tables: Partial<Record<SyncedTableName, BaseRow[]>>;
}

const rowSchema = z.looseObject({
  id: z.string().regex(UUID_RE),
  updated_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'invalid updated_at'),
});

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().max(BACKUP_VERSION),
  exported_at: z.string(),
  user_id: z.string().regex(UUID_RE),
  tables: z.record(z.string(), z.array(rowSchema)),
});

/** Everything the user owns, including soft-deleted rows (so "Recently deleted" survives a restore). */
export async function exportBackup(db: TrainingDB, userId: string): Promise<BackupFile> {
  const tables: BackupFile['tables'] = {};
  for (const table of BACKUP_TABLES) {
    const rows = (await db.table(table).where('user_id').equals(userId).toArray()) as BaseRow[];
    tables[table] = rows.map((r) => pickColumns(table, r as unknown as Record<string, unknown>) as BaseRow);
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: new Date().toISOString(), user_id: userId, tables };
}

export class BackupError extends Error {}

/**
 * Merge a backup into the local database (and queue it for sync).
 * Idempotent: rows keep their ids, and a row is only taken from the backup when it
 * is newer than the local copy, so importing the same file twice changes nothing
 * and an old backup never overwrites newer data.
 */
export async function importBackup(
  db: TrainingDB,
  userId: string,
  input: unknown,
): Promise<{ imported: number; skipped: number }> {
  const parsed = backupSchema.safeParse(input);
  if (!parsed.success) throw new BackupError('This file is not a Training Tracker backup.');
  const backup = parsed.data;
  if (backup.user_id !== userId) throw new BackupError('This backup belongs to a different account.');

  let imported = 0;
  let skipped = 0;
  for (const table of BACKUP_TABLES) {
    const incoming = backup.tables[table] ?? [];
    if (incoming.length === 0) continue;
    const existing = await db.table(table).bulkGet(incoming.map((r) => r.id));
    const toSave: BaseRow[] = [];
    incoming.forEach((raw, i) => {
      const row = pickColumns(table, raw) as BaseRow;
      if (table === 'exercises' && (row as unknown as { is_global: boolean }).is_global) return;
      row.user_id = userId;
      const local = existing[i] as BaseRow | undefined;
      if (local && Date.parse(local.updated_at) >= Date.parse(row.updated_at)) {
        skipped++;
        return;
      }
      toSave.push(row);
    });
    await saveRows(db, table, toSave as never[]);
    imported += toSave.length;
  }
  return { imported, skipped };
}

export function backupFileName(date: string): string {
  return `training-backup-${date}.json`;
}
