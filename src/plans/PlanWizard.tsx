import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormProvider, useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useUserId } from '../auth/AuthProvider';
import { useProfile } from '../auth/useProfile';
import { Screen } from '../components/Layout';
import { Button, Message } from '../components/ui';
import { db } from '../db/db';
import type { PlanStatus } from '../db/types';
import { planSchema, stableStringify, type PlanDraft, type ReminderDraft } from '../logic/plan';
import { strings } from '../strings';
import { clearPendingEdit, loadDraft, loadPendingEdit, loadReminders, savePlan, storePendingEdit } from './store';
import { BasicsStep, RemindersStep, ReviewStep, ScheduleStep, WorkoutsStep } from './steps';
import { useExercises } from './useExercises';

const s = strings.plans;
const LAST = s.steps.length - 1;
const AUTOSAVE_MS = 500;

/** Which step owns each top-level field, to jump to the first error. */
const STEP_OF: Record<string, number> = { name: 0, goal_text: 0, start_date: 0, weeks: 0, workouts: 1, rotations: 2, schedule: 2, reminders: 3 };
const FIELDS_OF: (keyof PlanDraft)[][] = [['name', 'goal_text', 'start_date', 'weeks'], ['workouts'], ['schedule', 'rotations'], ['reminders'], []];

interface Loaded {
  draft: PlanDraft;
  status: PlanStatus;
  restored: boolean;
  /** the account's reminder settings when the wizard opened */
  accountReminders: ReminderDraft;
}

export function PlanWizard() {
  const { id = '' } = useParams();
  const userId = useUserId();
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);

  const load = useCallback(async () => {
    const plan = await db.plans.get(id);
    if (!plan || plan.deleted_at || plan.user_id !== userId) return setLoaded(null);
    const pending = await loadPendingEdit(db, id);
    const draft = pending ?? (await loadDraft(db, userId, id));
    const accountReminders = await loadReminders(db, userId);
    setLoaded(draft ? { draft, status: plan.status, restored: !!pending && plan.status !== 'draft', accountReminders } : null);
  }, [id, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loaded === undefined) return <Screen title={s.title}>{strings.common.loading}</Screen>;
  if (loaded === null) return <Screen title={s.title}><Message kind="error">{s.notFound}</Message></Screen>;
  return <WizardForm key={`${id}-${loaded.restored}`} {...loaded} onDiscardEdits={async () => {
    await clearPendingEdit(db, id);
    await load();
  }} />;
}

function WizardForm({ draft, status, restored, accountReminders, onDiscardEdits }: Loaded & { onDiscardEdits: () => Promise<void> }) {
  const userId = useUserId();
  const profile = useProfile();
  const exercises = useExercises(userId);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const step = Math.min(LAST, Math.max(0, Number(params.get('step') ?? 0) || 0));
  const [saving, setSaving] = useState(false);
  const [stepError, setStepError] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  const form = useForm<PlanDraft>({
    defaultValues: draft,
    resolver: zodResolver(planSchema) as unknown as Resolver<PlanDraft>,
    mode: 'onTouched',
  });

  // ----- autosave -----
  // Every change is kept locally at once (lossless, even half-typed values). A new
  // plan is also stored as a 'draft' plan row set, so it syncs to other devices.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  const isDraft = status === 'draft';
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const values = form.getValues();
    await storePendingEdit(db, values);
    if (isDraft) await savePlan(db, userId, values, 'draft');
    setSavedNote(true);
  }, [form, isDraft, userId]);

  useEffect(() => {
    const sub = form.watch(() => {
      dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    });
    return () => {
      sub.unsubscribe();
      void flush(); // leaving the wizard never loses the last edit
    };
  }, [form, flush]);

  // ----- navigation -----
  const go = (n: number) => {
    setStepError(false);
    setParams({ step: String(n) }, { replace: true });
    window.scrollTo(0, 0);
    document.querySelector('main')?.scrollTo(0, 0);
  };
  const next = async () => {
    const ok = FIELDS_OF[step]!.length === 0 || (await form.trigger(FIELDS_OF[step]!));
    if (ok) go(step + 1);
    else setStepError(true);
  };

  const onInvalid = (errors: FieldErrors<PlanDraft>) => {
    const first = Math.min(...Object.keys(errors).map((k) => STEP_OF[k] ?? LAST));
    go(Number.isFinite(first) ? first : LAST);
    setStepError(true);
  };
  const save = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      await flush();
      // Reminders belong to the account: only write them if they were changed here, so
      // saving a plan never overwrites settings changed elsewhere (or not yet synced).
      const remindersChanged = stableStringify(values.reminders) !== stableStringify(accountReminders);
      await savePlan(db, userId, values, isDraft ? 'active' : status, { saveReminders: remindersChanged });
      await clearPendingEdit(db, values.id);
      navigate('/plans', { replace: true });
    } finally {
      setSaving(false);
    }
  }, onInvalid);

  if (!exercises) return <Screen title={s.title}>{strings.common.loading}</Screen>;

  return (
    <Screen title={draft.name || s.newPlan} small>
      <FormProvider {...form}>
        <ol className="mb-4 flex gap-1" aria-label="Steps">
          {s.steps.map((label, i) => (
            <li key={label} className="flex-1">
              <button
                type="button"
                onClick={() => (i < step ? go(i) : undefined)}
                aria-current={i === step ? 'step' : undefined}
                className={`w-full border-t-4 pt-1 text-left text-[11px] ${i <= step ? 'border-accent text-slate-200' : 'border-slate-700 text-slate-500'}`}
              >
                {label}
              </button>
            </li>
          ))}
        </ol>

        {restored && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-slate-800 px-4 py-2 text-sm">
            <span>{s.restoredEdits}</span>
            <button type="button" className="font-semibold text-accent" onClick={() => void onDiscardEdits()}>
              {s.discardEdits}
            </button>
          </div>
        )}

        <form onSubmit={(e) => e.preventDefault()} noValidate>
          {step === 0 && <BasicsStep />}
          {step === 1 && <WorkoutsStep exercises={exercises} userId={userId} />}
          {step === 2 && <ScheduleStep />}
          {step === 3 && <RemindersStep trackBodyweight={profile?.track_bodyweight ?? true} />}
          {step === 4 && <ReviewStep exercises={exercises} />}

          {stepError && (
            <div className="mt-4">
              <Message kind="error">{s.fixErrors}</Message>
            </div>
          )}

          <div className="sticky bottom-0 -mx-4 mt-6 flex items-center gap-3 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
            {step > 0 && (
              <Button variant="secondary" onClick={() => go(step - 1)}>
                {s.back}
              </Button>
            )}
            <span className="flex-1 text-xs text-slate-500" role="status">
              {savedNote && (isDraft ? s.draftSaved : s.editsSaved)}
            </span>
            {step < LAST ? (
              <Button onClick={() => void next()}>{s.next}</Button>
            ) : (
              <Button onClick={() => void save()} disabled={saving} data-testid="save-plan">
                {isDraft ? s.saveAndActivate : s.save}
              </Button>
            )}
          </div>
        </form>
      </FormProvider>
    </Screen>
  );
}
