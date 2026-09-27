// Offline and sync scenarios from plan.md phase 2, against the real Supabase project.
import { expect, test, type Page } from '@playwright/test';
import { adminClient, createTestUser, deleteTestUser, type TestUser } from '../tests/integration/helpers';

const admin = adminClient();
let user: TestUser;

test.beforeAll(async () => {
  user = await createTestUser(admin, 'e2e');
});
test.afterAll(async () => {
  await deleteTestUser(admin, user);
});

async function logIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId('sync-indicator')).toHaveText('All saved ✓');
}

async function logWeight(page: Page, kg: string) {
  await page.getByTestId('weight-input').fill(kg);
  await page.getByTestId('log-weight').click();
  await expect(page.getByText(`Logged ${kg} kg`)).toBeVisible();
}

async function serverWeights(): Promise<number[]> {
  const { data } = await admin.from('bodyweights').select('weight').eq('user_id', user.id).order('date');
  return (data ?? []).map((r) => Number(r.weight));
}

test.describe.serial('sync', () => {
  test('a weight logged in airplane mode syncs after reconnecting', async ({ page, context }) => {
    await logIn(page);
    await page.goto('/body');

    await context.setOffline(true);
    await logWeight(page, '88.4');
    await expect(page.getByTestId('sync-indicator')).toContainText('1 change waiting to sync');
    await expect(page.getByTestId('weight-row').first()).toContainText('88.4 kg');

    // Logging out with unsynced changes is blocked.
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByText(/haven’t synced yet|hasn’t synced yet/)).toBeVisible();
    await expect(page).toHaveURL(/\/settings/);
    expect(await serverWeights()).toEqual([]);

    await context.setOffline(false);
    await expect(page.getByTestId('sync-indicator')).toHaveText('All saved ✓');
    expect(await serverWeights()).toEqual([88.4]);
  });

  test('logging in on a second device shows all the data', async ({ browser }) => {
    const secondDevice = await browser.newContext();
    const page = await secondDevice.newPage();
    await logIn(page);
    await page.goto('/body');
    await expect(page.getByTestId('weight-row').first()).toContainText('88.4 kg');
    await secondDevice.close();
  });

  test('after clearing site data and logging in again, everything is restored', async ({ page }) => {
    await logIn(page);
    await page.goto('/body');
    await expect(page.getByTestId('weight-row').first()).toContainText('88.4 kg');

    // Wipe everything the browser stores for the site.
    await page.evaluate(async () => {
      localStorage.clear();
      sessionStorage.clear();
      const dbs = await indexedDB.databases();
      await Promise.all(
        dbs.map(
          (d) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(d.name!);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            }),
        ),
      );
    });
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);

    await logIn(page);
    await page.goto('/body');
    await expect(page.getByTestId('weight-row').first()).toContainText('88.4 kg');
  });
});
