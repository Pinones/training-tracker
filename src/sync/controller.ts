// Runs the sync engine at the right moments and exposes its status to the UI.

import { useSyncExternalStore } from 'react';
import { db } from '../db/db';
import { onLocalWrite } from '../db/write';
import { supabase } from '../lib/supabase';
import { syncOnce } from './engine';
import { supabaseRemote } from './supabaseRemote';

export interface SyncStatus {
  running: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  online: boolean;
}

let status: SyncStatus = {
  running: false,
  lastSyncAt: null,
  lastError: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
};
const listeners = new Set<() => void>();
function set(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

const remote = supabaseRemote(supabase);
const WRITE_DEBOUNCE_MS = 800;
const INTERVAL_MS = 60_000;

let enabled = false;
let inFlight: Promise<boolean> | null = null;
let again = false;
let failures = 0;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/** Run one sync now (or join the one in progress). Resolves true on success. */
export function syncNow(): Promise<boolean> {
  if (!enabled) return Promise.resolve(false);
  if (inFlight) {
    again = true; // something changed mid-sync: go around once more
    return inFlight;
  }
  inFlight = (async () => {
    set({ running: true });
    try {
      do {
        again = false;
        await syncOnce(db, remote);
      } while (again);
      failures = 0;
      set({ lastSyncAt: new Date().toISOString(), lastError: null });
      return true;
    } catch (err) {
      failures++;
      set({ lastError: err instanceof Error ? err.message : String(err) });
      // Back off 5 s, 10 s, 20 s … up to 5 min. Local data is safe meanwhile.
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void syncNow(), Math.min(300_000, 5_000 * 2 ** (failures - 1)));
      return false;
    } finally {
      set({ running: false });
      inFlight = null;
    }
  })();
  return inFlight;
}

function soon() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void syncNow(), WRITE_DEBOUNCE_MS);
}

const onOnline = () => {
  set({ online: true });
  void syncNow();
};
const onOffline = () => set({ online: false });
const onVisible = () => {
  if (document.visibilityState === 'visible') void syncNow();
};

let stopFns: (() => void)[] = [];

/** Start syncing for the signed-in user. */
export function startSync() {
  if (enabled) return;
  enabled = true;
  const interval = setInterval(() => void syncNow(), INTERVAL_MS);
  const offWrite = onLocalWrite(soon);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  stopFns = [
    () => clearInterval(interval),
    offWrite,
    () => window.removeEventListener('online', onOnline),
    () => window.removeEventListener('offline', onOffline),
    () => document.removeEventListener('visibilitychange', onVisible),
  ];
  void syncNow();
}

export async function stopSync() {
  enabled = false;
  stopFns.forEach((f) => f());
  stopFns = [];
  clearTimeout(debounceTimer);
  clearTimeout(retryTimer);
  await inFlight;
  set({ lastSyncAt: null, lastError: null });
}
