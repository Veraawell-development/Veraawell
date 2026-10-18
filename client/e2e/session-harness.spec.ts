import { test, expect } from '@playwright/test';
import { fixtures, mailSink, API_URL } from './fixtures';
import { closeDb } from './adminHelpers';
import { createSession, readSession, runJob, signIn } from './sessionHelpers';

/**
 * Proves the session test harness itself: sessions can be placed at any
 * moment, the stack's time-driven jobs run on demand with an injected clock,
 * and a browser context can be signed in as a party to the session. The
 * session-rules specs build on exactly these three things.
 */

const MINUTE = 60 * 1000;

test.afterAll(async () => {
  await closeDb();
});

test.describe('session harness', () => {
  test('a session placed in the past is swept by the status job', async () => {
    const { users } = fixtures();
    const id = await createSession({
      patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -60, duration: 20,
    });

    const swept = await runJob('status-sweep');
    expect(swept).toBeGreaterThanOrEqual(1);
    expect((await readSession(id))?.status).toBe('no-show');
  });

  test('the job runs with the clock the test chooses', async () => {
    const { users } = fixtures();
    const id = await createSession({
      patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: 30, duration: 20,
    });

    // Real time: the session hasn't even started, so nothing happens to it.
    await runJob('status-sweep');
    expect((await readSession(id))?.status).toBe('scheduled');

    // An hour and a half from now it has long ended.
    await runJob('status-sweep', new Date(Date.now() + 90 * MINUTE));
    expect((await readSession(id))?.status).toBe('no-show');
  });

  test('the reminder job mails the patient 15 minutes before the start', async () => {
    const { users } = fixtures();
    const id = await createSession({
      patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: 15, duration: 20,
    });

    await runJob('reminders');
    await expect.poll(() => mailSink().some((e) =>
      e.fn === 'sendSessionReminderEmail'
      && String(e.args?.[0]).toLowerCase() === users.patientB.email.toLowerCase()
      && JSON.stringify(e.args?.[1] ?? '').includes(id)
    ), { timeout: 10_000 }).toBe(true);
    expect((await readSession(id))?.notificationStatus?.reminderSent).toBe(true);
  });

  test('a signed-in party can read the session; an unknown job is refused', async ({ browser }) => {
    const { users } = fixtures();
    const id = await createSession({
      patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: 60, duration: 20,
    });

    const context = await browser.newContext();
    await signIn(context, users.patientB.email, users.patientB.password, 'patient');
    const res = await context.request.get(`${API_URL}/sessions/${id}`);
    expect(res.status()).toBe(200);
    await context.close();

    const unknown = await fetch(`${fixtures().controlUrl}/jobs/no-such-job`, { method: 'POST' });
    expect(unknown.status).toBe(404);
  });
});
