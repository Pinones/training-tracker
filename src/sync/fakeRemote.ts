// In-memory stand-in for Supabase used by tests: server-stamped updated_at,
// RLS-like ownership checks, keyset pulls and a switch to simulate being offline.

import type { BaseRow, SyncedTableName } from '../db/types';
import type { PullCursor, Remote } from './engine';

/** A stored row: the base columns plus whatever the table has. */
export type ServerRow = BaseRow & Record<string, unknown>;

export class FakeServer {
  readonly tables = new Map<SyncedTableName, Map<string, ServerRow>>();
  private clock = Date.parse('2026-09-01T00:00:00Z');
  /** When true, every row written in one upsert gets the same timestamp (like Postgres now()). */
  sameStampPerRequest = true;

  table(name: SyncedTableName): Map<string, ServerRow> {
    let t = this.tables.get(name);
    if (!t) this.tables.set(name, (t = new Map()));
    return t;
  }

  tick(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  rows(name: SyncedTableName): ServerRow[] {
    return [...this.table(name).values()];
  }
}

export class FakeRemote implements Remote {
  offline = false;
  upsertCalls = 0;
  /** Runs inside upsert, before the server applies it (to simulate edits made mid-request). */
  beforeUpsert: (() => Promise<void>) | null = null;
  private readonly server: FakeServer;
  private readonly userId: string;

  constructor(server: FakeServer, userId: string) {
    this.server = server;
    this.userId = userId;
  }

  async upsert(table: SyncedTableName, rows: BaseRow[]) {
    if (this.offline) throw new TypeError('Failed to fetch');
    this.upsertCalls++;
    if (this.beforeUpsert) await this.beforeUpsert();
    const t = this.server.table(table);
    for (const r of rows) {
      const existing = t.get(r.id);
      if (r.user_id !== this.userId || (existing && existing.user_id !== this.userId)) {
        throw new Error('new row violates row-level security policy');
      }
    }
    let stamp = this.server.tick();
    return rows.map((r) => {
      if (!this.server.sameStampPerRequest) stamp = this.server.tick();
      const existing = t.get(r.id);
      const row = { ...r, created_at: existing?.created_at ?? r.created_at, updated_at: stamp };
      t.set(r.id, structuredClone(row));
      return { id: r.id, updated_at: stamp };
    });
  }

  async pull(table: SyncedTableName, after: PullCursor | null, limit: number) {
    if (this.offline) throw new TypeError('Failed to fetch');
    return this.server
      .rows(table)
      .filter((r) => r.user_id === this.userId || (r.user_id === null && table === 'exercises'))
      .filter(
        (r) =>
          !after ||
          r.updated_at > after.updated_at ||
          (r.updated_at === after.updated_at && r.id > after.id),
      )
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }
}
