/**
 * The patient's session day and what comes after, on a clean account.
 *
 * A brand-new patient (no sessions left behind by other specs) and a brand-new
 * therapist, so what the dashboard shows is exactly what this spec created:
 *   - "Your session today": the start time, when joining opens, and a Join
 *     button only once it has — which then opens the call room.
 *   - A report the therapist shared: listed, readable, saved as a real PDF,
 *     and marked as seen. A task: opened and saved as a PDF too.
 */
import { test, expect, Browser, Page } from '@playwright/test';
import { closeDb, db, ObjectId } from './adminHelpers';
import { createSession, signIn } from './sessionHelpers';
import { createBookableDoctor, createNewPatient, removeNewAccounts } from './newAccounts';
import fs from 'fs';

const EMPTY = { cookies: [], origins: [] };

test.afterAll(async () => { await removeNewAccounts(); await closeDb(); });

async function dismissPrompts(page: Page) {
  for (const name of [/I'll do this later/i, /^do this later$/i, /^Close$/, /^Later$/i]) {
    const b = page.getByRole('button', { name }).first();
    await b.waitFor({ state: 'visible', timeout: 3000 }).then(() => b.click()).catch(() => {});
  }
}

async function freshPair(browser: Browser, width = 1440) {
  const doctor = await createBookableDoctor('DayOf');
  const patient = await createNewPatient('DayOf');
  const context = await browser.newContext({ storageState: EMPTY, viewport: { width, height: width > 600 ? 900 : 844 } });
  await signIn(context, patient.email, patient.password, 'patient');
  return { doctor, patient, context, page: await context.newPage() };
}

const banner = (page: Page) => page.getByRole('region', { name: 'Your session today' });

test.describe('"Your session today" on the dashboard', () => {
  test('before joining opens: the time and when to join, no Join button', async ({ browser }) => {
    const { doctor, patient, context, page } = await freshPair(browser);
    await createSession({ patientId: patient.id, doctorId: doctor.id, startsInMinutes: 60 });
    await page.goto('/patient-dashboard');
    await dismissPrompts(page);
    await expect(banner(page)).toBeVisible({ timeout: 20_000 });
    await expect(banner(page)).toContainText(doctor.lastName);
    await expect(banner(page)).toContainText(/You can join from .* IST/);
    await expect(banner(page).getByRole('button', { name: /Join session/ })).toHaveCount(0);
    await context.close();
  });

  test('once open: Join takes the patient into the call room — on a phone too', async ({ browser }) => {
    const { doctor, patient, context, page } = await freshPair(browser, 390);
    const id = await createSession({ patientId: patient.id, doctorId: doctor.id, startsInMinutes: 8 });
    await page.goto('/patient-dashboard');
    await dismissPrompts(page);
    await expect(banner(page)).toBeVisible({ timeout: 20_000 });
    await expect(banner(page)).toBeInViewport();
    const join = banner(page).getByRole('button', { name: /Join session/ }).or(banner(page).getByRole('link', { name: /Join session/ }));
    await expect(join).toBeVisible();
    await join.click();
    await expect(page).toHaveURL(new RegExp(`/video-call/${id}`), { timeout: 15_000 });
    await context.close();
  });

  test('no banner when the only session is days away', async ({ browser }) => {
    const { doctor, patient, context, page } = await freshPair(browser);
    await createSession({ patientId: patient.id, doctorId: doctor.id, startsInMinutes: 3 * 24 * 60 });
    await page.goto('/patient-dashboard');
    await dismissPrompts(page);
    await expect(page.getByText(/Upcoming|Up next/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(banner(page)).toHaveCount(0);
    await context.close();
  });
});

test.describe('a report the therapist shared', () => {
  test('is listed, opens, saves as a real PDF, and is marked seen', async ({ browser }) => {
    test.setTimeout(90_000);
    const { doctor, patient, context, page } = await freshPair(browser);
    const sessionId = await createSession({ patientId: patient.id, doctorId: doctor.id, startsInMinutes: -3 * 60, status: 'completed' });
    const title = `Care plan ${patient.lastName}`;
    // As PostSessionReportModal files it: the form as JSON in `content`.
    const reports = (await db()).collection('reports');
    const { insertedId } = await reports.insertOne({
      sessionId: new ObjectId(sessionId), patientId: patient.userId, doctorId: doctor.userId,
      reportType: 'treatment-plan', title,
      content: JSON.stringify({ mood: 'calm', progress: 6, observations: ['Sleeping better'], recommendations: 'Breathing exercise twice a day. Sleep diary for two weeks.' }),
      isSharedWithPatient: true, viewedByPatient: false,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await page.goto('/reports-recommendation');
    // Cards are headed by the therapist's name and the report type.
    const card = page.locator('div').filter({ hasText: doctor.lastName }).filter({ has: page.getByRole('button', { name: /Save/ }) }).last();
    await expect(card).toContainText('Treatment Plan');
    await expect(card).toBeVisible({ timeout: 20_000 });

    await card.getByRole('button', { name: /View/ }).click();
    await expect(page.getByText('Sleep diary for two weeks.').first()).toBeVisible();
    await page.keyboard.press('Escape');

    const downloading = page.waitForEvent('download');
    await card.getByRole('button', { name: /Save/ }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    const file = await download.path();
    const bytes = fs.readFileSync(file!);
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(1500);
    expect(bytes.length).toBeLessThan(120_000);

    await expect.poll(async () => (await reports.findOne({ _id: insertedId }))?.viewedByPatient, { timeout: 10_000 }).toBe(true);
    await context.close();
  });
});

test.describe('a task the therapist set', () => {
  test('opens from Pending Tasks and saves as a real PDF', async ({ browser }) => {
    test.setTimeout(90_000);
    const { doctor, patient, context, page } = await freshPair(browser);
    const sessionId = await createSession({ patientId: patient.id, doctorId: doctor.id, startsInMinutes: -3 * 60, status: 'completed' });
    const title = `Sleep diary ${patient.lastName}`;
    await (await db()).collection('tasks').insertOne({
      sessionId: new ObjectId(sessionId), doctorId: doctor.userId, patientId: patient.userId,
      title, description: 'Write down when you went to bed and when you woke, every morning for two weeks.',
      dueDate: new Date(Date.now() + 7 * 864e5), priority: 'high', status: 'pending',
      createdAt: new Date(), updatedAt: new Date(),
    });

    await page.goto('/pending-tasks');
    await page.getByRole('button', { name: `Open task: ${title}` }).first().click();
    await expect(page.getByText('every morning for two weeks').first()).toBeVisible();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^Task_.*\.pdf$/);
    const bytes = fs.readFileSync((await download.path())!);
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    // Compressed: the old uncompressed file was ~340 KB for one page.
    expect(bytes.length).toBeLessThan(120_000);
    await context.close();
  });
});

