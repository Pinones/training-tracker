import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useUserId } from '../auth/AuthProvider';
import { useProfile } from '../auth/useProfile';
import { Screen } from '../components/Layout';
import { Button, Card, SectionTitle } from '../components/ui';
import { db } from '../db/db';
import { newId } from '../db/ids';
import type { PlanRow } from '../db/types';
import { todayIn } from '../logic/dates';
import { emptyPlan, sessionsPerWeek } from '../logic/plan';
import { findTemplate, instantiateTemplate, SCRATCH_KEY, TEMPLATES } from '../logic/templates';
import { useLiveQuery } from '../lib/useLiveQuery';
import { strings } from '../strings';
import { activatePlan, archivePlan, discardDraft, duplicate, loadReminders, pendingEditIds, savePlan, storePendingEdit } from './store';

const s = strings.plans;

export function PlansScreen() {
  const userId = useUserId();
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const plans = (await db.plans.where('user_id').equals(userId).toArray()).filter((p) => !p.deleted_at);
    plans.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const days = await db.plan_schedule.where('plan_id').anyOf(plans.map((p) => p.id)).toArray();
    const perWeek = new Map(plans.map((p) => [p.id, sessionsPerWeek({ schedule: days.filter((d) => d.plan_id === p.id && !d.deleted_at) } as never)]));
    return { plans, perWeek, edits: await pendingEditIds(db) };
  }, [userId]);

  if (!data) return <Screen title={s.title}>{strings.common.loading}</Screen>;
  const { plans, perWeek, edits } = data;
  const active = plans.filter((p) => p.status === 'active');
  const drafts = plans.filter((p) => p.status === 'draft');
  const others = plans.filter((p) => p.status === 'archived');

  const card = (p: PlanRow) => (
    <PlanCard
      key={p.id}
      plan={p}
      perWeek={perWeek.get(p.id) ?? 0}
      hasEdits={edits.has(p.id)}
      onEdit={() => navigate(`/plans/${p.id}/edit`)}
      onDuplicate={async () => {
        const id = await duplicate(db, userId, p.id, s.copyName(p.name));
        if (id) navigate(`/plans/${id}/edit`);
      }}
      onActivate={() => void activatePlan(db, userId, p.id)}
      onArchive={() => void archivePlan(db, p.id)}
      onDiscard={() => window.confirm(s.discardConfirm) && void discardDraft(db, p.id)}
    />
  );

  return (
    <Screen title={s.title}>
      <Link to="/plans/new" className="flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 font-semibold text-slate-950">
        + {s.newPlan}
      </Link>
      {plans.length === 0 && <p className="mt-6 text-slate-400">{s.none}</p>}
      {active.length > 0 && <SectionTitle>{s.active}</SectionTitle>}
      <div className="space-y-3">{active.map(card)}</div>
      {drafts.length > 0 && <SectionTitle>{s.drafts}</SectionTitle>}
      <div className="space-y-3">{drafts.map(card)}</div>
      {others.length > 0 && <SectionTitle>{s.others}</SectionTitle>}
      <div className="space-y-3">{others.map(card)}</div>
    </Screen>
  );
}

function PlanCard({
  plan,
  perWeek,
  hasEdits,
  onEdit,
  onDuplicate,
  onActivate,
  onArchive,
  onDiscard,
}: {
  plan: PlanRow;
  perWeek: number;
  hasEdits: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onActivate: () => void;
  onArchive: () => void;
  onDiscard: () => void;
}) {
  const d = strings.describe;
  return (
    <Card className="p-4" data-testid="plan-card">
      <p className="font-semibold">{plan.name || s.newPlan}</p>
      <p className="text-sm text-slate-400">
        {[s.startsOn(plan.start_date), plan.weeks ? d.weeks(plan.weeks) : d.ongoing, d.perWeek(perWeek)].join(' · ')}
      </p>
      {hasEdits && plan.status !== 'draft' && <p className="mt-1 text-xs text-amber-300">{s.unsavedEdits}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onEdit}>
          {plan.status === 'draft' ? s.continueDraft : s.edit}
        </Button>
        {plan.status === 'archived' && <Button onClick={onActivate}>{s.activate}</Button>}
        {plan.status !== 'draft' && (
          <Button variant="secondary" onClick={onDuplicate}>
            {s.duplicate}
          </Button>
        )}
        {plan.status === 'active' && (
          <Button variant="secondary" onClick={onArchive}>
            {s.archive}
          </Button>
        )}
        {plan.status === 'draft' && (
          <Button variant="secondary" onClick={onDiscard}>
            {s.discard}
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Step 0 of the wizard: pick a template (copied into a new draft) or start from scratch. */
export function NewPlanScreen() {
  const userId = useUserId();
  const profile = useProfile();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const start = async (key: string) => {
    setBusy(true);
    const today = todayIn(profile?.timezone);
    const t = findTemplate(key);
    const current = await loadReminders(db, userId);
    const fresh = t ? instantiateTemplate(t, today, newId) : { ...emptyPlan(newId, today), template_key: SCRATCH_KEY };
    // Reminders belong to the account: start from the current settings so a new plan never
    // silently turns them off. A template only suggests its own training days.
    const draft = { ...fresh, reminders: { ...current, weekdays: t ? fresh.reminders.weekdays : current.weekdays } };
    await savePlan(db, userId, draft, 'draft');
    await storePendingEdit(db, draft); // keeps the template's reminder suggestions too
    navigate(`/plans/${draft.id}/edit?step=0`, { replace: true });
  };

  const options = [
    ...TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description })),
    { key: SCRATCH_KEY, name: s.scratchName, description: s.scratchDescription },
  ];

  return (
    <Screen title={s.chooseTitle}>
      <p className="mb-4 text-slate-400">{s.chooseIntro}</p>
      <ul className="space-y-3">
        {options.map((o) => (
          <li key={o.key}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void start(o.key)}
              className="w-full rounded-2xl bg-slate-900 p-4 text-left disabled:opacity-50"
              data-testid={`template-${o.key}`}
            >
              <span className="block font-semibold">{o.name}</span>
              <span className="mt-1 block text-sm text-slate-400">{o.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
