import { useEffect, useState } from 'react';
import { Screen } from '../components/Layout';
import { isStandalone } from '../lib/platform';
import { strings } from '../strings';

const s = strings.settings;

export function Settings() {
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);

  const yesNo = (v: boolean | null) => (v === null ? s.unknown : v ? s.yes : s.no);

  return (
    <Screen title={s.title}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{s.appInfo}</h2>
      <dl className="divide-y divide-slate-800 rounded-2xl bg-slate-900">
        <Row label={s.version} value={__APP_VERSION__} />
        <Row label={s.installed} value={yesNo(isStandalone())} />
        <Row label={s.persistentStorage} value={yesNo(persisted)} />
      </dl>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-4 py-3">
      <dt className="text-slate-300">{label}</dt>
      <dd className="text-slate-400">{value}</dd>
    </div>
  );
}
