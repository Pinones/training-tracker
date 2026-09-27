import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDB, type TrainingDB } from '../db/db';
import { deterministicId } from '../db/ids';
import type { BodyweightRow } from '../db/types';
import { baseRow, saveRow, softDelete, updateRow } from '../db/write';
import { clearLocalData, pendingCount, pull, push, syncOnce, PULL_PAGE } from './engine';
import { FakeRemote, FakeServer } from './fakeRemote';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

let dbs: TrainingDB[] = [];
let n = 0;
function device(): TrainingDB {
  const db = createDB(`test-${n++}`);
  dbs.push(db);
  return db;
}

async function logWeight(db: TrainingDB, userId: string, date: string, weight: number): Promise<BodyweightRow> {
  const row: BodyweightRow = { ...baseRow(userId, await deterministicId(userId, date)), date, weight };
  await saveRow(db, 'bodyweights', row);
  return row;
}

let server: FakeServer;
let phone: TrainingDB;
let remote: FakeRemote;

beforeEach(() => {
  server = new FakeServer();
  phone = device();
  remote = new FakeRemote(server, ALICE);
});

afterEach(async () => {
  await Promise.all(dbs.map((d) => d.delete()));
  dbs = [];
});

describe('writes and the outbox', () => {
  it('every save lands in IndexedDB and the outbox together', async () => {
    const row = await logWeight(phone, ALICE, '2026-09-27', 88.4);
    expect(await phone.bodyweights.get(row.id)).toMatchObject({ weight: 88.4 });
    expect(await pendingCount(phone)).toBe(1);
  });

  it('push sends the row, clears the outbox and adopts the server timestamp', async () => {
    const row = await logWeight(phone, ALICE, '2026-09-27', 88.4);
    await push(phone, remote);
    expect(await pendingCount(phone)).toBe(0);
    const serverRow = server.table('bodyweights').get(row.id)!;
    expect(serverRow).toMatchObject({ weight: 88.4, user_id: ALICE });
    expect((await phone.bodyweights.get(row.id))!.updated_at).toBe(serverRow.updated_at);
  });

  it('collapses many edits of one row into one upsert', async () => {
    const row = await logWeight(phone, ALICE, '2026-09-27', 88);
    await updateRow(phone, 'bodyweights', row.id, { weight: 88.2 });
    await updateRow(phone, 'bodyweights', row.id, { weight: 88.3 });
    expect(await pendingCount(phone)).toBe(3);
    await push(phone, remote);
    expect(remote.upsertCalls).toBe(1);
    expect(server.table('bodyweights').get(row.id)!).toMatchObject({ weight: 88.3 });
  });

  it('only sends known server columns', async () => {
    const row = await logWeight(phone, ALICE, '2026-09-27', 88);
    await phone.bodyweights.update(row.id, { localOnly: 'x' } as never);
    await push(phone, remote);
    expect(server.table('bodyweights').get(row.id)).not.toHaveProperty('localOnly');
  });
});

describe('offline (airplane mode)', () => {
  it('keeps changes queued while offline and syncs them after reconnecting', async () => {
    remote.offline = true;
    const row = await logWeight(phone, ALICE, '2026-09-27', 87.9);
    await expect(syncOnce(phone, remote)).rejects.toThrow('Failed to fetch');
    expect(await pendingCount(phone)).toBe(1);
    expect(await phone.bodyweights.get(row.id)).toMatchObject({ weight: 87.9 });

    remote.offline = false;
    await syncOnce(phone, remote);
    expect(await pendingCount(phone)).toBe(0);
    expect(server.table('bodyweights').get(row.id)).toMatchObject({ weight: 87.9 });
  });

  it('a failure part-way keeps the unsent rows queued', async () => {
    await logWeight(phone, ALICE, '2026-09-26', 88);
    const profileish = { ...baseRow(ALICE), display_name: 'A', timezone: 'Europe/Stockholm', track_bodyweight: true, bw_goal_kg: null };
    await saveRow(phone, 'profiles', profileish);
    let calls = 0;
    remote.beforeUpsert = async () => {
      if (++calls === 2) throw new TypeError('Failed to fetch');
    };
    await expect(push(phone, remote)).rejects.toThrow();
    const left = await phone.outbox.toArray();
    expect(left.map((e) => e.table)).toEqual(['profiles']);
  });
});

describe('edits during a push', () => {
  it('an edit made while the request is in flight is not lost', async () => {
    const row = await logWeight(phone, ALICE, '2026-09-27', 88);
    remote.beforeUpsert = async () => {
      remote.beforeUpsert = null;
      await updateRow(phone, 'bodyweights', row.id, { weight: 87.5 });
    };
    await push(phone, remote);
    // The in-flight request carried 88; the later edit is still queued…
    expect(await pendingCount(phone)).toBe(1);
    expect((await phone.bodyweights.get(row.id))!.weight).toBe(87.5);
    // …and goes out on the next push.
    await push(phone, remote);
    expect(server.table('bodyweights').get(row.id)!.weight).toBe(87.5);
  });
});

describe('pull', () => {
  it('a second device sees everything after logging in', async () => {
    await logWeight(phone, ALICE, '2026-09-26', 88.5);
    await logWeight(phone, ALICE, '2026-09-27', 88.1);
    await syncOnce(phone, remote);

    const laptop = device();
    await syncOnce(laptop, new FakeRemote(server, ALICE));
    const rows = await laptop.bodyweights.orderBy('date').toArray();
    expect(rows.map((r) => r.weight)).toEqual([88.5, 88.1]);
  });

  it('clearing site data and syncing again restores everything', async () => {
    for (let d = 1; d <= 20; d++) await logWeight(phone, ALICE, `2026-09-${String(d).padStart(2, '0')}`, 90 - d / 10);
    await syncOnce(phone, remote);

    await clearLocalData(phone);
    expect(await phone.bodyweights.count()).toBe(0);
    await syncOnce(phone, remote);
    expect(await phone.bodyweights.count()).toBe(20);
  });

  it('does not overwrite a local change that has not been pushed yet', async () => {
    const row = await logWeight(phone, ALICE, '2026-09-27', 88);
    await syncOnce(phone, remote);

    // Another device changes it on the server…
    const laptop = device();
    const laptopRemote = new FakeRemote(server, ALICE);
    await syncOnce(laptop, laptopRemote);
    await updateRow(laptop, 'bodyweights', row.id, { weight: 90 });
    await push(laptop, laptopRemote);

    // …while the phone has a newer, unsynced edit.
    await updateRow(phone, 'bodyweights', row.id, { weight: 87 });
    await pull(phone, remote);
    expect((await phone.bodyweights.get(row.id))!.weight).toBe(87);

    // The phone's edit is the most recent write, so it wins everywhere.
    await syncOnce(phone, remote);
    await syncOnce(laptop, laptopRemote);
    expect((await laptop.bodyweights.get(row.id))!.weight).toBe(87);
  });

  it('pages through many rows written with the same server timestamp', async () => {
    const total = PULL_PAGE * 2 + 17;
    const rows = await Promise.all(
      Array.from({ length: total }, async (_, i) => {
        const date = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
        return { ...baseRow(ALICE, await deterministicId(ALICE, date)), date, weight: 80 };
      }),
    );
    server.sameStampPerRequest = true;
    await remote.upsert('bodyweights', rows);

    const fresh = device();
    await pull(fresh, remote);
    expect(await fresh.bodyweights.count()).toBe(total);
  });

  it('picks up rows changed after the last pull, and re-pulling is harmless', async () => {
    const laptop = device();
    const laptopRemote = new FakeRemote(server, ALICE);
    await logWeight(phone, ALICE, '2026-09-26', 88);
    await syncOnce(phone, remote);
    await syncOnce(laptop, laptopRemote);

    await logWeight(phone, ALICE, '2026-09-27', 87.5);
    await syncOnce(phone, remote);
    await syncOnce(laptop, laptopRemote);
    await syncOnce(laptop, laptopRemote);
    expect(await laptop.bodyweights.count()).toBe(2);
  });

  it('soft deletes propagate as deleted_at, never as removed rows', async () => {
    const row = await logWeight(phone, ALICE, '2026-09-27', 88);
    await syncOnce(phone, remote);
    await softDelete(phone, 'bodyweights', row.id);
    await syncOnce(phone, remote);

    const laptop = device();
    await syncOnce(laptop, new FakeRemote(server, ALICE));
    expect((await laptop.bodyweights.get(row.id))!.deleted_at).not.toBeNull();
    expect(server.table('bodyweights').has(row.id)).toBe(true);
  });

  it('only receives the signed-in user’s rows', async () => {
    await logWeight(phone, ALICE, '2026-09-27', 88);
    await syncOnce(phone, remote);

    const bobsPhone = device();
    await syncOnce(bobsPhone, new FakeRemote(server, BOB));
    expect(await bobsPhone.bodyweights.count()).toBe(0);
  });
});

describe('deterministic ids', () => {
  it('the same user and date give the same id on every device', async () => {
    const a = await deterministicId(ALICE, '2026-09-27');
    expect(a).toBe(await deterministicId(ALICE, '2026-09-27'));
    expect(a).not.toBe(await deterministicId(BOB, '2026-09-27'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('two offline devices logging the same day end up with one row', async () => {
    const laptop = device();
    const laptopRemote = new FakeRemote(server, ALICE);
    await logWeight(phone, ALICE, '2026-09-27', 88);
    await logWeight(laptop, ALICE, '2026-09-27', 88.2);
    await syncOnce(phone, remote);
    await syncOnce(laptop, laptopRemote);
    await syncOnce(phone, remote);
    expect(server.rows('bodyweights')).toHaveLength(1);
    expect(await phone.bodyweights.count()).toBe(1);
  });
});
