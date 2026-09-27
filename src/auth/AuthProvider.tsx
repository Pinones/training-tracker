import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { db } from '../db/db';
import { supabase } from '../lib/supabase';
import { clearLocalData, pendingChanges, pendingCount } from '../sync/engine';
import { startSync, stopSync, syncNow } from '../sync/controller';

const OWNER_KEY = 'owner_user_id';

interface AuthState {
  session: Session | null;
  loading: boolean;
  /** Set when this device holds unsynced changes that belong to a different account. */
  otherAccountPending: number;
}

interface AuthApi extends AuthState {
  /** Returns the number of unsynced changes that blocked the logout (0 = logged out). */
  logOut(): Promise<number>;
  deleteAccount(): Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

/**
 * Make sure the local database belongs to `userId` before anything syncs.
 * Local data from another account is only cleared when none of it is unsynced.
 */
async function adoptDevice(userId: string): Promise<number> {
  const owner = (await db.meta.get(OWNER_KEY))?.value as string | undefined;
  if (owner && owner !== userId) {
    const pending = await pendingCount(db);
    if (pending > 0) return pending;
    await clearLocalData(db);
  }
  await db.meta.put({ key: OWNER_KEY, value: userId });
  return 0;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true, otherAccountPending: 0 });

  useEffect(() => {
    let cancelled = false;

    async function apply(session: Session | null) {
      if (session) {
        const blocked = await adoptDevice(session.user.id);
        if (cancelled) return;
        if (blocked === 0) startSync();
        setState({ session, loading: false, otherAccountPending: blocked });
      } else {
        // Session ended (e.g. expired elsewhere). Keep local data and its outbox:
        // logging back in syncs it. Only an explicit logOut() clears the device.
        await stopSync();
        if (!cancelled) setState({ session: null, loading: false, otherAccountPending: 0 });
      }
    }

    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return; // handled by getSession above
      // Defer: Supabase recommends not doing async work inside this callback.
      setTimeout(() => void apply(session), 0);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function logOut(): Promise<number> {
    if ((await pendingCount(db)) > 0) await syncNow();
    const pending = await pendingChanges(db);
    if (pending > 0) return pending;
    await stopSync();
    await supabase.auth.signOut({ scope: 'local' });
    await clearLocalData(db);
    return 0;
  }

  async function deleteAccount(): Promise<void> {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw new Error(error.message);
    await stopSync();
    await supabase.auth.signOut({ scope: 'local' });
    await clearLocalData(db);
  }

  return <AuthContext.Provider value={{ ...state, logOut, deleteAccount }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The signed-in user's id. Only use inside routes that require a session. */
export function useUserId(): string {
  const { session } = useAuth();
  if (!session) throw new Error('No session');
  return session.user.id;
}
