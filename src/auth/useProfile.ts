import { db } from '../db/db';
import type { ProfileRow } from '../db/types';
import { useLiveQuery } from '../lib/useLiveQuery';
import { useAuth } from './AuthProvider';

/**
 * The signed-in user's profile. The server creates it at sign-up (id = user id),
 * so it appears locally after the first pull. `undefined` while loading.
 */
export function useProfile(): ProfileRow | undefined {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useLiveQuery(async () => (userId ? await db.profiles.get(userId) : undefined), [userId]);
}
