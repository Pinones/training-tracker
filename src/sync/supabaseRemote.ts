import type { SupabaseClient } from '@supabase/supabase-js';
import type { BaseRow, SyncedTableName } from '../db/types';
import type { PullCursor, Remote } from './engine';

export class RemoteError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code: string | undefined) {
    super(message);
    this.code = code;
  }
}

export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async upsert(table: SyncedTableName, rows: BaseRow[]) {
      const { data, error } = await client
        .from(table)
        .upsert(rows, { onConflict: 'id' })
        .select('id, updated_at');
      if (error) throw new RemoteError(`${table}: ${error.message}`, error.code);
      return (data ?? []) as { id: string; updated_at: string }[];
    },

    async pull(table: SyncedTableName, after: PullCursor | null, limit: number) {
      let q = client.from(table).select('*').order('updated_at').order('id').limit(limit);
      if (after) {
        // Keyset pagination on (updated_at, id). Values are quoted because timestamps contain ':' and '.'.
        const ts = `"${after.updated_at}"`;
        q = q.or(`updated_at.gt.${ts},and(updated_at.eq.${ts},id.gt.${after.id})`);
      }
      const { data, error } = await q;
      if (error) throw new RemoteError(`${table}: ${error.message}`, error.code);
      return (data ?? []) as BaseRow[];
    },
  };
}
