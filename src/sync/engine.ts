// Local-first sync: push the outbox with idempotent upserts, then pull every row
// changed since the last sync. Pure data logic; the Remote hides Supabase so this
// can be tested against an in-memory server.

import { pickColumns } from '../db/columns';
import { SYNCED_TABLES, type TrainingDB } from '../db/db';
import type { BaseRow, OutboxEntry, SyncedTableName } from '../db/types';

export interface PullCursor {
  updated_at: string;
  id: string;
}

export interface Remote {
  /** Idempotent upsert on id. Returns the server-stamped updated_at per id. */
  upsert(table: SyncedTableName, rows: BaseRow[]): Promise<{ id: string; updated_at: string }[]>;
  /** Rows ordered by (updated_at, id), strictly after `after` (all rows when null). */
  pull(table: SyncedTableName, after: PullCursor | null, limit: number): Promise<BaseRow[]>;
}

export const PUSH_BATCH = 200;
export const PULL_PAGE = 500;
/** Re-read this far back on every pull so a row committed late (by a slow transaction) is never missed. */
export const PULL_OVERLAP_MS = 60_000;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const cursorKey = (table: SyncedTableName) => `pull_cursor:${table}`;

/** Group outbox entries by row (first-queued order), then into same-table runs. */
function planBatches(entries: OutboxEntry[]): { table: SyncedTableName; ids: string[] }[] {
  const seen = new Set<string>();
  const batches: { table: SyncedTableName; ids: string[] }[] = [];
  for (const e of entries) {
    const key = `${e.table}:${e.row_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const last = batches.at(-1);
    if (last && last.table === e.table && last.ids.length < PUSH_BATCH) last.ids.push(e.row_id);
    else batches.push({ table: e.table, ids: [e.row_id] });
  }
  return batches;
}

/**
 * Push everything queued so far. Entries only leave the outbox after the server
 * accepted them, and only those queued before this push started: an edit made
 * while the request is in flight stays queued and goes out next time.
 * Throws on the first failed batch; everything before it is already safe.
 */
export async function push(db: TrainingDB, remote: Remote): Promise<number> {
  const entries = await db.outbox.orderBy('seq').toArray();
  if (entries.length === 0) return 0;
  const maxSeq = entries.at(-1)!.seq!;
  let pushed = 0;

  for (const { table, ids } of planBatches(entries)) {
    const local = await db.table(table).bulkGet(ids);
    const rows = local.filter((r): r is BaseRow => r !== undefined).map((r) => pickColumns(table, r as unknown as Record<string, unknown>) as BaseRow);
    const stamped = rows.length > 0 ? await remote.upsert(table, rows) : [];
    const serverTime = new Map(stamped.map((s) => [s.id, s.updated_at]));

    await db.transaction('rw', db.table(table), db.outbox, async () => {
      for (const id of ids) {
        const done = await db.outbox
          .where('[table+row_id]')
          .equals([table, id])
          .filter((e) => e.seq! <= maxSeq)
          .primaryKeys();
        await db.outbox.bulkDelete(done);
        const stillPending = await db.outbox.where('[table+row_id]').equals([table, id]).count();
        const ts = serverTime.get(id);
        if (ts && !stillPending) await db.table(table).update(id, { updated_at: ts });
      }
    });
    pushed += rows.length;
  }
  return pushed;
}

function laterCursor(a: PullCursor | null, b: PullCursor): PullCursor {
  if (!a) return b;
  const ta = Date.parse(a.updated_at);
  const tb = Date.parse(b.updated_at);
  if (tb !== ta) return tb > ta ? b : a;
  return b.updated_at > a.updated_at || (b.updated_at === a.updated_at && b.id > a.id) ? b : a;
}

/**
 * Pull rows changed on the server. A row with a local change still waiting in
 * the outbox is not overwritten: the local edit is newer and will be pushed.
 */
export async function pullTable(db: TrainingDB, remote: Remote, table: SyncedTableName): Promise<number> {
  const saved = ((await db.meta.get(cursorKey(table)))?.value as PullCursor | undefined) ?? null;
  let after: PullCursor | null = saved
    ? { updated_at: new Date(Date.parse(saved.updated_at) - PULL_OVERLAP_MS).toISOString(), id: ZERO_UUID }
    : null;
  let newest = saved;
  let applied = 0;

  for (;;) {
    const rows = await remote.pull(table, after, PULL_PAGE);
    if (rows.length === 0) break;

    await db.transaction('rw', db.table(table), db.outbox, db.meta, async () => {
      for (const row of rows) {
        const pending = await db.outbox.where('[table+row_id]').equals([table, row.id]).count();
        if (pending) continue;
        await db.table(table).put(pickColumns(table, row as unknown as Record<string, unknown>));
        applied++;
      }
      const last = rows.at(-1)!;
      newest = laterCursor(newest, { updated_at: last.updated_at, id: last.id });
      await db.meta.put({ key: cursorKey(table), value: newest });
    });

    if (rows.length < PULL_PAGE) break;
    const last = rows.at(-1)!;
    after = { updated_at: last.updated_at, id: last.id };
  }
  return applied;
}

export async function pull(db: TrainingDB, remote: Remote): Promise<number> {
  let applied = 0;
  for (const table of SYNCED_TABLES) applied += await pullTable(db, remote, table);
  return applied;
}

/** One full sync round: push first (so local edits win), then pull. */
export async function syncOnce(db: TrainingDB, remote: Remote): Promise<{ pushed: number; pulled: number }> {
  const pushed = await push(db, remote);
  const pulled = await pull(db, remote);
  return { pushed, pulled };
}

export function pendingCount(db: TrainingDB): Promise<number> {
  return db.outbox.count();
}

/** Forget everything local (used on explicit logout / account switch). */
export async function clearLocalData(db: TrainingDB): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
