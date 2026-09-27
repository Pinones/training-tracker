import { Screen } from '../components/Layout';
import { strings } from '../strings';

export function Placeholder({ title, text, phase }: { title: string; text: string; phase: number }) {
  return (
    <Screen title={title}>
      <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-slate-400">
        <p>{text}</p>
        <p className="mt-2 text-sm text-slate-500">{strings.placeholder.comingInPhase(phase)}</p>
      </div>
    </Screen>
  );
}
