import { test, expect, Browser, Page, BrowserContext } from '@playwright/test';
import { fixtures } from './fixtures';
import { closeDb, db, ObjectId } from './adminHelpers';
import { signIn } from './sessionHelpers';

/**
 * Fixes from the live audit of 2026-10-19, in a real browser: pages that
 * crashed, invented content, wrong labels, dead links.
 */

test.afterAll(async () => { await closeDb(); });

async function as(browser: Browser, who: 'patient' | 'doctor', width = 1440): Promise<{ context: BrowserContext; page: Page }> {
  const { users } = fixtures();
  const user = who === 'patient' ? users.patientB : users.doctorB;
  const context = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 } });
  await signIn(context, user.email, user.password, who);
  return { context, page: await context.newPage() };
}

test('the Reports page opens, straight from a link, without crashing', async ({ browser }) => {
  const patient = await as(browser, 'patient');
  await patient.page.goto('/reports');
  await expect(patient.page.getByRole('heading', { name: /Reports & Recommendation/ })).toBeVisible({ timeout: 20_000 });
  await expect(patient.page.getByText('Something went wrong')).toHaveCount(0);
  await patient.context.close();
});

test('the landing page shows no invented therapists, reviews or discounts', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // (The hero's app mock-up shows a sample therapist card — an illustration,
  // not a listing. The therapist section is what must be real.)
  const section = page.locator('section', { hasText: 'Meet Our Therapists' });
  for (const invented of ['Dr. Priya Sharma', 'Dr. Rohit Kumar', 'Dr. Anjali Nair']) {
    await expect(section.getByText(invented)).toHaveCount(0);
  }
  for (const invented of ['1,000+ verified reviews', 'FIRST15', 'Isha M.']) {
    await expect(page.getByText(invented)).toHaveCount(0);
  }
});

test('the footer has no links to nowhere', async ({ page }) => {
  await page.goto('/about');
  const dead = await page.locator('footer a').evaluateAll((as) =>
    as.filter((a) => !a.getAttribute('href') || a.getAttribute('href') === '#').map((a) => a.textContent));
  expect(dead).toEqual([]);
  await expect(page.locator('footer').getByRole('link', { name: 'Help Center' })).toHaveAttribute('href', '/faq');
});

test('a checkout that was never paid is not listed as a session', async ({ browser }) => {
  const { users } = fixtures();
  const sessions = (await db()).collection('sessions');
  const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const { insertedId } = await sessions.insertOne({
    patientId: new ObjectId(users.patientB.id), doctorId: new ObjectId(users.doctorB.id),
    startsAt, endsAt: new Date(startsAt.getTime() + 20 * 60 * 1000), sessionDate: startsAt, sessionTime: '05:00 PM',
    duration: 20, price: 800, status: 'cancelled', paymentStatus: 'failed', sessionType: 'regular', createdAt: new Date(), updatedAt: new Date()
  });
  try {
    const patient = await as(browser, 'patient');
    await patient.page.goto('/call-history');
    await expect(patient.page.getByRole('heading', { name: 'Call History', level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(patient.page.getByText('Cancelled — no refund', { exact: true })).toHaveCount(0);
    await patient.context.close();
  } finally {
    await sessions.deleteOne({ _id: insertedId });
  }
});

test('My Tests can filter every test the assessments page offers', async ({ browser }) => {
  const patient = await as(browser, 'patient');
  await patient.page.goto('/my-tests');
  for (const name of ['Depression', 'Anxiety', 'ADHD', 'PTSD', 'Bipolar', 'Gambling']) {
    await expect(patient.page.getByRole('button', { name, exact: true })).toBeVisible({ timeout: 20_000 });
  }
  await patient.context.close();
});

test('Settings does not call sent emails "coming soon"', async ({ browser }) => {
  const patient = await as(browser, 'patient', 390);
  await patient.page.goto('/settings');
  const row = patient.page.getByText('Email Notifications').locator('xpath=ancestor::div[2]');
  await expect(row).toContainText('On', { timeout: 20_000 });
  await expect(row).not.toContainText(/coming soon/i);
  await patient.context.close();
});

test('the dashboard screening grid shows four tiles', async ({ browser }) => {
  const patient = await as(browser, 'patient');
  await patient.page.goto('/patient-dashboard');
  const grid = patient.page.getByTestId('patient-screening-tiles');
  await expect(grid).toBeVisible({ timeout: 20_000 });
  expect(await grid.evaluate((el) => el.children.length)).toBe(4);
  await patient.context.close();
});
