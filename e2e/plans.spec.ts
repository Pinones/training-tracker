// Phase 3: both the StrongLifts hybrid template and a from-scratch plan can be created,
// saved, edited and activated, and they survive a reload and a second device.
import { expect, test, type Page } from '@playwright/test';
import { adminClient, createTestUser, deleteTestUser, type TestUser } from '../tests/integration/helpers';

const admin = adminClient();
let user: TestUser;
const SHOTS = process.env.SHOTS; // set to a folder to save screenshots of each step

test.beforeAll(async () => {
  user = await createTestUser(admin, 'e2e-plans');
});
test.afterAll(async () => {
  await deleteTestUser(admin, user);
});

// Surface browser-side errors in the test output.
test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[console.error]', m.text()));
});

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function logIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/today$/);
}

const allSaved = (page: Page) => expect(page.getByTestId('sync-indicator').first()).toHaveText('All saved ✓');
const next = (page: Page) => page.getByRole('button', { name: 'Next' }).click();

async function serverPlans() {
  const { data } = await admin.from('plans').select('id, name, status').eq('user_id', user.id).is('deleted_at', null);
  return data ?? [];
}

test.describe.serial('plan builder', () => {
  test('create the hybrid StrongLifts template, save and activate it', async ({ page }) => {
    await logIn(page);
    await shot(page, '01-today-empty');
    await page.getByTestId('choose-plan').click();
    await expect(page).toHaveURL(/\/plans\/new$/);
    await shot(page, '02-templates');
    await page.getByTestId('template-hybrid_stronglifts_running').click();

    // Basics (the draft already exists and autosaves)
    await expect(page.getByLabel('Plan name')).toHaveValue('Hybrid StrongLifts 5×5 + running');
    await page.getByLabel('Goal').fill('Squat 100 kg and run 5K');
    await shot(page, '03-basics');
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByLabel('Goal')).toHaveValue('Squat 100 kg and run 5K'); // draft survived a reload
    await next(page);

    // Workouts
    await expect(page.getByText('Squat 5×5 @ 20 kg').first()).toBeVisible();
    await expect(page.getByText('Deadlift 1×5 @ 40 kg')).toBeVisible();
    await shot(page, '04-workouts');
    await next(page);

    // Schedule
    await expect(page.getByLabel('Monday')).toHaveValue(/^r:/);
    await expect(page.getByText('5 sessions a week')).toBeVisible();
    await shot(page, '05-schedule');
    await next(page);

    // Reminders
    await page.getByLabel('Send reminders').check();
    await page.getByLabel('Time').fill('06:45');
    await shot(page, '06-reminders');
    await next(page);

    // Review
    await expect(page.getByText('Intervals: 10 min warm-up, 1 min hard / 2 min easy × 6–8, 5–10 min cool-down')).toBeVisible();
    await expect(page.getByText('Easy run 30 min')).toBeVisible();
    await expect(page.getByText('06:45 on Mon, Tue, Wed, Fri, Sat')).toBeVisible();
    await shot(page, '07-review');
    await page.getByTestId('save-plan').click();

    await expect(page).toHaveURL(/\/plans$/);
    await expect(page.getByText('Active')).toBeVisible();
    await expect(page.getByTestId('plan-card')).toContainText('Hybrid StrongLifts');
    await shot(page, '08-plans');
    await allSaved(page);
    expect(await serverPlans()).toEqual([expect.objectContaining({ status: 'active', name: 'Hybrid StrongLifts 5×5 + running' })]);

    await page.goto('/today');
    await expect(page.getByText('Active plan')).toBeVisible();
    await shot(page, '09-today-active');
  });

  test('edit the hybrid plan: change the squat start weight', async ({ page }) => {
    await logIn(page);
    await page.goto('/plans');
    await page.getByRole('button', { name: 'Edit' }).click();
    await next(page);
    await page.getByText('Squat 5×5 @ 20 kg').first().click();
    await page.getByLabel('Start weight (kg)').fill('42,5'); // Swedish decimal comma
    await shot(page, '10-item-editor');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Squat 5×5 @ 42.5 kg')).toBeVisible();
    await next(page);
    await next(page);
    await next(page);
    await page.getByTestId('save-plan').click();
    await expect(page).toHaveURL(/\/plans$/);
    await allSaved(page);

    const { data } = await admin.from('plan_items').select('config').eq('user_id', user.id).is('deleted_at', null);
    const weights = (data ?? []).map((r) => (r.config as { start_weight?: number }).start_weight).filter((w) => w !== undefined);
    expect(weights).toContain(42.5);
  });

  test('build a plan from scratch, with drag-to-reorder, and activate it', async ({ page }) => {
    await logIn(page);
    await page.goto('/plans/new');
    await page.getByTestId('template-scratch').click();
    await page.getByLabel('Plan name').fill('Home workouts');
    await next(page);

    await page.getByRole('button', { name: '+ Add workout' }).click();
    await page.getByLabel('Workout name').fill('Home A');
    await page.getByRole('button', { name: '+ Add exercise' }).click();
    await page.getByRole('button', { name: /^Push-ups/ }).click();
    await page.getByLabel('Reps', { exact: true }).fill('12');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: '+ Add exercise' }).click();
    await page.getByRole('button', { name: /^Run\b/ }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Push-ups 3×12')).toBeVisible();
    await expect(page.getByText('Run 30 min')).toBeVisible();

    // Drag "Run" above "Push-ups" using its handle.
    const handles = page.getByRole('button', { name: 'Drag to reorder' });
    const from = (await handles.nth(1).boundingBox())!;
    const to = (await handles.nth(0).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + 2, { steps: 12 });
    await page.mouse.move(from.x + from.width / 2, to.y - 4, { steps: 4 });
    await page.mouse.up();
    const rows = page.locator('li', { has: page.getByRole('button', { name: 'Drag to reorder' }) });
    await expect(rows.first()).toContainText('Run 30 min');
    await shot(page, '11-scratch-workouts');
    // dnd-kit swallows clicks for 50 ms after a drop (so the drop isn't treated as a tap);
    // a human can't click that fast, Playwright can.
    await page.waitForTimeout(150);
    await next(page);

    // A step with errors blocks Next: no training days yet.
    await expect(page.getByLabel('Monday')).toBeVisible();
    await next(page);
    await expect(page.getByText('Schedule at least one training day')).toBeVisible();
    await page.getByLabel('Monday').selectOption({ label: 'Home A' });
    await page.getByLabel('Thursday').selectOption({ label: 'Home A' });
    await next(page);
    await next(page);
    await expect(page.getByText('Run 30 min')).toBeVisible();
    await page.getByTestId('save-plan').click();

    await expect(page).toHaveURL(/\/plans$/);
    await allSaved(page);
    const plans = await serverPlans();
    expect(plans.find((p) => p.name === 'Home workouts')?.status).toBe('active');
    expect(plans.find((p) => p.name.startsWith('Hybrid'))?.status).toBe('archived');

    // Re-activate the hybrid plan.
    await page.getByRole('button', { name: 'Activate' }).click();
    await allSaved(page);
    await expect.poll(async () => (await serverPlans()).find((p) => p.name.startsWith('Hybrid'))?.status).toBe('active');
    expect((await serverPlans()).find((p) => p.name === 'Home workouts')?.status).toBe('archived');
  });

  test('plans survive a reload and appear on a second device', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await logIn(page);
    await page.goto('/plans');
    await expect(page.getByTestId('plan-card')).toHaveCount(2);
    await page.reload();
    await expect(page.getByTestId('plan-card').first()).toContainText('Hybrid StrongLifts');

    await page.getByRole('button', { name: 'Edit' }).first().click();
    await expect(page).toHaveURL(/\/plans\/[^/]+\/edit/);
    await page.goto(`${page.url().split('?')[0]}?step=4`);
    await expect(page.getByText('Squat 5×5 @ 42.5 kg')).toBeVisible();
    await expect(page.getByText('06:45 on Mon, Tue, Wed, Fri, Sat')).toBeVisible();
    await ctx.close();
  });
});
