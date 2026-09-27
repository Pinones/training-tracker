import { useMemo, useState, type FormEvent } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useUserId } from '../auth/AuthProvider';
import { useProfile } from '../auth/useProfile';
import { Screen } from '../components/Layout';
import { Button, Card, Message, SectionTitle } from '../components/ui';
import { db } from '../db/db';
import { deterministicId } from '../db/ids';
import type { BodyweightRow } from '../db/types';
import { baseRow, restore, saveRow, softDelete } from '../db/write';
import { isPlateau, weeklyAverages } from '../logic/bodyweight';
import { addDays, compareDates, daysBetween, todayIn, type ISODate } from '../logic/dates';
import { formatKg, parseDecimal } from '../logic/format';
import { useLiveQuery } from '../lib/useLiveQuery';
import { strings } from '../strings';

const s = strings.body;

// Chart colors, validated for the dark surface (dataviz validator: all checks pass).
const DAILY = '#3987e5';
const WEEKLY = '#d95926';
const GOAL = '#94a3b8';
const GRID = '#1e293b';
const MUTED = '#94a3b8';

const EPOCH: ISODate = '1970-01-01';
const dayNum = (d: ISODate) => daysBetween(EPOCH, d);
const fromDayNum = (n: number) => addDays(EPOCH, Math.round(n));

type Range = 28 | 84 | 0;
const RANGES: { days: Range; label: string }[] = [
  { days: 28, label: '4 weeks' },
  { days: 84, label: '12 weeks' },
  { days: 0, label: 'All' },
];

export function Body() {
  const userId = useUserId();
  const profile = useProfile();
  const today = todayIn(profile?.timezone);
  const entries = useLiveQuery(
    () => db.bodyweights.where('user_id').equals(userId).filter((r) => !r.deleted_at).toArray(),
    [userId],
  );

  if (profile && !profile.track_bodyweight) {
    return (
      <Screen title={s.title}>
        <Message>{s.trackingOff}</Message>
      </Screen>
    );
  }

  const sorted = (entries ?? []).slice().sort((a, b) => compareDates(a.date, b.date));
  const goal = profile?.bw_goal_kg ?? null;
  const plateau = isPlateau(weeklyAverages(sorted), goal);

  return (
    <Screen title={s.title}>
      <QuickEntry userId={userId} today={today} entries={sorted} />
      {plateau && (
        <div className="mt-4 rounded-2xl border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-200">{s.plateau}</div>
      )}
      {sorted.length > 0 && <BodyChart entries={sorted} goal={goal} today={today} />}
      <RecentEntries entries={sorted} />
    </Screen>
  );
}

function QuickEntry({ userId, today, entries }: { userId: string; today: ISODate; entries: BodyweightRow[] }) {
  const [date, setDate] = useState(today);
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const existing = entries.find((e) => e.date === date);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const kg = parseDecimal(value);
    if (kg === null || kg < 20 || kg > 400) return setMsg({ kind: 'error', text: s.invalidWeight });
    // One row per user per day, with the same id on every device.
    const id = await deterministicId(userId, date);
    const prev = await db.bodyweights.get(id);
    const row: BodyweightRow = { ...(prev ?? baseRow(userId, id)), date, weight: kg, deleted_at: null };
    await saveRow(db, 'bodyweights', row);
    setValue('');
    setMsg({ kind: 'success', text: s.logged(formatKg(kg)) });
  };

  return (
    <Card className="p-4">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <div className="flex gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-sm text-slate-300">{date === today ? s.todayWeight : s.date}</span>
            <div className="flex items-center rounded-xl border border-slate-700 bg-slate-950 focus-within:border-accent">
              <input
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                aria-label={s.todayWeight}
                data-testid="weight-input"
                placeholder={existing ? String(existing.weight) : '82.4'}
                className="min-h-12 w-full bg-transparent px-3 text-2xl font-semibold outline-none"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <span className="pr-3 text-slate-400">{strings.common.kg}</span>
            </div>
          </label>
          <Button type="submit" className="self-end" data-testid="log-weight">
            {s.log}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          {s.date}
          <input
            type="date"
            max={today}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
          />
        </label>
        {msg && <Message kind={msg.kind}>{msg.text}</Message>}
      </form>
    </Card>
  );
}

function BodyChart({ entries, goal, today }: { entries: BodyweightRow[]; goal: number | null; today: ISODate }) {
  const [range, setRange] = useState<Range>(84);

  const { daily, weekly, domainX, domainY } = useMemo(() => {
    const from = range ? addDays(today, -range + 1) : entries[0]!.date;
    const visible = entries.filter((e) => compareDates(e.date, from) >= 0);
    const daily = visible.map((e) => ({ x: dayNum(e.date), y: e.weight }));
    // Weekly average (Mon–Sun) as a step line: one point per Monday, plus the last Sunday.
    const weeks = weeklyAverages(visible);
    const weekly = weeks.map((w) => ({ x: dayNum(w.weekStart), y: w.average }));
    const last = weeks.at(-1);
    if (last) weekly.push({ x: dayNum(last.weekStart) + 7, y: last.average });

    const ys = [...daily.map((d) => d.y), ...(goal !== null ? [goal] : [])];
    const domainY: [number, number] = [Math.floor(Math.min(...ys) - 1), Math.ceil(Math.max(...ys) + 1)];
    const x0 = Math.min(dayNum(from), ...weekly.map((w) => w.x));
    const domainX: [number, number] = [x0, Math.max(dayNum(today), ...weekly.map((w) => w.x))];
    return { daily, weekly, domainX, domainY };
  }, [entries, goal, range, today]);

  return (
    <section>
      <div className="mt-6 mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{s.chartTitle}</h2>
        <div className="flex gap-1" role="group">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              aria-pressed={range === r.days}
              onClick={() => setRange(r.days)}
              className={`rounded-lg px-2.5 py-1 text-xs ${range === r.days ? 'bg-slate-700 text-slate-100' : 'text-slate-400'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <Card className="p-3">
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
          <LegendItem swatch={<span className="h-2.5 w-2.5 rounded-full" style={{ background: DAILY }} />} label={s.daily} />
          <LegendItem swatch={<span className="h-0.5 w-4" style={{ background: WEEKLY }} />} label={s.weeklyAvg} />
          {goal !== null && (
            <LegendItem
              swatch={<span className="w-4 border-t-2 border-dashed" style={{ borderColor: GOAL }} />}
              label={`${s.goal} ${formatKg(goal)}`}
            />
          )}
        </ul>
        <div className="h-56" role="img" aria-label={s.chartTitle}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                type="number"
                dataKey="x"
                domain={domainX}
                tickFormatter={(n: number) => fromDayNum(n).slice(5)}
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={{ stroke: GRID }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={domainY}
                allowDecimals={false}
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              {goal !== null && <ReferenceLine y={goal} stroke={GOAL} strokeDasharray="4 4" strokeWidth={1.5} />}
              <Line
                data={weekly}
                dataKey="y"
                name={s.weeklyAvg}
                type="stepAfter"
                stroke={WEEKLY}
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              <Scatter data={daily} dataKey="y" name={s.daily} fill={DAILY} shape="circle" isAnimationActive={false} />
              <Tooltip
                cursor={{ stroke: MUTED, strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as { x: number; y: number } | undefined;
                  if (!active || !p) return null;
                  return (
                    <div className="rounded-lg bg-slate-800 px-3 py-2 text-xs shadow-lg">
                      <div className="text-slate-400">{fromDayNum(p.x)}</div>
                      <div className="font-semibold text-slate-100">{formatKg(p.y)}</div>
                    </div>
                  );
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </section>
  );
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      {swatch}
      {label}
    </li>
  );
}

function RecentEntries({ entries }: { entries: BodyweightRow[] }) {
  const [undo, setUndo] = useState<BodyweightRow | null>(null);
  const recent = entries.slice(-14).reverse();

  return (
    <section>
      <SectionTitle>{s.recent}</SectionTitle>
      {undo && (
        <div className="mb-2 flex items-center justify-between rounded-xl bg-slate-800 px-4 py-2 text-sm">
          <span>
            {undo.date} · {formatKg(undo.weight)}
          </span>
          <button
            type="button"
            className="font-semibold text-accent"
            onClick={() => {
              void restore(db, 'bodyweights', undo.id);
              setUndo(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
      {recent.length === 0 ? (
        <p className="text-sm text-slate-400">{s.noEntries}</p>
      ) : (
        <Card className="divide-y divide-slate-800">
          <table className="w-full text-left">
            <tbody>
              {recent.map((e) => (
                <tr key={e.id} className="border-b border-slate-800 last:border-0" data-testid="weight-row">
                  <td className="px-4 py-3 text-slate-400">{e.date}</td>
                  <td className="px-4 py-3 font-semibold">{formatKg(e.weight)}</td>
                  <td className="px-2 py-1 text-right">
                    <button
                      type="button"
                      className="min-h-11 px-3 text-sm text-slate-400"
                      onClick={() => {
                        void softDelete(db, 'bodyweights', e.id);
                        setUndo(e);
                      }}
                    >
                      {s.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
