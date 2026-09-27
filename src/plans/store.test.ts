import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDB, type TrainingDB } from '../db/db';
import { newId } from '../db/ids';
import { emptyPlan, type PlanDraft } from '../logic/plan';
import { findTemplate, instantiateTemplate } from '../logic/templates';
import { syncOnce } from '../sync/engine';
import { FakeRemote, FakeServer } from '../sync/fakeRemote';
import { activatePlan, archivePlan, discardDraft, duplicate, loadDraft, savePlan } from './store';

const USER = '11111111-1111-4111-8111-111111111111';
let dbs: TrainingDB[] = [];
let n = 0;
const device = () => {
  const db = createDB(`plan-test-${n++}`);
  dbs.push(db);
  return db;
};
let db: TrainingDB;
beforeEach(() => {
  db = device();
});
afterEach(async () => {
  await Promise.all(dbs.map((d) => d.delete()));
  dbs = [];
});

const hybrid = () => instantiateTemplate(findTemplate('hybrid_stronglifts_running')!, '2026-09-28', newId);

describe('savePlan', () => {
  it('stores a plan and reads the same draft back', async () => {
    const plan = hybrid();
    await savePlan(db, USER, plan, 'draft', { saveReminders: true });
    expect(await loadDraft(db, USER, plan.id)).toEqual(plan);
    expect((await db.plans.get(plan.id))!.status).toBe('draft');
  });

  it('saving again without changes queues nothing', async () => {
    const plan = hybrid();
    await savePlan(db, USER, plan, 'draft', { saveReminders: true });
    const before = await db.outbox.count();
    await savePlan(db, USER, structuredClone(plan), 'draft', { saveReminders: true });
    expect(await db.outbox.count()).toBe(before);
  });

  it('an edit queues only the changed row', async () => {
    const plan = hybrid();
    await savePlan(db, USER, plan, 'draft');
    await db.outbox.clear();
    (plan.workouts[0]!.items[0]!.config as { start_weight: number }).start_weight = 60;
    await savePlan(db, USER, plan, 'draft');
    const queued = await db.outbox.toArray();
    expect(queued.map((q) => [q.table, q.row_id])).toEqual([['plan_items', plan.workouts[0]!.items[0]!.id]]);
  });

  it('removing a workout soft-deletes its rows', async () => {
    const plan = hybrid();
    await savePlan(db, USER, plan, 'draft', { saveReminders: true });
    const removed = plan.workouts.pop()!; // Intervals
    plan.schedule[5] = { ...plan.schedule[5]!, slot_kind: 'rest', workout_id: null };
    await savePlan(db, USER, plan, 'draft', { saveReminders: true });
    expect((await db.plan_workouts.get(removed.id))!.deleted_at).not.toBeNull();
    expect(await loadDraft(db, USER, plan.id)).toEqual(plan);
  });

  it('never stores a half-typed start date or length', async () => {
    const plan = hybrid();
    await savePlan(db, USER, plan, 'draft');
    await savePlan(db, USER, { ...plan, start_date: '2026-1', weeks: Number.NaN }, 'draft');
    const row = (await db.plans.get(plan.id))!;
    expect(row.start_date).toBe('2026-09-28');
    expect(row.weeks).toBeNull();
  });

  it('saving as active archives the previous active plan', async () => {
    const first = hybrid();
    await savePlan(db, USER, first, 'active');
    const second = instantiateTemplate(findTemplate('full_body_3')!, '2026-10-05', newId);
    await savePlan(db, USER, second, 'active');
    expect((await db.plans.get(first.id))!.status).toBe('archived');
    expect((await db.plans.get(second.id))!.status).toBe('active');
  });
});

describe('plan management', () => {
  it('activate, archive and re-activate', async () => {
    const a = hybrid();
    const b: PlanDraft = { ...emptyPlan(newId, '2026-09-28'), name: 'B' };
    await savePlan(db, USER, a, 'active');
    await savePlan(db, USER, b, 'archived');
    await activatePlan(db, USER, b.id);
    expect([(await db.plans.get(a.id))!.status, (await db.plans.get(b.id))!.status]).toEqual(['archived', 'active']);
    await archivePlan(db, b.id);
    expect((await db.plans.where('status').equals('active').count())).toBe(0);
  });

  it('duplicate makes an independent draft', async () => {
    const plan = hybrid();
    await savePlan(db, USER, plan, 'active');
    const copyId = (await duplicate(db, USER, plan.id, 'Copy'))!;
    const copy = (await loadDraft(db, USER, copyId))!;
    expect(copy.name).toBe('Copy');
    expect((await db.plans.get(copyId))!.status).toBe('draft');
    (copy.workouts[0]!.items[0]!.config as { sets: number }).sets = 3;
    await savePlan(db, USER, copy, 'draft');
    expect((await loadDraft(db, USER, plan.id))!.workouts[0]!.items[0]!.config).toMatchObject({ sets: 5 });
  });

  it('discarding only works on drafts and is a soft delete', async () => {
    const plan = hybrid();
    await savePlan(db, USER, plan, 'active');
    await discardDraft(db, plan.id);
    expect((await db.plans.get(plan.id))!.deleted_at).toBeNull();
    const draft = hybrid();
    await savePlan(db, USER, draft, 'draft');
    await discardDraft(db, draft.id);
    expect((await db.plans.get(draft.id))!.deleted_at).not.toBeNull();
  });
});

describe('plans survive reload and a second device', () => {
  it('a saved, edited and activated plan arrives intact on another device', async () => {
    const server = new FakeServer();
    const phone = db;
    const plan = hybrid();
    await savePlan(phone, USER, plan, 'draft', { saveReminders: true });
    plan.reminders = { ...plan.reminders, enabled: true, time_local: '06:45' };
    (plan.workouts[1]!.items[2]!.config as { start_weight: number }).start_weight = 60;
    await savePlan(phone, USER, plan, 'active', { saveReminders: true });
    await syncOnce(phone, new FakeRemote(server, USER));

    const laptop = device();
    await syncOnce(laptop, new FakeRemote(server, USER));
    expect(await loadDraft(laptop, USER, plan.id)).toEqual(plan);
    expect((await laptop.plans.get(plan.id))!.status).toBe('active');

    // "Reload": a fresh connection to the same IndexedDB sees the same plan.
    const reopened = createDB(laptop.name);
    dbs.push(reopened);
    expect(await loadDraft(reopened, USER, plan.id)).toEqual(plan);
  });
});
