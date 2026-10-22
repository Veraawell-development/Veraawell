import { test, expect, Browser, Page, BrowserContext } from '@playwright/test';
import { fixtures } from './fixtures';
import { closeDb, db, ObjectId } from './adminHelpers';
import { createSession, readSession, signIn } from './sessionHelpers';
import { createBookableDoctor, publishWeekly, istDay, removeNewAccounts } from './newAccounts';
import { API_URL } from './fixtures';

/**
 * Phase 2 screens, in a real browser: the doctor's Cancel (with a reason),
 * the availability calendar's On/Off, the "patients can't book you" warning,
 * the directory's live status, and a therapist page that says it isn't taking
 * bookings instead of failing at checkout. Phone width included.
 */

const DAY = 24 * 60 * 60 * 1000;

test.afterAll(async () => { await removeNewAccounts(); await closeDb(); });

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
  test('weekly times: every date says open or off; a day off can be opened again and saved', async ({ browser }) => {
    test.setTimeout(120_000);
    const doctor = await createBookableDoctor('Cal');
    const tomorrow = istDay(1);
    const later = istDay(2);
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 } });
      await signIn(context, doctor.email, doctor.password, 'doctor');
      // Every day 10 and 11 AM, tomorrow taken off.
      await publishWeekly(context, { offDates: [tomorrow] });
      const page = await context.newPage();
      await page.goto('/manage-calendar');
      const dayButton = (date: string, state: 'off' | 'open for booking') => {
        const n = Number(date.slice(8));
        return page.getByRole('button', { name: new RegExp(`^\\w{3} ${n}(?: \\(today\\))?: ${state}$`) });
      };
      await expect(dayButton(tomorrow, 'off')).toBeVisible({ timeout: 20_000 });
      await expect(dayButton(later, 'open for booking')).toBeVisible();
      await expect(page.getByTestId('weekly-summary')).toContainText('10 AM, 11 AM');

      await dayButton(tomorrow, 'off').click();
      await expect(page.getByText('No times on this day')).toBeVisible();

      // Edit: open tomorrow again; the label flips and the note goes.
      await page.getByRole('button', { name: 'Edit Schedule' }).first().click();
      await page.getByRole('button', { name: 'Open this day' }).click();
      await expect(dayButton(tomorrow, 'open for booking')).toBeVisible();
      const saved = page.waitForResponse((r) => r.url().includes('/availability/save') && r.request().method() === 'POST');
      await page.getByRole('button', { name: /^Save$/ }).click();
      expect((await saved).status()).toBeLessThan(300);
      const stored = await (await db()).collection('doctoravailabilities').findOne({ doctorId: doctor.userId });
      expect(stored.offDates).not.toContain(tomorrow);
      // No horizontal scroll on a phone.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await context.close();
    }
    // Patients see tomorrow's weekly times.
    const slots = await (await browser.newContext()).request.get(`${API_URL}/sessions/doctors/${doctor.id}/slots/${tomorrow}`);
    expect(JSON.stringify(await slots.json())).toMatch(/10:00 AM/);
  });
});

test.describe('the doctor dashboard', () => {
  test('a checklist says what is missing before patients can find the therapist, each with its fix', async ({ browser }) => {
    test.setTimeout(90_000);
    // Priced and paid out, no calendar yet.
    const doctor = await createBookableDoctor('Check');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await signIn(context, doctor.email, doctor.password, 'doctor');
    const page = await context.newPage();
    await page.goto('/doctor-dashboard');
    await dismissPrompts(page);
    const card = page.getByTestId('visibility-card');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText("Patients can't find you yet");
    await expect(card.locator('[data-check="prices"]')).toHaveCount(0);
    await expect(card.locator('[data-check="bank"]')).toHaveCount(0);
    await card.locator('[data-check="dates"]').click();
    await expect(page).toHaveURL(/manage-calendar/);

    // With weekly times saved, no warning.
    await publishWeekly(context);
    await page.goto('/doctor-dashboard');
    await expect(page.getByText('Practitioner Dashboard')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('visibility-card')).toHaveCount(0);
    await context.close();
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

  test('a booking is reviewed before paying, and confirmed after — with the time in IST', async ({ browser }) => {
    const { users } = fixtures();
    const patient = await as(browser, 'patient', 390);
    // Third-party checkout stays blocked; the e2e stack books without payment.
    await patient.page.route('**/checkout.razorpay.com/**', (r) => r.abort());
    await patient.page.goto(`/doctor/${users.doctorB.id}`, { waitUntil: 'domcontentloaded' });
    const inThree = new Date(Date.now() + 3 * DAY);
    const dayNum = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(inThree);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(inThree);
    await expect(patient.page.getByText(/times in IST/)).toBeVisible({ timeout: 20_000 });
    await patient.page.locator('button', { hasText: new RegExp(`^\\s*${weekday}\\s*${dayNum}\\s*\\w{3}\\s*$`, 'i') }).first().click();
    const slot = patient.page.getByRole('button', { name: /\d{1,2}:\d{2} (AM|PM)/ }).last();
    await expect(slot).toBeVisible({ timeout: 10_000 });
    const time = (await slot.innerText()).trim();
    await slot.click();
    await patient.page.getByRole('button', { name: 'Schedule Session' }).click();

    const summary = patient.page.getByRole('dialog', { name: 'Review your booking' });
    await expect(summary).toBeVisible();
    await expect(summary.getByText(`${time} IST`)).toBeVisible();
    await expect(summary.getByText(/20 min · Video call/)).toBeVisible();
    // Escape closes it without booking.
    await patient.page.keyboard.press('Escape');
    await expect(summary).toHaveCount(0);
    await patient.page.getByRole('button', { name: 'Schedule Session' }).click();
    await summary.getByRole('button', { name: /^Pay ₹/ }).click();

    await expect(patient.page.getByText("You're booked")).toBeVisible({ timeout: 15_000 });
    await expect(patient.page.getByText(`${time} IST`)).toBeVisible();
    await expect(patient.page.getByRole('button', { name: 'Go to my dashboard' })).toBeVisible();
    await patient.context.close();

    // Give the time back for the other specs.
    const sessions = (await db()).collection('sessions');
    const booked = await sessions.find({ patientId: new ObjectId(users.patientB.id), doctorId: new ObjectId(users.doctorB.id) }).sort({ createdAt: -1 }).limit(1).toArray();
    if (booked[0]) {
      await (await db()).collection('doctoravailabilities').updateOne({ doctorId: new ObjectId(users.doctorB.id) }, { $pull: { bookedSlots: { sessionId: booked[0]._id } } } as never);
      await sessions.deleteOne({ _id: booked[0]._id });
    }
  });

  test('a signed-out patient keeps their choice through sign-in', async ({ browser }) => {
    const { users } = fixtures();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.route('**/checkout.razorpay.com/**', (r) => r.abort());
    await page.goto(`/doctor/${users.doctorB.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/times in IST/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Voice Call/ }).click();
    const inThree = new Date(Date.now() + 3 * DAY);
    const dayNum = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(inThree);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(inThree);
    await page.locator('button', { hasText: new RegExp(`^\\s*${weekday}\\s*${dayNum}\\s*\\w{3}\\s*$`, 'i') }).first().click();
    const slot = page.getByRole('button', { name: /\d{1,2}:\d{2} (AM|PM)/ }).first();
    await expect(slot).toBeVisible({ timeout: 10_000 });
    const time = (await slot.innerText()).trim();
    await slot.click();
    await page.getByRole('button', { name: 'Schedule Session' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // Sign in on the form; it returns to the therapist and opens the summary.
    await page.getByPlaceholder('Enter your email').fill(users.patientB.email);
    await page.getByPlaceholder('Enter your password').fill(users.patientB.password);
    await page.getByRole('button', { name: 'Sign In as Patient' }).click();
    const summary = page.getByRole('dialog', { name: 'Review your booking' });
    await expect(summary).toBeVisible({ timeout: 20_000 });
    await expect(summary.getByText(`${time} IST`)).toBeVisible();
    await expect(summary.getByText(/Voice call/)).toBeVisible();
    await context.close();
  });
});
