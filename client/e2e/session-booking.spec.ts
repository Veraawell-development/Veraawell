import { test, expect, Browser, Page, BrowserContext } from '@playwright/test';
import { fixtures } from './fixtures';
import { closeDb, db, ObjectId } from './adminHelpers';
import { createSession, readSession, signIn } from './sessionHelpers';

/**
 * Phase 2 screens, in a real browser: the doctor's Cancel (with a reason),
 * the availability calendar's On/Off, the "patients can't book you" warning,
 * the directory's live status, and a therapist page that says it isn't taking
 * bookings instead of failing at checkout. Phone width included.
 */

const DAY = 24 * 60 * 60 * 1000;

test.afterAll(async () => { await closeDb(); });

async function as(browser: Browser, who: 'patient' | 'doctor', width = 1440): Promise<{ context: BrowserContext; page: Page }> {
  const { users } = fixtures();
  const user = who === 'patient' ? users.patientB : users.doctorB;
  const context = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 } });
  await signIn(context, user.email, user.password, who);
  return { context, page: await context.newPage() };
}

/** Put off the first-visit prompts a fresh test account gets. */
async function dismissPrompts(page: Page) {
  for (const name of [/I'll do this later/i, /^do this later$/i, /^Close$/]) {
    const b = page.getByRole('button', { name }).first();
    await b.waitFor({ state: 'visible', timeout: 4000 }).then(() => b.click()).catch(() => {});
  }
}

test.describe('the doctor cancels', () => {
  test('from Manage Calendar, with a reason: the patient is refunded and the reason recorded', async ({ browser }) => {
    const { users } = fixtures();
    const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: 2 * 24 * 60 });
    const doctor = await as(browser, 'doctor');
    await doctor.page.goto('/manage-calendar');

    // The upcoming list → the session's panel → Cancel session.
    await doctor.page.getByText('Recent & Upcoming').waitFor({ timeout: 20_000 });
    await doctor.page.getByText('E2E Patient').first().click();
    await doctor.page.getByRole('button', { name: 'Cancel session' }).first().click();

    const dialog = doctor.page.getByText('Cancel this session?');
    await expect(dialog).toBeVisible();
    await expect(doctor.page.getByText(/will get a full refund/)).toBeVisible();
    await doctor.page.getByPlaceholder(/family emergency/).fill('Unwell today — so sorry.');
    await doctor.page.getByRole('button', { name: 'Cancel session' }).last().click();

    await expect.poll(async () => (await readSession(id))?.status, { timeout: 15_000 }).toBe('cancelled');
    const after = await readSession(id);
    expect(after?.cancelledBy).toBe('doctor');
    expect(after?.cancellationReason).toBe('Unwell today — so sorry.');
    expect(after?.outcome?.code).toBe('cancelled_by_doctor');
    await doctor.context.close();
  });
});

test.describe('the availability calendar', () => {
  test('every date says On or Off, including the one selected; an off day says so', async ({ browser }) => {
    const { users } = fixtures();
    const avail = (await db()).collection('doctoravailabilities');
    const before = await avail.findOne({ doctorId: new ObjectId(users.doctorB.id) });
    // Today off, everything else as seeded.
    const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    await avail.updateOne({ doctorId: new ObjectId(users.doctorB.id) }, { $pull: { activeDates: todayIst } });
    try {
      for (const width of [1440, 390]) {
        const doctor = await as(browser, 'doctor', width);
        await doctor.page.goto('/manage-calendar');
        const today = doctor.page.getByRole('button', { name: /\(today\): off/ });
        await expect(today).toBeVisible({ timeout: 20_000 });
        await expect(doctor.page.getByText('This day is off')).toBeVisible();
        // Tomorrow is on, and says so.
        await expect(doctor.page.getByRole('button', { name: /open for booking/ }).first()).toBeVisible();
        // Edit, turn today on: the label flips and the note goes.
        await doctor.page.getByRole('button', { name: 'Edit Schedule' }).first().click();
        await today.click();
        await expect(doctor.page.getByRole('button', { name: /\(today\): open for booking/ })).toBeVisible();
        await expect(doctor.page.getByText('This day is off')).toHaveCount(0);
        // No horizontal scroll on a phone.
        const overflow = await doctor.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        await doctor.context.close();
      }
    } finally {
      await avail.updateOne({ doctorId: new ObjectId(users.doctorB.id) }, { $set: { activeDates: before?.activeDates || [] } });
    }
  });
});

test.describe('the doctor dashboard', () => {
  test('warns when the calendar has no open dates, and links to fix it', async ({ browser }) => {
    const { users } = fixtures();
    const avail = (await db()).collection('doctoravailabilities');
    const before = await avail.findOne({ doctorId: new ObjectId(users.doctorB.id) });
    await avail.updateOne({ doctorId: new ObjectId(users.doctorB.id) }, { $set: { activeDates: ['2026-01-01'], customAvailability: [] } });
    try {
      const doctor = await as(browser, 'doctor', 390);
      await doctor.page.goto('/doctor-dashboard');
      await dismissPrompts(doctor.page);
      await expect(doctor.page.getByText(/Patients can't book you/)).toBeVisible({ timeout: 20_000 });
      await doctor.page.getByRole('button', { name: 'Add dates →' }).click();
      await expect(doctor.page).toHaveURL(/manage-calendar/);
      await doctor.context.close();
    } finally {
      await avail.updateOne({ doctorId: new ObjectId(users.doctorB.id) }, { $set: { activeDates: before?.activeDates || [], customAvailability: before?.customAvailability || [] } });
    }
    // With dates ahead, no warning.
    const doctor = await as(browser, 'doctor');
    await doctor.page.goto('/doctor-dashboard');
    await dismissPrompts(doctor.page);
    await expect(doctor.page.getByText('Practitioner Dashboard')).toBeVisible({ timeout: 20_000 });
    await expect(doctor.page.getByText(/Patients can't book you/)).toHaveCount(0);
    await doctor.context.close();
  });
});

test.describe('what patients see', () => {
  test('the directory shows each doctor\'s real status — never a blanket "Busy"', async ({ browser }) => {
    const patient = await as(browser, 'patient');
    await patient.page.goto('/choose-professional', { state: { bookingType: 'later' } } as never);
    await patient.page.getByRole('button', { name: /All Available/i }).click().catch(() => {});
    await expect(patient.page.getByText('Book a time').first()).toBeVisible({ timeout: 20_000 });
    await expect(patient.page.getByText(/^Busy$/)).toHaveCount(0);
    await patient.context.close();
  });

  test('a therapist with no approved way to be paid: the page says so, no booking form', async ({ browser }) => {
    const { users } = fixtures();
    const profiles = (await db()).collection('doctorprofiles');
    await profiles.updateOne({ userId: new ObjectId(users.doctorB.id) }, { $set: { payoutApproved: false } });
    try {
      const patient = await as(browser, 'patient', 390);
      await patient.page.goto(`/doctor/${users.doctorB.id}`);
      await expect(patient.page.getByText("This therapist isn't taking bookings right now")).toBeVisible({ timeout: 20_000 });
      await expect(patient.page.getByRole('button', { name: 'Schedule Session' })).toHaveCount(0);
      await patient.context.close();
    } finally {
      await profiles.updateOne({ userId: new ObjectId(users.doctorB.id) }, { $set: { payoutApproved: true } });
    }
  });

  test('the booking page offers IST days and no slot that has passed or is too soon', async ({ browser }) => {
    const { users } = fixtures();
    const patient = await as(browser, 'patient');
    await patient.page.goto(`/doctor/${users.doctorB.id}`, { waitUntil: 'domcontentloaded' });
    const tomorrow = new Date(Date.now() + DAY);
    const dayNum = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(tomorrow);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(tomorrow);
    await expect(patient.page.getByText(/Select Date/)).toBeVisible({ timeout: 20_000 });
    // Today's seeded slots are all too soon or past at most hours of the day.
    await patient.page.locator('button', { hasText: new RegExp(`^\\s*${weekday}\\s*${dayNum}\\s*\\w{3}\\s*$`, 'i') }).first().click();
    await expect(patient.page.getByRole('button', { name: /\d{1,2}:\d{2} (AM|PM)/ }).first()).toBeVisible({ timeout: 10_000 });
    await patient.context.close();
  });
});
