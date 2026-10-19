import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { fixtures } from './fixtures';
import { closeDb, db, ObjectId } from './adminHelpers';
import { createSession, readSession, signIn } from './sessionHelpers';

/**
 * How a session ends, in two real browsers (patient and doctor) on the call
 * screen. docs/SESSION_RULES.md, D8: leaving never ends a session; ending
 * early takes both people; otherwise it ends when its time is up.
 */

const MINUTE = 60 * 1000;

test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

test.afterAll(async () => {
  await closeDb();
});

test.beforeAll(async () => {
  // The call screen asks a patient without an emergency contact for one first.
  const { users } = fixtures();
  await (await db()).collection('users').updateOne(
    { _id: new ObjectId(users.patientB.id) },
    { $set: { emergencyContact: { name: 'QA Contact', phone: '9876543210', relationship: 'Friend' } } },
  );
});

async function party(browser: Browser, who: 'patient' | 'doctor'): Promise<{ context: BrowserContext; page: Page }> {
  const { users } = fixtures();
  const user = who === 'patient' ? users.patientB : users.doctorB;
  const context = await browser.newContext();
  await signIn(context, user.email, user.password, who);
  return { context, page: await context.newPage() };
}

/** Both on the call screen, each seeing the other. */
async function bothInCall(browser: Browser, sessionId: string) {
  const patient = await party(browser, 'patient');
  const doctor = await party(browser, 'doctor');
  await patient.page.goto(`/video-call/${sessionId}`);
  await doctor.page.goto(`/video-call/${sessionId}`);
  for (const p of [patient.page, doctor.page]) {
    await expect(p.getByRole('button', { name: 'End session' })).toBeVisible({ timeout: 30_000 });
  }
  return { patient, doctor };
}

test.describe('ending a session', () => {
  test('leaving alone ends nothing, and the stay is recorded', async ({ browser }) => {
    const { users } = fixtures();
    const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -2 });
    const patient = await party(browser, 'patient');
    await patient.page.goto(`/video-call/${id}`);

    const leave = patient.page.getByRole('button', { name: 'Leave' }).last();
    await expect(leave).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await readSession(id))?.attendance?.length ?? 0, { timeout: 10_000 }).toBe(1);
    await leave.click();
    await expect(patient.page).toHaveURL(/patient-dashboard/, { timeout: 15_000 });

    await expect.poll(async () => (await readSession(id))?.attendance?.[0]?.leftAt ?? null, { timeout: 10_000 }).not.toBeNull();
    const after = await readSession(id);
    expect(after?.status).toBe('scheduled');
    expect(after?.patientJoined).toBe(true);
    await patient.context.close();
  });

  test('the patient asks, the doctor agrees: the session is completed and both leave', async ({ browser }) => {
    const { users } = fixtures();
    const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -1 });
    const { patient, doctor } = await bothInCall(browser, id);

    await patient.page.getByRole('button', { name: 'End session' }).click();
    await expect(patient.page.getByText(/Waiting for your therapist to agree/)).toBeVisible();
    await expect(doctor.page.getByText(/Your patient would like to end the session now/)).toBeVisible({ timeout: 10_000 });

    // Asking alone changed nothing yet.
    expect((await readSession(id))?.status).toBe('scheduled');

    await doctor.page.getByRole('dialog').getByRole('button', { name: 'End session' }).click();
    await expect(doctor.page).toHaveURL(/doctor-dashboard/, { timeout: 15_000 });
    await expect(patient.page).toHaveURL(/patient-dashboard/, { timeout: 15_000 });

    const after = await readSession(id);
    expect(after?.status).toBe('completed');
    expect(after?.outcome?.code).toBe('ended_by_consent');
    expect(after?.outcome?.by).toBe('doctor');
    await patient.context.close();
    await doctor.context.close();
  });

  test('a no keeps the call going', async ({ browser }) => {
    const { users } = fixtures();
    const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -1 });
    const { patient, doctor } = await bothInCall(browser, id);

    await doctor.page.getByRole('button', { name: 'End session' }).click();
    await expect(patient.page.getByText(/Your therapist would like to end the session now/)).toBeVisible({ timeout: 10_000 });
    await patient.page.getByRole('dialog').getByRole('button', { name: 'Keep going' }).click();
    await expect(doctor.page.getByText(/Your patient would like to continue/)).toBeVisible({ timeout: 10_000 });

    expect((await readSession(id))?.status).toBe('scheduled');
    await expect(doctor.page).toHaveURL(new RegExp(`/video-call/${id}`));
    await patient.context.close();
    await doctor.context.close();
  });

  test('the countdown is to the session’s end, and time up completes it for both', async ({ browser }) => {
    // It waits out a real ~25-second clock after two sign-ins — past the
    // default 30 s on a busy machine.
    test.setTimeout(90_000);
    const { users } = fixtures();
    // A 20-minute session ending in ~25 seconds, both having been in from the
    // start (a doctor joining only now would be late and move the end).
    const startsAt = new Date(Date.now() - 20 * MINUTE + 25_000);
    const id = await createSession({
      patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: (startsAt.getTime() - Date.now()) / MINUTE,
      extra: { doctorJoined: true, doctorJoinedAt: startsAt, patientJoined: true, patientJoinedAt: startsAt },
    });
    const { patient, doctor } = await bothInCall(browser, id);

    // Under half a minute left on the clock, not a fresh 20 minutes.
    await expect(patient.page.getByText(/^00:[0-2]\d$/)).toBeVisible({ timeout: 10_000 });

    await expect(patient.page).toHaveURL(/patient-dashboard/, { timeout: 60_000 });
    await expect(doctor.page).toHaveURL(/doctor-dashboard/, { timeout: 15_000 });
    expect((await readSession(id))?.status).toBe('completed');
    await patient.context.close();
    await doctor.context.close();
  });
});
