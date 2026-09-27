// Reading and writing plans in the local database (then synced like everything else).

import type { TrainingDB } from '../db/db';
import { newId } from '../db/ids';
import type { PlanRow, ReminderSettingsRow } from '../db/types';
import { baseRow, saveRows } from '../db/write';
import { isISODate } from '../logic/dates';
import {
  activationChanges,
  DEFAULT_REMINDERS,
  diffRows,
  draftToRows,
  duplicatePlan,
  rowsToDraft,
  stableStringify,
  type PlanDraft,
  type PlanRows,
  type PlanStatus,
  type ReminderDraft,
} from '../logic/plan';

const PLAN_TABLES = (db: TrainingDB) => [
  db.plans,
  db.plan_workouts,
  db.plan_items,
  db.plan_rotations,
  db.plan_schedule,
  db.reminder_settings,
  db.outbox,
];

/** All stored rows of a plan, including soft-deleted children (needed for diffing). */
export async function loadPlanRows(db: TrainingDB, planId: string): Promise<PlanRows | null> {
  const plan = await db.plans.get(planId);
  if (!plan) return null;
  const workouts = await db.plan_workouts.where('plan_id').equals(planId).toArray();
  const items = await db.plan_items.where('workout_id').anyOf(workouts.map((w) => w.id)).toArray();
  const rotations = await db.plan_rotations.where('plan_id').equals(planId).toArray();
  const schedule = await db.plan_schedule.where('plan_id').equals(planId).toArray();
  return { plan, workouts, items, rotations, schedule } as unknown as PlanRows;
}

/** Reminder settings are per user (one row, id = user id). */
export async function loadReminders(db: TrainingDB, userId: string): Promise<ReminderDraft> {
  const row = await db.reminder_settings.get(userId);
  if (!row || row.deleted_at) return { ...DEFAULT_REMINDERS };
  return { enabled: row.enabled, time_local: row.time_local, weekdays: row.weekdays, weigh_in_weekdays: row.weigh_in_weekdays };
}

export async function loadDraft(db: TrainingDB, userId: string, planId: string): Promise<PlanDraft | null> {
  const rows = await loadPlanRows(db, planId);
  if (!rows) return null;
  return rowsToDraft(rows, await loadReminders(db, userId), newId);
}

/**
 * A draft that is still being edited may be half-filled. Make sure what we store
 * can never be rejected by the server (and so never block the sync queue).
 */
function storable(draft: PlanDraft, previous: PlanRows | null): PlanDraft {
  const fallbackDate = previous?.plan.start_date ?? new Date().toISOString().slice(0, 10);
  const weeks = draft.weeks;
  return {
    ...draft,
    start_date: isISODate(draft.start_date) ? draft.start_date : fallbackDate,
    weeks: typeof weeks === 'number' && Number.isInteger(weeks) && weeks > 0 ? weeks : null,
  };
}

/**
 * Save a plan: write only the rows that changed and soft-delete removed ones, all
 * in one transaction together with their outbox entries. Saving as 'active'
 * archives whichever plan was active before.
 */
export async function savePlan(
  db: TrainingDB,
  userId: string,
  draft: PlanDraft,
  status: PlanStatus,
  opts: { saveReminders?: boolean } = {},
): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', PLAN_TABLES(db), async () => {
    const existing = await loadPlanRows(db, draft.id);
    const desired = draftToRows(storable(draft, existing), userId, status, now);

    const planDiff = diffRows(existing ? [existing.plan] : [], [desired.plan], now);
    const parts = [
      ['plan_workouts', diffRows(existing?.workouts ?? [], desired.workouts, now)],
      ['plan_items', diffRows(existing?.items ?? [], desired.items, now)],
      ['plan_rotations', diffRows(existing?.rotations ?? [], desired.rotations, now)],
      ['plan_schedule', diffRows(existing?.schedule ?? [], desired.schedule, now)],
    ] as const;

    await saveRows(db, 'plans', planDiff.upsert as unknown as PlanRow[]);
    for (const [table, { upsert, softDelete }] of parts) {
      await saveRows(db, table, [...upsert, ...softDelete] as never[]);
    }

    if (status === 'active') {
      const others = (await db.plans.where('user_id').equals(userId).toArray()).filter((p) => p.id !== draft.id);
      await saveRows(db, 'plans', activationChanges(others, draft.id));
    }

    if (opts.saveReminders) await saveReminders(db, userId, draft.reminders);
  });
}

async function saveReminders(db: TrainingDB, userId: string, r: ReminderDraft) {
  const prev = await db.reminder_settings.get(userId);
  const next: ReminderSettingsRow = {
    ...(prev ?? baseRow(userId, userId)),
    deleted_at: null,
    enabled: r.enabled,
    time_local: r.time_local,
    weekdays: [...r.weekdays].sort(),
    weigh_in_weekdays: [...r.weigh_in_weekdays].sort(),
  };
  if (prev && stableStringify({ ...prev, updated_at: 0 }) === stableStringify({ ...next, updated_at: 0 })) return;
  await saveRows(db, 'reminder_settings', [next]);
}

async function setStatus(db: TrainingDB, planId: string, status: PlanStatus) {
  const plan = await db.plans.get(planId);
  if (plan && plan.status !== status) await saveRows(db, 'plans', [{ ...plan, status }]);
}

export async function activatePlan(db: TrainingDB, userId: string, planId: string): Promise<void> {
  await db.transaction('rw', db.plans, db.outbox, async () => {
    const plans = await db.plans.where('user_id').equals(userId).toArray();
    await saveRows(db, 'plans', activationChanges(plans, planId));
  });
}

export function archivePlan(db: TrainingDB, planId: string): Promise<void> {
  return setStatus(db, planId, 'archived');
}

/** Discard a draft plan (soft delete, like everything else). */
export async function discardDraft(db: TrainingDB, planId: string): Promise<void> {
  const plan = await db.plans.get(planId);
  if (plan?.status !== 'draft') return;
  await saveRows(db, 'plans', [{ ...plan, deleted_at: new Date().toISOString() }]);
  await clearPendingEdit(db, planId);
}

/** Copy a plan into a new draft. Returns the new plan's id. */
export async function duplicate(db: TrainingDB, userId: string, planId: string, name: string): Promise<string | null> {
  const draft = await loadDraft(db, userId, planId);
  if (!draft) return null;
  const copy = duplicatePlan(draft, newId, name);
  await savePlan(db, userId, copy, 'draft');
  return copy.id;
}

// ---------- Unsaved edits of an existing plan (local only) ----------

const editKey = (planId: string) => `plan_edit:${planId}`;

export async function loadPendingEdit(db: TrainingDB, planId: string): Promise<PlanDraft | null> {
  return ((await db.meta.get(editKey(planId)))?.value as PlanDraft | undefined) ?? null;
}

export async function storePendingEdit(db: TrainingDB, draft: PlanDraft): Promise<void> {
  await db.meta.put({ key: editKey(draft.id), value: structuredClone(draft) });
}

export async function clearPendingEdit(db: TrainingDB, planId: string): Promise<void> {
  await db.meta.delete(editKey(planId));
}

export async function pendingEditIds(db: TrainingDB): Promise<Set<string>> {
  const keys = (await db.meta.where('key').startsWith('plan_edit:').primaryKeys()) as string[];
  return new Set(keys.map((k) => k.slice('plan_edit:'.length)));
}
