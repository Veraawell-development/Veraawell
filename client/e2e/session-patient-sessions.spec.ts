import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { fixtures } from './fixtures';
import { closeDb, db, ObjectId } from './adminHelpers';
import { createSession, readSession, signIn } from './sessionHelpers';

/**
 * Phase 5, the patient's own sessions: cancelling from "Manage" (what the
 * refund will be, and what the app says afterwards), a session already rated,
 * the session details on a phone, and "Book again".
 */

const HOUR = 60;

test.afterAll(async () => { await closeDb(); });

async function patient(browser: Browser, viewport?: { width: number; height: number }): Promise<{ context: BrowserContext; page: Page }> {
  const { users } = fixtures();
  const context = await browser.newContext(viewport ? { viewport } : {});
  await signIn(context, users.patientB.email, users.patientB.password, 'patient');
  return { context, page: await context.newPage() };
}

/** The dashboard, with the first-visit prompts put off. */
async function dashboard(page: Page) {
  await page.goto('/patient-dashboard');
  await expect(page.getByText('YOUR DASHBOARD')).toBeVisible({ timeout: 30_000 });
  for (const name of [/I'll do this later/i, /^do this later$/i, /^Close$/]) {
    const button = page.getByRole('button', { name }).first();
    await button.waitFor({ state: 'visible', timeout: 4000 }).then(() => button.click()).catch(() => {});
  }
}

async function openManage(page: Page) {
  await page.getByRole('button', { name: 'Manage' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Manage My Sessions' })).toBeVisible();
}

/** A session's card in the Manage list. */
const cardFor = (page: Page, sessionId: string) => page.locator(`[data-session-id="${sessionId}"]`);

test.describe('cancelling from Manage', () => {
  test('more than 4 hours out: the full refund is shown first, and the message says what happened', async ({ browser }) => {
    const { users } = fixtures();
    const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: 30 * HOUR, price: 1400 });
    const { context, page } = await patient(browser);
    await dashboard(page);
    await openManage(page);

    const card = cardFor(page, id);
    await card.getByRole('button', { name: 'Cancel' }).click();
    const confirm = page.getByRole('group', { name: 'Confirm cancellation' });
    await expect(confirm.getByText('₹1400')).toBeVisible();
    await expect(confirm.getByText(/100% refund/)).toBeVisible();
    await confirm.getByRole('button', { name: 'Yes, Cancel' }).click();

    // The server's answer, never "a refund if applicable".
    await expect(page.getByText(/^Session cancelled\./).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/if applicable/)).toHaveCount(0);
    await expect.poll(async () => (await readSession(id))?.status).toBe('cancelled');
    await context.close();
  });

  test('within 4 hours: "No refund" before confirming, and after', async ({ browser }) => {
    const { users } = fixtures();
    const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: 2 * HOUR });
    const { context, page } = await patient(browser);
    await dashboard(page);
    await openManage(page);

    const card = cardFor(page, id);
    await card.getByRole('button', { name: 'Cancel' }).click();
    const confirm = page.getByRole('group', { name: 'Confirm cancellation' });
    await expect(confirm.getByText(/No refund — within 4 hours/)).toBeVisible();
    await expect(confirm.getByText('₹0')).toBeVisible();
    await confirm.getByRole('button', { name: 'Yes, Cancel' }).click();
    await expect(page.getByText(/No refund — it was within 4 hours/).first()).toBeVisible({ timeout: 15_000 });
    expect((await readSession(id))?.lateCancellation).toBe(true);
    await context.close();
  });

  test('a session that has started has no Cancel button', async ({ browser }) => {
    const { users } = fixtures();
    const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -5 });
    const { context, page } = await patient(browser);
    await dashboard(page);
    await openManage(page);
    const card = cardFor(page, id);
    await expect(card.getByRole('button', { name: 'Join' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    await context.close();
  });
});

test.describe('a session already rated', () => {
  test('no "Rate Session" in Manage, and the details say it is rated', async ({ browser }) => {
    const { users } = fixtures();
    const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -3 * HOUR, status: 'completed' });
    await (await db()).collection('reviews').insertOne({
      sessionId: new ObjectId(id), patientId: new ObjectId(users.patientB.id), doctorId: new ObjectId(users.doctorB.id),
      rating: 5, feedback: '', reviewType: 'doctor', approvedForDisplay: true, isPublic: true,
      positives: '', improvements: '', wouldRecommend: true, createdAt: new Date(), updatedAt: new Date(),
    });
    const { context, page } = await patient(browser);
    await dashboard(page);
    await openManage(page);
    await page.getByRole('button', { name: 'Past Sessions' }).click();

    const card = cardFor(page, id);
    await expect(card.getByRole('button', { name: 'View Details' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Rate Session' })).toHaveCount(0);
    await card.getByRole('button', { name: 'View Details' }).click();
    const details = page.getByRole('dialog', { name: 'Session Details' });
    await expect(details.getByText(/You've rated this session/)).toBeVisible({ timeout: 10_000 });
    await expect(details.getByRole('button', { name: 'Rate Session' })).toHaveCount(0);

    // Escape closes the innermost dialog only: the details, not Manage.
    await page.keyboard.press('Escape');
    await expect(details).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Manage My Sessions' })).toBeVisible();
    await context.close();
  });

  test('the rating form says the review is public as "Verified patient", and a star-only rating sends no filler', async ({ browser }) => {
    const { users } = fixtures();
    const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -3 * HOUR, status: 'completed' });
    const { context, page } = await patient(browser);
    await dashboard(page);
    await openManage(page);
    await page.getByRole('button', { name: 'Past Sessions' }).click();
    await cardFor(page, id).getByRole('button', { name: 'Rate Session' }).click();

    const form = page.getByRole('dialog', { name: 'Session Feedback' });
    await expect(form.getByText(/shown publicly .* as “Verified patient”/)).toBeVisible({ timeout: 10_000 });
    await form.getByRole('button', { name: '4 stars' }).first().click();
    await form.getByRole('button', { name: 'Submit Feedback' }).click();
    await expect(page.getByRole('dialog', { name: 'Thank you' })).toBeVisible({ timeout: 10_000 });

    const review = await (await db()).collection('reviews').findOne({ sessionId: new ObjectId(id), reviewType: 'doctor' });
    expect(review?.rating).toBe(4);
    expect(review?.feedback).toBe('');
    await context.close();
  });
});

test.describe('on a phone (375 × 667)', () => {
  test('the session details fit the screen and scroll to their buttons', async ({ browser }) => {
    const { users } = fixtures();
    const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -3 * HOUR, status: 'completed' });
    const { context, page } = await patient(browser, { width: 375, height: 667 });
    await dashboard(page);
    await openManage(page);
    await page.getByRole('button', { name: 'Past Sessions' }).click();
    const card = cardFor(page, id);
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button', { name: 'View Details' }).click();

    const details = page.getByRole('dialog', { name: 'Session Details' });
    await expect(details).toBeVisible();
    // It used to be taller than the screen with no scroll, its buttons cut off.
    const box = await details.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(667);
    const rate = details.getByRole('button', { name: 'Rate Session' });
    await rate.scrollIntoViewIfNeeded();
    await expect(rate).toBeInViewport();
    await expect(details.getByRole('button', { name: 'Close session details' })).toBeVisible();
    // No sideways scroll.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.close();
  });
});

test.describe('My therapists', () => {
  test('"Book again" opens that therapist\'s page, not the directory', async ({ browser }) => {
    const { users } = fixtures();
    await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -5 * HOUR, status: 'completed' });
    const { context, page } = await patient(browser);
    await page.goto('/my-therapists');
    // Other specs give this patient sessions with doctorA too, and the list
    // order is theirs: the first card is one of the two, never the directory.
    await page.getByRole('button', { name: 'Book Again' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/doctor/(${users.doctorA.id}|${users.doctorB.id})$`));
    await context.close();
  });
});
