import { useEffect } from 'react';
import { applyUpdate, dismissPwaMessage, usePwaState } from '../lib/pwa';
import { strings } from '../strings';

export function UpdateBanner() {
  const { needRefresh, offlineReady } = usePwaState();

  useEffect(() => {
    if (!offlineReady || needRefresh) return;
    const t = setTimeout(dismissPwaMessage, 3000);
    return () => clearTimeout(t);
  }, [offlineReady, needRefresh]);

  if (!needRefresh && !offlineReady) return null;
  return (
    <div role="status" className="mx-4 mb-2 flex items-center gap-3 rounded-xl bg-slate-800 px-4 py-3 text-sm shadow-lg">
      <span className="flex-1">{needRefresh ? strings.update.available : strings.update.offlineReady}</span>
      {needRefresh && (
        <button type="button" onClick={applyUpdate} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-slate-900">
          {strings.update.reload}
        </button>
      )}
      <button type="button" onClick={dismissPwaMessage} className="px-1 text-slate-400">
        {strings.update.dismiss}
      </button>
    </div>
  );
}
