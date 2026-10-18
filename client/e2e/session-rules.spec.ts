import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { fixtures } from './fixtures';
import { closeDb, db, ObjectId } from './adminHelpers';
import { createSession, readSession, runJob, signIn } from './sessionHelpers';

/**
 * The session rules on the real call screen (docs/SESSION_RULES.md): the
 * waiting patient's "Leave & full refund", the doctor told they may leave,
 * the patient who arrives after the therapist waited and left, the full
 * minutes kept when the doctor is late — and what the end-of-session sweep
 * makes of a session, as the patient then sees it.
 */

const MINUTE = 60 * 1000;

test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

test.beforeAll(async () => {
  const { users } = fixtures();
  await (await db()).collection('users').updateOne(
    { _id: new ObjectId(users.patientB.id) },
    { $set: { emergencyContact: { name: 'QA Contact', phone: '9876543210', relationship: 'Friend' } } },
  );
});

test.afterAll(async () => {
  await closeDb();
});

async function party(browser: Browser, who: 'patient' | 'doctor'): Promise<{ context: BrowserContext; page: Page }> {
  const { users } = fixtures();
  const user = who === 'patient' ? users.patientB : users.doctorB;
  const context = await browser.newContext();
  await signIn(context, user.email, user.password, who);
  return { context, page: await context.newPage() };
}

/** A session that started `minutesAgo`, with stays recorded before the page opens. */
async function session(minutesAgo: number, stays: Array<[role: 'patient' | 'doctor', from: number, to: number | null]> = []) {
  const { users } = fixtures();
  const startsAt = new Date(Date.now() - minutesAgo * MINUTE);
  const attendance = stays.map(([role, from, to]) => ({
    role,
    joinedAt: new Date(startsAt.getTime() + from * MINUTE),
    leftAt: to === null ? null : new Date(startsAt.getTime() + to * MINUTE),
    source: 'socket',
  }));
  const flags: Record<string, unknown> = {};
  for (const role of ['patient', 'doctor'] as const) {
    const first = attendance.find((a) => a.role === role);
    if (first) { flags[`${role}Joined`] = true; flags[`${role}JoinedAt`] = first.joinedAt; }
  }
  return createSession({
    patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -minutesAgo,
    extra: { ...(attendance.length ? { attendance } : {}), ...flags },
  });
}

test.describe('the session rules on the call screen', () => {
  test('a therapist who never came: after 10 minutes the patient can leave with a full refund', async ({ browser }) => {
    const id = await session(11);
    const patient = await party(browser, 'patient');
    await patient.page.goto(`/video-call/${id}`);

    const dialog = patient.page.getByRole('dialog', { name: "Your therapist hasn't joined yet" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText(/you'll still get your full 20 minutes/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Leave & get a full refund' }).click();

    await expect(patient.page).toHaveURL(/patient-dashboard/, { timeout: 15_000 });
    const after = await readSession(id);
    expect(after?.status).toBe('cancelled');
    expect(after?.outcome?.code).toBe('doctor_absent_refund');
    await patient.context.close();
  });

  test('keep waiting: the choice stays available, and nothing changes', async ({ browser }) => {
    const id = await session(11);
    const patient = await party(browser, 'patient');
    await patient.page.goto(`/video-call/${id}`);
    const dialog = patient.page.getByRole('dialog', { name: "Your therapist hasn't joined yet" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Keep waiting' }).click();

    await expect(patient.page.getByText("Your therapist still hasn't joined.")).toBeVisible();
    await expect(patient.page.getByRole('button', { name: 'Leave & get a full refund' })).toBeVisible();
    expect((await readSession(id))?.status).toBe('scheduled');
    await patient.context.close();
  });

  test('before the grace is over, the patient is told when the refund becomes available', async ({ browser }) => {
    const id = await session(2);
    const patient = await party(browser, 'patient');
    await patient.page.goto(`/video-call/${id}`);
    await expect(patient.page.getByText(/If your therapist hasn't joined by .+, you can leave with a full refund\./))
      .toBeVisible({ timeout: 30_000 });
    await expect(patient.page.getByRole('dialog', { name: "Your therapist hasn't joined yet" })).toHaveCount(0);
    await patient.context.close();
  });

  test('a patient who never came: the doctor may leave, and the session stands', async ({ browser }) => {
    const id = await session(11);
    const doctor = await party(browser, 'doctor');
    await doctor.page.goto(`/video-call/${id}`);
    await expect(doctor.page.getByText("Your patient hasn't joined")).toBeVisible({ timeout: 30_000 });
    await expect(doctor.page.getByText(/you'll still be paid for this session/)).toBeVisible();
    await doctor.page.getByRole('status').getByRole('button', { name: 'Leave' }).click();
    await expect(doctor.page).toHaveURL(/doctor-dashboard/, { timeout: 15_000 });
    expect((await readSession(id))?.status).toBe('scheduled');
    await doctor.context.close();
  });

  test('the therapist waited the grace out and left: the patient arriving now is told it counts as missed', async ({ browser }) => {
    const id = await session(15, [['doctor', 1, 11]]);
    const patient = await party(browser, 'patient');
    await patient.page.goto(`/video-call/${id}`);
    await expect(patient.page.getByText('This session counts as missed')).toBeVisible({ timeout: 30_000 });
    // …and is not offered a refund for waiting now.
    await expect(patient.page.getByRole('dialog', { name: "Your therapist hasn't joined yet" })).toHaveCount(0);
    await patient.context.close();
  });

  test('a doctor 5 minutes late: the patient keeps their full minutes, and is told so', async ({ browser }) => {
    const id = await session(5, [['patient', 0, null]]);
    const patient = await party(browser, 'patient');
    const doctor = await party(browser, 'doctor');
    await patient.page.goto(`/video-call/${id}`);
    await doctor.page.goto(`/video-call/${id}`);
    await expect(patient.page.getByText(/Your full 20 minutes are kept — ends at/)).toBeVisible({ timeout: 30_000 });
    // About 20 minutes on the clock, not 15.
    await expect(patient.page.getByText(/^(19|20):\d\d$/)).toBeVisible();
    await patient.context.close();
    await doctor.context.close();
  });

  test('Manage → Past Sessions: View Details and Rate Session open, and today\'s sessions are marked', async ({ browser }) => {
    const id = await session(40, [['patient', 0, 20], ['doctor', 0, 20]]);
    await runJob('status-sweep');
    expect((await readSession(id))?.status).toBe('completed');

    const patient = await party(browser, 'patient');
    await patient.page.goto('/patient-dashboard');
    // A fresh test account gets the welcome prompt, and a just-completed
    // session the rating prompt; put both off.
    // (They come one after another: welcome, rating, mood check-in.)
    for (const name of [/I'll do this later/i, /^do this later$/i, /^Close$/]) {
      const button = patient.page.getByRole('button', { name }).first();
      await button.waitFor({ state: 'visible', timeout: 6000 }).then(() => button.click()).catch(() => {});
    }
    await patient.page.getByRole('button', { name: 'Manage' }).first().click();
    await patient.page.getByRole('button', { name: 'Past Sessions' }).click();
    // The card of a completed, unrated session: it has both buttons.
    const card = patient.page.locator('div')
      .filter({ has: patient.page.getByRole('button', { name: 'Rate Session' }) })
      .filter({ has: patient.page.getByRole('button', { name: 'View Details' }) })
      .last();
    await card.getByRole('button', { name: 'View Details' }).click();
    // The session's own modal, with what became of it.
    await expect(patient.page.getByText('Completed').last()).toBeVisible({ timeout: 10_000 });
    // Opening the rating form from the session details used to crash the page.
    await patient.page.getByRole('button', { name: 'Rate Session' }).last().click();
    await expect(patient.page.getByText('Session Feedback')).toBeVisible();
    await expect(patient.page.getByText('Something went wrong')).toHaveCount(0);
    await patient.context.close();
  });

  test('the sweep decides a session the therapist never came to, and call history says so', async ({ browser }) => {
    const id = await session(40, [['patient', 0, 20]]);
    await runJob('status-sweep');
    const after = await readSession(id);
    expect(after?.status).toBe('no-show');
    expect(after?.outcome?.code).toBe('doctor_no_show');

    const patient = await party(browser, 'patient');
    await patient.page.goto('/call-history');
    await expect(patient.page.getByText(/Therapist didn't join — /).first()).toBeVisible({ timeout: 30_000 });
    await expect(patient.page.getByText('Cancelled & Refunded')).toHaveCount(0);
    await patient.context.close();
  });
});
