import { liveQuery } from 'dexie';
import { useEffect, useState, type DependencyList } from 'react';

/**
 * Re-runs `query` whenever the IndexedDB data it read changes (in this tab or another).
 * Returns `undefined` until the first result arrives.
 */
export function useLiveQuery<T>(query: () => Promise<T> | T, deps: DependencyList = []): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: setValue,
      error: (err) => console.error('liveQuery failed', err),
    });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}
