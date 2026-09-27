import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

// Tiny external store so the update banner can react to service-worker events.
type PwaState = { needRefresh: boolean; offlineReady: boolean };

let state: PwaState = { needRefresh: false, offlineReady: false };
const listeners = new Set<() => void>();
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function initPwa() {
  if (!('serviceWorker' in navigator)) return;
  updateSW = registerSW({
    onNeedRefresh: () => set({ needRefresh: true }),
    onOfflineReady: () => set({ offlineReady: true }),
    onRegisteredSW: (_url, registration) => {
      // Check for a new version hourly while the app stays open.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });
}

export function applyUpdate() {
  void updateSW?.(true);
}

export function dismissPwaMessage() {
  set({ needRefresh: false, offlineReady: false });
}

export function usePwaState(): PwaState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
