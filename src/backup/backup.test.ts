import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createDB, type TrainingDB } from '../db/db';
import { deterministicId } from '../db/ids';
import type { BodyweightRow, ExerciseRow } from '../db/types';
import { baseRow, saveRow, softDelete, updateRow } from '../db/write';
import { pendingCount, syncOnce } from '../sync/engine';
import { FakeRemote, FakeServer } from '../sync/fakeRemote';
import { exportBackup, importBackup } from './backup';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

let dbs: TrainingDB[] = [];
let n = 0;
function device(): TrainingDB {
  const db = createDB(`backup-test-${n++}`);
  dbs.push(db);
  return db;
}
afterEach(async () => {
  await Promise.all(dbs.map((d) => d.delete()));
  dbs = [];
});

async function seed(db: TrainingDB) {
  const rows: BodyweightRow[] = [];
  for (const [date, weight] of [['2026-09-25', 88.6], ['2026-09-26', 88.2], ['2026-09-27', 87.9]] as const) {
    const row = { ...baseRow(ALICE, await deterministicId(ALICE, date)), date, weight };
    await saveRow(db, 'bodyweights', row);
    rows.push(row);
  }
  const custom: ExerciseRow = {
    ...baseRow(ALICE),
    name: 'Sled push',
    category: 'custom',
    default_type: 'timed',
    default_increment: 0,
    is_barbell: false,
    is_global: false,
  };
  await saveRow(db, 'exercises', custom);
  return rows;
}

/** Round-trip through JSON like a real downloaded file. */
const asFile = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;

describe('backup', () => {
  it('importing the same backup twice creates no duplicates', async () => {
    const phone = device();
    await seed(phone);
    const file = asFile(await exportBackup(phone, ALICE));

    const fresh = device();
    const first = await importBackup(fresh, ALICE, file);
    const second = await importBackup(fresh, ALICE, file);
    expect(first).toEqual({ imported: 4, skipped: 0 });
    expect(second).toEqual({ imported: 0, skipped: 4 });
    expect(await fresh.bodyweights.count()).toBe(3);
    expect(await fresh.exercises.count()).toBe(1);
  });

  it('importing into the same device it came from changes nothing', async () => {
    const phone = device();
    await seed(phone);
    const before = await pendingCount(phone);
    const result = await importBackup(phone, ALICE, asFile(await exportBackup(phone, ALICE)));
    expect(result.imported).toBe(0);
    expect(await pendingCount(phone)).toBe(before);
  });

  it('no duplicates on the server either, even after syncing in between', async () => {
    const server = new FakeServer();
    const phone = device();
    await seed(phone);
    await syncOnce(phone, new FakeRemote(server, ALICE));
    const file = asFile(await exportBackup(phone, ALICE));

    const fresh = device();
    const remote = new FakeRemote(server, ALICE);
    await importBackup(fresh, ALICE, file);
    await syncOnce(fresh, remote);
    await importBackup(fresh, ALICE, file);
    await syncOnce(fresh, remote);
    expect(server.rows('bodyweights')).toHaveLength(3);
    expect(server.rows('exercises')).toHaveLength(1);
  });

  it('never overwrites newer local data with an older backup', async () => {
    const phone = device();
    const [, , today] = await seed(phone);
    const file = asFile(await exportBackup(phone, ALICE));
    await new Promise((r) => setTimeout(r, 5));
    await updateRow(phone, 'bodyweights', today!.id, { weight: 87.1 });
    await importBackup(phone, ALICE, file);
    expect((await phone.bodyweights.get(today!.id))!.weight).toBe(87.1);
  });

  it('keeps soft-deleted rows so they can still be restored', async () => {
    const phone = device();
    const [first] = await seed(phone);
    await softDelete(phone, 'bodyweights', first!.id);
    const fresh = device();
    await importBackup(fresh, ALICE, asFile(await exportBackup(phone, ALICE)));
    expect((await fresh.bodyweights.get(first!.id))!.deleted_at).not.toBeNull();
  });

  it('rejects files that are not backups and backups from another account', async () => {
    const phone = device();
    await seed(phone);
    await expect(importBackup(phone, ALICE, { hello: 'world' })).rejects.toThrow('not a Training Tracker backup');
    const file = asFile(await exportBackup(phone, ALICE));
    await expect(importBackup(device(), BOB, file)).rejects.toThrow('different account');
  });

  it('drops unknown columns so a bad file cannot break sync', async () => {
    const phone = device();
    await seed(phone);
    const file = (await exportBackup(phone, ALICE)) as unknown as { tables: { bodyweights: Record<string, unknown>[] } };
    file.tables.bodyweights[0]!.evil = 'x';
    const fresh = device();
    await importBackup(fresh, ALICE, asFile(file));
    const row = await fresh.bodyweights.get(file.tables.bodyweights[0]!.id as string);
    expect(row).not.toHaveProperty('evil');
  });
});
