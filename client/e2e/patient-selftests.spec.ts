/**
 * Self-assessments answered the way a patient answers them, checked against
 * the stored score and what the result page shows.
 *
 * Phase 5 changed the scoring (PHQ-9 adds items 1–9 only; the addiction test
 * no longer adds its "which area?" picker and is banded on the share of
 * "yes"; the PTSD test skips its later sections when the patient says no) and
 * added crisis help on severe results or any self-harm answer. Until now one
 * browser test answered one questionnaire with its first option, so none of
 * that was seen in a browser.
 */
import { test, expect, Page } from '@playwright/test';
import { fixtures } from './fixtures';
import { closeDb, db, ObjectId } from './adminHelpers';

// Remove the results stored here: other specs read this patient's dashboard.
const startedAt = new Date();
test.afterAll(async () => {
  await (await db()).collection('mentalhealthassessments')
    .deleteMany({ userId: new ObjectId(fixtures().users.patientA.id), completedAt: { $gte: startedAt } });
  await closeDb();
});

/** Answers each question in turn by the label of its option. */
async function answer(page: Page, testId: string, labels: string[]) {
  await page.goto(`/mental-health/${testId}`);
  const start = page.getByRole('button', { name: /^(Start|Begin)/i }).first();
  if (await start.isVisible().catch(() => false)) await start.click();
  const saved = page.waitForResponse((r) => r.url().includes('/assessments') && r.request().method() === 'POST', { timeout: 30_000 });
  for (const label of labels) {
    const option = page.getByRole('button', { name: new RegExp(`^\\s*${label}\\s*$`, 'i') }).first();
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();
    await page.waitForTimeout(250);
  }
  const res = await saved;
  expect(res.status(), await res.text()).toBeLessThan(300);
  await expect(page).toHaveURL(/\/test-results\//, { timeout: 20_000 });
}

async function latest(testType: string) {
  const rows = await (await db()).collection('mentalhealthassessments')
    .find({ userId: new ObjectId(fixtures().users.patientA.id), testType })
    .sort({ completedAt: -1, _id: -1 }).limit(1).toArray();
  return rows[0];
}

const crisisCard = (page: Page) => page.getByRole('alert').filter({ has: page.locator('#crisis-title') });

const NOT = 'NOT AT ALL';
const SEVERAL = 'SEVERAL DAYS';
const NEARLY = 'NEARLY EVERY DAY';

test.describe('depression (PHQ-9)', () => {
  test('all "nearly every day": severe, scored out of 27, crisis help with Tele-MANAS', async ({ page }) => {
    await answer(page, 'depression', [...Array(9).fill(NEARLY), 'EXTREMELY DIFFICULT']);
    const stored = await latest('depression');
    expect(stored.scores).toMatchObject({ total: 27, severity: 'severe' });
    await expect(crisisCard(page)).toBeVisible();
    await expect(page.locator('a[href="tel:14416"]').first()).toBeVisible();
  });

  test('only the self-harm question answered: minimal total, crisis help still shown', async ({ page }) => {
    // Item 10 ("how difficult") is asked but never added: a total of 1, not 3.
    await answer(page, 'depression', [...Array(8).fill(NOT), SEVERAL, 'VERY DIFFICULT']);
    const stored = await latest('depression');
    expect(stored.scores).toMatchObject({ total: 1, severity: 'minimal' });
    await expect(crisisCard(page)).toBeVisible();
  });

  test('nothing troubling: minimal, and no crisis help', async ({ page }) => {
    await answer(page, 'depression', [...Array(9).fill(NOT), 'EXTREMELY DIFFICULT']);
    const stored = await latest('depression');
    expect(stored.scores).toMatchObject({ total: 0, severity: 'minimal' });
    await expect(page.getByText(/minimal/i).first()).toBeVisible();
    await expect(crisisCard(page)).toHaveCount(0);
  });
});

test.describe('addiction', () => {
  test('alcohol, "yes" to all five: severe — the area picker is not added to the score', async ({ page }) => {
    await answer(page, 'addiction', ['ALCOHOL', 'YES', 'YES', 'YES', 'YES', 'YES']);
    const stored = await latest('addiction');
    expect(stored.scores).toMatchObject({ total: 5, severity: 'severe', percentage: 100 });
    await expect(crisisCard(page)).toBeVisible();
  });

  test('another drug, one "yes" of three: mild, no crisis help', async ({ page }) => {
    // The picker's value (1) used to be added: this would have scored 2.
    await answer(page, 'addiction', ['ANOTHER DRUG OR MULTIPLE DRUGS', 'YES', 'NO', 'NO']);
    const stored = await latest('addiction');
    expect(stored.scores).toMatchObject({ total: 1, severity: 'mild' });
    expect(stored.responses).toHaveLength(4);
    await expect(crisisCard(page)).toHaveCount(0);
  });
});

test.describe('PTSD', () => {
  test('saying no to the later questions asks only about past experiences', async ({ page }) => {
    await answer(page, 'ptsd', ['NO', ...Array(8).fill('NO')]);
    const stored = await latest('ptsd');
    expect(stored.responses.map((r: { questionId: number }) => r.questionId).sort((a: number, b: number) => a - b))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(stored.scores.total).toBe(0);
  });
});
