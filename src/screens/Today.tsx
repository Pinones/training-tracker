import { Link } from 'react-router';
import { useUserId } from '../auth/AuthProvider';
import { useProfile } from '../auth/useProfile';
import { Screen } from '../components/Layout';
import { Card } from '../components/ui';
import { db } from '../db/db';
import { todayIn } from '../logic/dates';
import { resolveDay } from '../logic/rotation';
import { useLiveQuery } from '../lib/useLiveQuery';
import { strings } from '../strings';

const s = strings.today;

/** Phase 3: shows the active plan and what today's slot resolves to. Logging comes in phase 4. */
export function Today() {
  const userId = useUserId();
  const profile = useProfile();
  const today = todayIn(profile?.timezone);
  const data = useLiveQuery(async () => {
    const plan = (await db.plans.where('user_id').equals(userId).toArray()).find((p) => p.status === 'active' && !p.deleted_at);
    if (!plan) return { plan: null };
    const [workouts, rotations, schedule, sessions] = await Promise.all([
      db.plan_workouts.where('plan_id').equals(plan.id).filter((r) => !r.deleted_at).toArray(),
      db.plan_rotations.where('plan_id').equals(plan.id).filter((r) => !r.deleted_at).toArray(),
      db.plan_schedule.where('plan_id').equals(plan.id).filter((r) => !r.deleted_at).toArray(),
      db.sessions.where('user_id').equals(userId).toArray(),
    ]);
    const slot = resolveDay(
      schedule,
      rotations,
      sessions.filter((x) => x.workout_id).map((x) => ({ ...x, workout_id: x.workout_id! })),
      today,
    );
    const workout = slot.kind === 'workout' ? workouts.find((w) => w.id === slot.workoutId) : undefined;
    return { plan, workoutName: workout?.name };
  }, [userId, today]);

  return (
    <Screen title={s.title}>
      <div className="mb-4 flex justify-end">
        <Link to="/plans" className="text-sm font-semibold text-accent">
          {s.plansLink} →
        </Link>
      </div>
      {data === undefined ? null : data.plan ? (
        <Card className="space-y-1 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">{s.activePlan}</p>
          <p className="text-lg font-semibold">{data.plan.name}</p>
          <p className="text-slate-300">{data.workoutName ? s.todayIs(data.workoutName) : s.restDay}</p>
          <p className="pt-2 text-sm text-slate-500">{s.loggingSoon}</p>
        </Card>
      ) : (
        <Card className="space-y-4 p-6 text-center">
          <p className="text-slate-300">{s.noPlan}</p>
          <Link
            to="/plans/new"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 font-semibold text-slate-950"
            data-testid="choose-plan"
          >
            {s.choosePlan}
          </Link>
        </Card>
      )}
    </Screen>
  );
}
