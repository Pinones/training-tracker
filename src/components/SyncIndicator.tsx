import { Link } from 'react-router';
import { db } from '../db/db';
import { useLiveQuery } from '../lib/useLiveQuery';
import { useSyncStatus } from '../sync/controller';
import { strings } from '../strings';

/** Always-visible save state. Tapping it opens the sync details in Settings. */
export function SyncIndicator() {
  const pending = useLiveQuery(() => db.outbox.count());
  const { online, running } = useSyncStatus();
  if (pending === undefined) return null;

  const saved = pending === 0;
  const label = saved ? strings.sync.allSaved : strings.sync.waiting(pending);
  return (
    <Link
      to="/settings#sync"
      aria-live="polite"
      data-testid="sync-indicator"
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
        saved ? 'bg-emerald-950 text-accent' : 'bg-amber-950 text-amber-300'
      }`}
    >
      {label}
      {!saved && !online && ` · ${strings.sync.offline}`}
      {!saved && online && running && ` · ${strings.sync.syncing}`}
    </Link>
  );
}
