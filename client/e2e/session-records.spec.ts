/**
 * The therapist's records and money, from brand-new accounts.
 *
 * Phase 6 research found no browser test for any of this: writing a report
 * after a session (and choosing whether the patient sees it), the signature,
 * My Patients, payout history, changing a password, and notes typed during a
 * call. Each test makes its own therapist and patient (newAccounts.ts) and
 * removes them afterwards.
 */
import { test, expect, Browser, Page } from '@playwright/test';
import fs from 'fs';
import { closeDb, db, ObjectId, apiSend } from './adminHelpers';
import { createSession, signIn, enterCall } from './sessionHelpers';
import { createBookableDoctor, createNewPatient, removeNewAccounts } from './newAccounts';
import { API_URL } from './fixtures';

test.afterAll(async () => { await removeNewAccounts(); await closeDb(); });

async function asDoctor(browser: Browser, doctor: { email: string; password: string }, width = 1440) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width, height: width > 600 ? 900 : 844 } });
  await signIn(context, doctor.email, doctor.password, 'doctor');
  return { context, page: await context.newPage() };
}

async function asPatient(browser: Browser, patient: { email: string; password: string }) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await signIn(context, patient.email, patient.password, 'patient');
  return { context, page: await context.newPage() };
}

/** Steps through the post-session report form to the Submit screen. */
async function fillReport(page: Page, summary: string) {
  const dialogTitle = page.getByText('Step 1: Primary Assessment');
  await expect(dialogTitle).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Low$/i }).click();
  await page.locator('button:has(svg.w-10)').nth(3).click(); // 4 of 5 stars
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByPlaceholder('Write your clinical summary here...').fill(summary);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByPlaceholder('Actionable steps for the patient...').fill('Breathing exercise twice a day.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Ready to Submit?')).toBeVisible();
}

test.describe('reports after a session', () => {
  test('a report kept private: the therapist has it, the patient never sees it; progress reads out of 5', async ({ browser }) => {
    test.setTimeout(120_000);
    const doctor = await createBookableDoctor('Rep');
    const patient = await createNewPatient('Rep');
    await createSession({ patientId: patient.id, doctorId: doctor.id, startsInMinutes: -3 * 60, status: 'completed', extra: { doctorJoined: true, patientJoined: true } });

    const d = await asDoctor(browser, doctor);
    await d.page.goto('/doctor-reports');
    await expect(d.page.getByText('Reports to write')).toBeVisible({ timeout: 20_000 });
    await d.page.getByRole('button', { name: /Write/i }).first().click();
    await fillReport(d.page, 'Private working impression.');

    // No signature yet: said before filing, not discovered on the PDF.
    await expect(d.page.getByText(/haven't added a signature/)).toBeVisible();
    await d.page.getByRole('checkbox').uncheck();
    await expect(d.page.getByText('Only you will see this report.')).toBeVisible();
    await d.page.getByRole('button', { name: /Submit Report/ }).click();
    await expect(d.page.getByText('Report Finalized')).toBeVisible({ timeout: 15_000 });

    const stored = await (await db()).collection('reports').findOne({ doctorId: doctor.userId });
    expect(stored.isSharedWithPatient).toBe(false);
    expect(JSON.parse(stored.content).progress).toBe(4);
    // The title's date is IST dd/mm/yyyy, whatever the device's format.
    expect(stored.title).toMatch(/ - \d{2}\/\d{2}\/\d{4}$/);

    // The therapist's list marks it, and shows 4/5 — not 4/10.
    await d.page.goto(`/doctor-reports/${patient.id}`);
    await expect(d.page.getByText('Only you').first()).toBeVisible({ timeout: 20_000 });
    await expect(d.page.getByText('/5').first()).toBeVisible();
    await d.context.close();

    const p = await asPatient(browser, patient);
    await p.page.goto('/reports-recommendation');
    await expect(p.page.getByText(/No Reports Available/i)).toBeVisible({ timeout: 20_000 });
    await p.context.close();
  });

  test('with a saved signature there is no reminder; a shared report reaches the patient as a PDF', async ({ browser }) => {
    test.setTimeout(150_000);
    const doctor = await createBookableDoctor('Sig');
    const patient = await createNewPatient('Sig');
    await createSession({ patientId: patient.id, doctorId: doctor.id, startsInMinutes: -3 * 60, status: 'completed', extra: { doctorJoined: true, patientJoined: true } });

    const d = await asDoctor(browser, doctor);
    // Draw and save a signature in Settings → Signature.
    await d.page.goto('/doctor-settings#signature');
    const pad = d.page.locator('canvas').first();
    await expect(pad).toBeVisible({ timeout: 20_000 });
    const box = (await pad.boundingBox())!;
    await d.page.mouse.move(box.x + 20, box.y + box.height / 2);
    await d.page.mouse.down();
    for (let i = 1; i <= 12; i += 1) await d.page.mouse.move(box.x + 20 + i * 15, box.y + box.height / 2 + (i % 2 ? -18 : 18));
    await d.page.mouse.up();
    await d.page.getByRole('button', { name: 'Save signature' }).click();
    await expect(d.page.getByText('Signature saved')).toBeVisible();

    await d.page.goto('/doctor-reports');
    await d.page.getByRole('button', { name: /Write/i }).first().click();
    await fillReport(d.page, 'Shared summary for the patient.');
    await expect(d.page.getByText(/haven't added a signature/)).toHaveCount(0);
    await expect(d.page.getByRole('checkbox')).toBeChecked();
    await d.page.getByRole('button', { name: /Submit Report/ }).click();
    await expect(d.page.getByText('Report Finalized')).toBeVisible({ timeout: 15_000 });
    const stored = await (await db()).collection('reports').findOne({ doctorId: doctor.userId });
    expect(stored.isSharedWithPatient).toBe(true);
    expect(stored.doctorSignature).toMatch(/^data:image\/png/);

    // Filing again for the same session is refused, with the reason on screen.
    const again = await apiSend(d.context.request, 'POST', '/session-tools/reports', {
      sessionId: String(stored.sessionId), title: 'Again', reportType: 'progress', content: '{"progress":2}'
    });
    expect(again.status()).toBe(409);
    await d.context.close();

    const p = await asPatient(browser, patient);
    await p.page.goto('/reports-recommendation');
    const card = p.page.locator('div').filter({ hasText: doctor.lastName }).filter({ has: p.page.getByRole('button', { name: /Save/ }) }).last();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const downloading = p.page.waitForEvent('download');
    await card.getByRole('button', { name: /Save/ }).click();
    const bytes = fs.readFileSync((await (await downloading).path())!);
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    await p.context.close();
  });
});

test.describe('My Patients', () => {
  test('each patient with real counts; opening one shows their sessions and links to their records', async ({ browser }) => {
    test.setTimeout(90_000);
    const doctor = await createBookableDoctor('Pts');
    const patient = await createNewPatient('Pts');
    await createSession({ patientId: patient.id, doctorId: doctor.id, startsInMinutes: -2 * 24 * 60, status: 'completed', extra: { doctorJoined: true, patientJoined: true } });
    await createSession({ patientId: patient.id, doctorId: doctor.id, startsInMinutes: -24 * 60, status: 'cancelled', paymentStatus: 'paid', extra: { cancelledBy: 'patient', refundAmount: 1000 } });
    await createSession({ patientId: patient.id, doctorId: doctor.id, startsInMinutes: 3 * 24 * 60 });

    for (const width of [1440, 390]) {
      const d = await asDoctor(browser, doctor, width);
      await d.page.goto('/patient-details');
      const row = d.page.getByTestId('patient-row').filter({ hasText: patient.lastName });
      await expect(row).toBeVisible({ timeout: 20_000 });
      // One held (the cancelled one is not counted), one upcoming.
      await expect(row).toContainText('1 session held');
      await expect(row).toContainText('1 upcoming');
      await expect(row).not.toContainText(/Primary issue|Not specified/i);
      await row.getByRole('button', { expanded: false }).click();
      await expect(row.locator('li')).toHaveCount(3);
      await expect(row).toContainText('IST');
      if (width === 390) {
        expect(await d.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await row.getByRole('button', { name: 'Session notes' }).click();
      await expect(d.page).toHaveURL(new RegExp(`/doctor-session-notes/${patient.id}`));
      await d.context.close();
    }
  });
});

test.describe('money and account', () => {
  test('payout history lists what was paid and what is on its way', async ({ browser }) => {
    const doctor = await createBookableDoctor('Pay');
    const now = new Date();
    const week = (daysAgo: number) => {
      const start = new Date(now.getTime() - daysAgo * 864e5);
      return { periodStart: start, periodEnd: new Date(start.getTime() + 7 * 864e5), scheduledPayoutDate: new Date(start.getTime() + 8 * 864e5) };
    };
    await (await db()).collection('payouts').insertMany([
      { doctorId: doctor.userId, periodKey: `2026-W${Math.floor(Math.random() * 40) + 1}a`, ...week(21), status: 'paid', paidAt: new Date(now.getTime() - 12 * 864e5), transferReference: 'UTR12345', sessionCount: 3, grossEarnings: 2400, adjustmentsTotal: 0, netPayable: 2400, carriedForward: 0, createdAt: now, updatedAt: now },
      { doctorId: doctor.userId, periodKey: `2026-W${Math.floor(Math.random() * 40) + 1}b`, ...week(10), status: 'locked', sessionCount: 1, grossEarnings: 800, adjustmentsTotal: 0, netPayable: 800, carriedForward: 0, createdAt: now, updatedAt: now },
    ]);
    const d = await asDoctor(browser, doctor);
    await d.page.goto('/doctor-settings#earnings');
    await expect(d.page.getByText(/following Tuesday/)).toBeVisible({ timeout: 20_000 });
    const rows = d.page.getByTestId('payout-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'UTR12345' })).toContainText('₹2,400');
    await expect(rows.filter({ hasText: 'UTR12345' })).toContainText('Paid');
    await expect(rows.filter({ hasText: '₹800' })).toContainText('Processing');
    await d.context.close();
  });

  test('a therapist changes their password in Settings → Account', async ({ browser }) => {
    const doctor = await createBookableDoctor('Pw');
    const d = await asDoctor(browser, doctor);
    await d.page.goto('/doctor-settings#account');
    await d.page.getByLabel('Current password').fill(doctor.password);
    await d.page.getByLabel('New password', { exact: true }).fill('BrandNew123!');
    await d.page.getByLabel('Confirm new password').fill('BrandNew124!');
    await d.page.getByRole('button', { name: 'Change password' }).click();
    await expect(d.page.getByText('The new passwords do not match.')).toBeVisible();
    await d.page.getByLabel('Confirm new password').fill('BrandNew123!');
    await d.page.getByRole('button', { name: 'Change password' }).click();
    await expect(d.page.getByText(/Password changed/)).toBeVisible();
    await d.context.close();

    const fresh = await browser.newContext();
    const oldTry = await fresh.request.post(`${API_URL}/auth/login`, { data: { username: doctor.email, password: doctor.password, role: 'doctor' } });
    expect(oldTry.status()).toBeGreaterThanOrEqual(400);
    const newTry = await fresh.request.post(`${API_URL}/auth/login`, { data: { username: doctor.email, password: 'BrandNew123!', role: 'doctor' } });
    expect(newTry.status()).toBe(200);
    await fresh.close();
  });
});

test.describe('notes typed during a call', () => {
  test('survive a refresh until saved, and are stored as the therapist\'s private note', async ({ browser }) => {
    test.setTimeout(120_000);
    const doctor = await createBookableDoctor('Note');
    const patient = await createNewPatient('Note');
    const id = await createSession({ patientId: patient.id, doctorId: doctor.id, startsInMinutes: -1 });
    const d = await asDoctor(browser, doctor);
    await enterCall(d.page, id);
    await d.page.getByTitle('Session Tools').click();
    const note = d.page.getByPlaceholder('Session observations...');
    await note.fill('Talked about sleep; wants to try a diary.');

    // A refresh: the page and the call are rebuilt from scratch.
    await enterCall(d.page, id);
    await d.page.getByTitle('Session Tools').click();
    await expect(d.page.getByPlaceholder('Session observations...')).toHaveValue('Talked about sleep; wants to try a diary.');

    await d.page.getByRole('button', { name: /^Save/ }).click();
    await expect(d.page.getByText(/notes saved/i)).toBeVisible();
    await expect(d.page.getByPlaceholder('Session observations...')).toHaveValue('');
    const stored = await (await db()).collection('sessionnotes').findOne({ sessionId: new ObjectId(id) });
    expect(stored.isPrivate).toBe(true);
    expect(await d.page.evaluate((k) => sessionStorage.getItem(k), `vw:session-tools:${id}`)).toBeNull();
    await d.context.close();
  });
});
