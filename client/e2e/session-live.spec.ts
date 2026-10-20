import { test, expect, Browser, BrowserContext, Page, APIRequestContext } from '@playwright/test';
import { fixtures } from './fixtures';
import { apiSend, closeDb } from './adminHelpers';
import { createSession, runJob, signIn } from './sessionHelpers';

/**
 * Live updates (Phase 4): the other person's screen changes without a
 * reload when a session is cancelled, decided by the end-of-session sweep,
 * or when the therapist adds a task.
 */

test.afterAll(async () => { await closeDb(); });

async function party(browser: Browser, who: 'patientB' | 'doctorB'): Promise<{ context: BrowserContext; page: Page }> {
  const user = fixtures().users[who];
  const context = await browser.newContext();
  await signIn(context, user.email, user.password, who === 'doctorB' ? 'doctor' : 'patient');
  return { context, page: await context.newPage() };
}

/** Resolves when the page asks the API for `path` again (a refresh, not the first load). */
const refetch = (page: Page, path: RegExp) => page.waitForRequest((r) => path.test(r.url()) && r.method() === 'GET', { timeout: 15_000 });

test('the doctor cancels: the patient\'s dashboard is told and refreshes, without a reload', async ({ browser }) => {
  test.setTimeout(90_000);
  const { users } = fixtures();
  const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: 60 * 24 * 3 });
  const patient = await party(browser, 'patientB');
  const doctor = await party(browser, 'doctorB');
  await patient.page.goto('/patient-dashboard');
  await expect(patient.page.getByText('YOUR DASHBOARD')).toBeVisible({ timeout: 30_000 });

  const refreshed = refetch(patient.page, /\/sessions\/my-sessions/);
  const res = await apiSend(doctor.context.request as unknown as APIRequestContext, 'POST', `/sessions/${id}/cancel`, { reason: 'QA: unwell' });
  expect(res.status(), await res.text()).toBe(200);
  await refreshed;
  await expect(patient.page.getByText(/cancelled/i).first()).toBeVisible({ timeout: 10_000 });
  await patient.context.close();
  await doctor.context.close();
});

test('the end-of-session sweep decides an outcome: both dashboards refresh', async ({ browser }) => {
  test.setTimeout(90_000);
  const { users } = fixtures();
  // Ended 30 minutes ago, both attended: the sweep completes it.
  const startsAt = new Date(Date.now() - 50 * 60 * 1000);
  await createSession({
    patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -50,
    extra: {
      attendance: [
        { role: 'patient', joinedAt: startsAt, leftAt: new Date(startsAt.getTime() + 20 * 60 * 1000), source: 'socket' },
        { role: 'doctor', joinedAt: startsAt, leftAt: new Date(startsAt.getTime() + 20 * 60 * 1000), source: 'socket' },
      ],
      patientJoined: true, patientJoinedAt: startsAt, doctorJoined: true, doctorJoinedAt: startsAt,
    },
  });
  const patient = await party(browser, 'patientB');
  await patient.page.goto('/patient-dashboard');
  await expect(patient.page.getByText('YOUR DASHBOARD')).toBeVisible({ timeout: 30_000 });
  const refreshed = refetch(patient.page, /\/sessions\/(my-sessions|pending-feedback)/);
  await runJob('status-sweep');
  await refreshed;
  await patient.context.close();
});

test('the therapist adds a task: it appears on the patient\'s tasks page without a reload', async ({ browser }) => {
  test.setTimeout(90_000);
  const { users } = fixtures();
  const sessionId = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -30, status: 'completed' });
  const patient = await party(browser, 'patientB');
  const doctor = await party(browser, 'doctorB');
  await patient.page.goto('/pending-tasks');
  await expect(patient.page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });

  const title = `QA live task ${Date.now()}`;
  const res = await apiSend(doctor.context.request as unknown as APIRequestContext, 'POST', '/session-tools/tasks', {
    sessionId, patientId: users.patientB.id, title, description: 'Breathing, twice a day', dueDate: new Date(Date.now() + 3 * 86400000).toISOString(), priority: 'medium',
  });
  expect(res.status(), await res.text()).toBe(201);
  await expect(patient.page.getByText(title)).toBeVisible({ timeout: 15_000 });
  await patient.context.close();
  await doctor.context.close();
});
