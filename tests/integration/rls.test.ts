// Runs against the real Supabase project: `npm run test:rls`.
// Proves that row-level security keeps every user's data private.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient, createTestUser, deleteTestUser, type TestUser } from './helpers';

const TABLES = [
  'profiles', 'exercises', 'plans', 'plan_workouts', 'plan_items', 'plan_rotations', 'plan_schedule',
  'sessions', 'session_items', 'set_logs', 'weight_overrides', 'bodyweights', 'reminder_settings',
  'push_subscriptions', 'daily_briefs',
];

const admin = adminClient();
let a: TestUser;
let b: TestUser;
const weightId = crypto.randomUUID();
const planId = crypto.randomUUID();

beforeAll(async () => {
  a = await createTestUser(admin, 'rls-a');
  b = await createTestUser(admin, 'rls-b');
  const bw = await a.client.from('bodyweights').insert({ id: weightId, user_id: a.id, date: '2026-09-27', weight: 88.4 });
  expect(bw.error).toBeNull();
  const plan = await a.client
    .from('plans')
    .insert({ id: planId, user_id: a.id, name: 'A secret plan', start_date: '2026-09-28', status: 'active' });
  expect(plan.error).toBeNull();
});

afterAll(async () => {
  await deleteTestUser(admin, a);
  await deleteTestUser(admin, b);
});

describe('row-level security', () => {
  it('user A can read their own data', async () => {
    const { data } = await a.client.from('bodyweights').select('id, weight');
    expect(data).toEqual([{ id: weightId, weight: 88.4 }]);
  });

  it("user B cannot read user A's data in any table", async () => {
    for (const table of TABLES) {
      const { data, error } = await b.client.from(table).select('*').eq('user_id', a.id);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
    const byId = await b.client.from('bodyweights').select('*').eq('id', weightId);
    expect(byId.data).toEqual([]);
  });

  it("user B cannot change user A's rows", async () => {
    await b.client.from('bodyweights').update({ weight: 1 }).eq('id', weightId);
    const upsert = await b.client
      .from('bodyweights')
      .upsert({ id: weightId, user_id: b.id, date: '2026-09-27', weight: 2 }, { onConflict: 'id' });
    expect(upsert.error).not.toBeNull();
    const { data } = await a.client.from('bodyweights').select('weight').eq('id', weightId).single();
    expect(data?.weight).toBe(88.4);
  });

  it('user B cannot write rows owned by user A', async () => {
    const { error } = await b.client
      .from('plans')
      .insert({ id: crypto.randomUUID(), user_id: a.id, name: 'Injected', start_date: '2026-09-28', status: 'active' });
    expect(error).not.toBeNull();
  });

  it('nobody can hard-delete rows (soft deletes only)', async () => {
    await b.client.from('bodyweights').delete().eq('id', weightId);
    await a.client.from('bodyweights').delete().eq('id', weightId);
    const { data } = await a.client.from('bodyweights').select('id').eq('id', weightId);
    expect(data).toHaveLength(1);
  });

  it('a user cannot move a row to another account', async () => {
    await a.client.from('plans').update({ user_id: b.id }).eq('id', planId);
    const { data } = await admin.from('plans').select('user_id').eq('id', planId).single();
    expect(data?.user_id).toBe(a.id);
  });

  it('logged-out visitors see nothing', async () => {
    const { data } = await anonClient().from('bodyweights').select('*');
    expect(data ?? []).toEqual([]);
  });

  it('global exercises are readable by everyone signed in, but not writable', async () => {
    const { data } = await b.client.from('exercises').select('id').eq('is_global', true);
    expect(data!.length).toBeGreaterThanOrEqual(21);
    await b.client.from('exercises').update({ name: 'Hacked' }).eq('is_global', true);
    const squat = await b.client.from('exercises').select('name').eq('id', '3103076c-c1e6-4c43-bdfb-385f00bf50ac').single();
    expect(squat.data?.name).toBe('Squat');
  });

  it('the server stamps updated_at, and a profile is created at sign-up', async () => {
    const { data } = await a.client.from('profiles').select('id, user_id').single();
    expect(data).toEqual({ id: a.id, user_id: a.id });
    const before = await a.client.from('bodyweights').select('updated_at').eq('id', weightId).single();
    await a.client.from('bodyweights').update({ weight: 88.1, updated_at: '2000-01-01T00:00:00Z' }).eq('id', weightId);
    const after = await a.client.from('bodyweights').select('updated_at').eq('id', weightId).single();
    expect(Date.parse(after.data!.updated_at)).toBeGreaterThan(Date.parse(before.data!.updated_at));
  });

  it('deleting an account deletes its data', async () => {
    const c = await createTestUser(admin, 'rls-c');
    await c.client.from('bodyweights').insert({ id: crypto.randomUUID(), user_id: c.id, date: '2026-09-27', weight: 70 });
    const { error } = await c.client.rpc('delete_my_account');
    expect(error).toBeNull();
    const { data } = await admin.from('bodyweights').select('id').eq('user_id', c.id);
    expect(data).toEqual([]);
  });
});
