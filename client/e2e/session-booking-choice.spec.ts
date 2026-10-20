/**
 * Booking with a therapist who is online: "Talk now" or "Book a time".
 *
 * Live on 2026-10-20 a patient who opened an online therapist could only
 * talk now — the page opened in instant mode with no way to book one of the
 * therapist's open times. Every booking spec used an offline therapist, so
 * nothing saw it. Here a fresh therapist goes online from their dashboard
 * (real presence, as in production), and a patient reaches them from each
 * entry point and switches between the two ways.
 */
import { test, expect, Browser, Page, BrowserContext } from '@playwright/test';
import { fixtures, API_URL } from './fixtures';
import { closeDb, db } from './adminHelpers';
import { signIn, createSession, readSession } from './sessionHelpers';
import { createBookableDoctor, publishDates, PRICES, removeNewAccounts } from './newAccounts';

const EMPTY = { cookies: [], origins: [] };
const DAY = 24 * 60 * 60 * 1000;

test.afterAll(async () => { await removeNewAccounts(); await closeDb(); });

async function dismissPrompts(page: Page) {
  for (const name of [/I'll do this later/i, /^do this later$/i, /^Close$/]) {
    const b = page.getByRole('button', { name }).first();
    await b.waitFor({ state: 'visible', timeout: 4000 }).then(() => b.click()).catch(() => {});
  }
}

/** A bookable therapist with dates, online from their own dashboard. */
async function onlineTherapist(browser: Browser) {
  const doctor = await createBookableDoctor('Choice');
  const context = await browser.newContext({ storageState: EMPTY });
  await signIn(context, doctor.email, doctor.password, 'doctor');
  await publishDates(context);
  const page = await context.newPage();
  await page.goto('/doctor-dashboard');
  await dismissPrompts(page);
  await page.getByRole('button', { name: 'Online', exact: true }).click();
  await expect.poll(async () => {
    const res = await context.request.get(`${API_URL}/doctor-status/online-doctors`);
    return JSON.stringify(await res.json()).includes(doctor.id);
  }, { timeout: 20_000 }).toBe(true);
  return { doctor, context, page };
}

async function patientContext(browser: Browser, width = 1440): Promise<{ context: BrowserContext; page: Page }> {
  const { patientB } = fixtures().users;
  const context = await browser.newContext({ storageState: EMPTY, viewport: { width, height: width > 600 ? 900 : 844 } });
  await signIn(context, patientB.email, patientB.password, 'patient');
  const page = await context.newPage();
  await page.route('**/checkout.razorpay.com/**', (r) => r.abort());
  return { context, page };
}

const choice = (page: Page) => page.getByRole('radiogroup', { name: 'When would you like your session?' });

async function pickDay(page: Page, daysAhead: number) {
  const day = new Date(Date.now() + daysAhead * DAY);
  const dayNum = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(day);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(day);
  await page.locator('button', { hasText: new RegExp(`^\\s*${weekday}\\s*${dayNum}\\s*\\w{3}\\s*$`, 'i') }).first().click();
}

test.describe('an online therapist can be booked now or for later', () => {
  test('from "Talk now": switch to "Book a time", pick a time, review and book it', async ({ browser }) => {
    test.setTimeout(120_000);
    const therapist = await onlineTherapist(browser);
    const patient = await patientContext(browser);

    await patient.page.goto('/choose-professional');
    await patient.page.getByRole('button', { name: 'Available Now' }).click();
    const card = patient.page.locator('div').filter({ hasText: therapist.doctor.lastName }).filter({ has: patient.page.getByRole('button', { name: /Talk now/ }) }).last();
    await card.getByRole('button', { name: /Talk now/ }).click();
    await expect(patient.page).toHaveURL(new RegExp(`/doctor/${therapist.doctor.id}`));

    // Opens on "Talk now", with "Book a time" right beside it.
    await expect(choice(patient.page)).toBeVisible({ timeout: 20_000 });
    await expect(choice(patient.page).getByRole('radio', { name: 'Talk now' })).toHaveAttribute('aria-checked', 'true');
    await expect(patient.page.getByRole('button', { name: 'Book Now' })).toBeVisible();

    await choice(patient.page).getByRole('radio', { name: 'Book a time' }).click();
    await expect(choice(patient.page).getByRole('radio', { name: 'Book a time' })).toHaveAttribute('aria-checked', 'true');
    await expect(patient.page.getByText(/times in IST/)).toBeVisible();
    await pickDay(patient.page, 3);
    const slot = patient.page.getByRole('button', { name: /\d{1,2}:\d{2} (AM|PM)/ }).first();
    await expect(slot).toBeVisible({ timeout: 10_000 });
    const time = (await slot.innerText()).trim();
    await slot.click();
    await patient.page.getByRole('button', { name: 'Schedule Session' }).click();

    const summary = patient.page.getByRole('dialog', { name: 'Review your booking' });
    await expect(summary).toBeVisible();
    await expect(summary.getByText(`${time} IST`)).toBeVisible();
    await expect(summary.getByRole('button', { name: `Pay ₹${PRICES.session20}` })).toBeVisible();
    await summary.getByRole('button', { name: /^Pay ₹/ }).click();
    await expect(patient.page.getByText("You're booked")).toBeVisible({ timeout: 15_000 });

    // A scheduled session — not an instant one — at the chosen time.
    const booked = await (await db()).collection('sessions')
      .find({ doctorId: therapist.doctor.userId }).sort({ createdAt: -1 }).limit(1).toArray();
    expect(booked[0]?.sessionType).not.toBe('immediate');
    expect(booked[0]?.sessionTime).toBe(time);

    await patient.context.close();
    await therapist.context.close();
  });

  test('from the "All" list: opens on "Book a time" and can switch to "Talk now"', async ({ browser }) => {
    test.setTimeout(120_000);
    const therapist = await onlineTherapist(browser);
    const patient = await patientContext(browser);

    await patient.page.goto(`/doctor/${therapist.doctor.id}`);
    await expect(choice(patient.page)).toBeVisible({ timeout: 20_000 });
    await expect(choice(patient.page).getByRole('radio', { name: 'Book a time' })).toHaveAttribute('aria-checked', 'true');
    await expect(patient.page.getByRole('button', { name: 'Schedule Session' })).toBeVisible();

    await choice(patient.page).getByRole('radio', { name: 'Talk now' }).click();
    await expect(patient.page.getByRole('button', { name: 'Book Now' })).toBeVisible();
    await expect(patient.page.getByText(/times in IST/)).toHaveCount(0);

    // The therapist goes offline: the choice disappears; a time can still be booked.
    await therapist.page.getByRole('button', { name: 'Offline', exact: true }).click();
    await patient.page.reload();
    await expect(patient.page.getByText(/times in IST/)).toBeVisible({ timeout: 20_000 });
    await expect(choice(patient.page)).toHaveCount(0);

    await patient.context.close();
    await therapist.context.close();
  });

  test('on a phone the choice fits and works', async ({ browser }) => {
    test.setTimeout(120_000);
    const therapist = await onlineTherapist(browser);
    const patient = await patientContext(browser, 390);

    await patient.page.goto(`/doctor/${therapist.doctor.id}`);
    await expect(choice(patient.page)).toBeVisible({ timeout: 20_000 });
    await choice(patient.page).getByRole('radio', { name: 'Talk now' }).click();
    await expect(patient.page.getByRole('button', { name: 'Book Now' })).toBeVisible();
    await choice(patient.page).getByRole('radio', { name: 'Book a time' }).click();
    await expect(patient.page.getByRole('button', { name: 'Schedule Session' })).toBeVisible();
    expect(await patient.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await patient.context.close();
    await therapist.context.close();
  });
});

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

test.describe('instant session, end to end in two browsers', () => {
  test('patient pays for "Talk now"; the therapist is rung, accepts, and both reach the call', async ({ browser }) => {
    test.setTimeout(150_000);
    const therapist = await onlineTherapist(browser);
    const patient = await patientContext(browser);

    await patient.page.goto('/choose-professional');
    await patient.page.getByRole('button', { name: 'Available Now' }).click();
    const card = patient.page.locator('div').filter({ hasText: therapist.doctor.lastName }).filter({ has: patient.page.getByRole('button', { name: /Talk now/ }) }).last();
    await card.getByRole('button', { name: /Talk now/ }).click();
    await expect(patient.page.getByRole('button', { name: 'Book Now' })).toBeVisible({ timeout: 20_000 });
    await patient.page.getByRole('button', { name: 'Book Now' }).click();
    const summary = patient.page.getByRole('dialog', { name: 'Review your booking' });
    await expect(summary).toBeVisible();
    await expect(summary.getByText(/Now — instant session/)).toBeVisible();
    await summary.getByRole('button', { name: `Pay ${inr(600)}` }).click();

    // The patient waits in the call room; the therapist is rung wherever they are.
    await expect(patient.page).toHaveURL(/\/video-call\//, { timeout: 20_000 });
    const sessionId = patient.page.url().split('/video-call/')[1].split(/[?#]/)[0];
    const accept = therapist.page.getByRole('button', { name: /Accept & Join/ });
    await expect(accept).toBeVisible({ timeout: 20_000 });
    await accept.click();
    await expect(therapist.page).toHaveURL(new RegExp(`/video-call/${sessionId}`), { timeout: 20_000 });

    const stored = await readSession(sessionId);
    expect(stored?.sessionType).toBe('immediate');
    // The e2e stack books without a gateway (stub payments): not_required.
    expect(['paid', 'not_required']).toContain(stored?.paymentStatus);
    expect(stored?.acceptanceStatus).toBe('accepted');
    expect(stored?.price).toBe(600);

    await patient.context.close();
    await therapist.context.close();
  });
});

test.describe('every option has its own price', () => {
  test('20/40/55 minutes by video and voice show the therapist\'s six prices, and the chosen one is charged', async ({ browser }) => {
    test.setTimeout(120_000);
    const doctor = await createBookableDoctor('Prices');
    const doc = await browser.newContext({ storageState: EMPTY });
    await signIn(doc, doctor.email, doctor.password, 'doctor');
    await publishDates(doc);
    await doc.close();
    const patient = await patientContext(browser);

    await patient.page.goto(`/doctor/${doctor.id}`);
    await expect(patient.page.getByText(/times in IST/)).toBeVisible({ timeout: 20_000 });
    const grid: Array<[RegExp, Record<number, number>]> = [
      [/Video Call/, { 20: PRICES.session20, 40: PRICES.session40, 55: PRICES.session55 }],
      [/Voice Call/, { 20: PRICES.audio.session20, 40: PRICES.audio.session40, 55: PRICES.audio.session55 }],
    ];
    for (const [mode, prices] of grid) {
      await patient.page.getByRole('button', { name: mode }).first().click();
      for (const minutes of [20, 40, 55]) {
        await expect(patient.page.getByRole('button', { name: new RegExp(`${minutes} Mins\\s*${inr(prices[minutes]).replace('₹', '₹\\s*')}`) })).toBeVisible();
      }
    }

    // Voice, 55 minutes: that price on the Pay button and on the stored session.
    await patient.page.getByRole('button', { name: /55 Mins/ }).click();
    await pickDay(patient.page, 4);
    const slot = patient.page.getByRole('button', { name: /\d{1,2}:\d{2} (AM|PM)/ }).first();
    await expect(slot).toBeVisible({ timeout: 10_000 });
    await slot.click();
    await patient.page.getByRole('button', { name: 'Schedule Session' }).click();
    const summary = patient.page.getByRole('dialog', { name: 'Review your booking' });
    await expect(summary.getByText(/55 min · Voice call/)).toBeVisible();
    await summary.getByRole('button', { name: `Pay ${inr(PRICES.audio.session55)}` }).click();
    await expect(patient.page.getByText("You're booked")).toBeVisible({ timeout: 15_000 });
    const booked = await (await db()).collection('sessions').find({ doctorId: doctor.userId }).sort({ createdAt: -1 }).limit(1).toArray();
    expect(booked[0]).toMatchObject({ duration: 55, callMode: 'Voice Calling', price: PRICES.audio.session55 });

    await patient.context.close();
  });
});

test.describe('a therapist who is in a session', () => {
  test('the directory says so and offers a time; their page has no "Talk now"', async ({ browser }) => {
    test.setTimeout(120_000);
    const therapist = await onlineTherapist(browser);
    await createSession({
      patientId: fixtures().users.patientA.id, doctorId: therapist.doctor.id, startsInMinutes: -2,
      sessionType: 'immediate', status: 'active',
    });
    const patient = await patientContext(browser);

    await patient.page.goto('/choose-professional');
    await patient.page.getByRole('button', { name: 'Available Now' }).click();
    const card = patient.page.locator('div').filter({ hasText: therapist.doctor.lastName }).filter({ has: patient.page.getByRole('button', { name: /Book a time/ }) }).last();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText(/In a session/i).first()).toBeVisible();
    await card.getByRole('button', { name: /Book a time/ }).click();

    await expect(patient.page.getByText(/times in IST/)).toBeVisible({ timeout: 20_000 });
    await expect(patient.page.getByRole('button', { name: 'Schedule Session' })).toBeVisible();
    await expect(choice(patient.page)).toHaveCount(0);
    await expect(patient.page.getByRole('button', { name: 'Book Now' })).toHaveCount(0);

    await patient.context.close();
    await therapist.context.close();
  });
});

