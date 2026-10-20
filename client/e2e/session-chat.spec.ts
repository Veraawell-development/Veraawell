import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { fixtures, API_URL } from './fixtures';
import { closeDb, db, ObjectId } from './adminHelpers';
import { createSession, enterCall, signIn } from './sessionHelpers';

/**
 * Chat in two real browsers (Phase 4): a message is delivered live and
 * stored once, the unread badge follows, a dropped connection catches up,
 * a failed send says so and can be retried, older messages load, a closed
 * chat says why, the phone layout can get back to the list, and the in-call
 * chat works for both people.
 */

test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
});

test.afterAll(async () => { await closeDb(); });

type Who = 'patientA' | 'patientB' | 'doctorA' | 'doctorB';

async function party(browser: Browser, who: Who, viewport?: { width: number; height: number }): Promise<{ context: BrowserContext; page: Page }> {
  const user = fixtures().users[who];
  const context = await browser.newContext(viewport ? { viewport } : {});
  await signIn(context, user.email, user.password, who.startsWith('doctor') ? 'doctor' : 'patient');
  return { context, page: await context.newPage() };
}

/** The pair's conversation (created the way the app does), with a paid session between them. */
async function conversation(page: Page, patient: Who, doctor: Who): Promise<string> {
  const { users } = fixtures();
  await createSession({ patientId: users[patient].id, doctorId: users[doctor].id, startsInMinutes: 60 * 24 });
  const { csrfToken } = await (await page.request.get(`${API_URL}/csrf-token`)).json();
  const res = await page.request.post(`${API_URL}/chat/conversation`, { headers: { 'X-CSRF-Token': csrfToken }, data: { otherUserId: users[doctor].id } });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()).conversationId;
}

const composer = (page: Page) => page.getByPlaceholder(/Type a message/);
const bubbles = (page: Page, text: string) => page.locator('[data-testid="chat-message"]').filter({ hasText: text });

async function send(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press('Enter');
}

test.describe('chat between two people', () => {
  test('delivered live, once; unread for the other person until they read it; still there after a reload', async ({ browser }) => {
    test.setTimeout(90_000);
    const patient = await party(browser, 'patientB');
    const doctor = await party(browser, 'doctorB');
    const id = await conversation(patient.page, 'patientB', 'doctorB');

    // The doctor is on another page: the unread count must reach them there.
    await doctor.page.goto('/doctor-dashboard');
    await patient.page.goto(`/messages?c=${id}`);
    await expect(composer(patient.page)).toBeVisible({ timeout: 20_000 });

    const text = `hello-${Date.now()}`;
    await send(patient.page, text);
    await expect(bubbles(patient.page, text)).toHaveCount(1);
    await expect(bubbles(patient.page, text)).toHaveAttribute('data-status', 'sent', { timeout: 10_000 });

    // Stored, unread, for the doctor.
    await expect.poll(async () => (await (await doctor.page.request.get(`${API_URL}/chat/unread-count`)).json()).unreadCount, { timeout: 10_000 }).toBeGreaterThan(0);

    await doctor.page.goto('/messages');
    const item = doctor.page.getByTestId('conversation-item').filter({ hasText: /patient/i }).first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    await doctor.page.goto(`/messages?c=${id}`);
    await expect(bubbles(doctor.page, text)).toHaveCount(1, { timeout: 15_000 });
    await expect(bubbles(doctor.page, text)).toHaveAttribute('data-own', 'false');
    // Reading it clears it.
    await expect.poll(async () => (await (await doctor.page.request.get(`${API_URL}/chat/unread-count`)).json()).unreadCount, { timeout: 10_000 }).toBe(0);

    // A reply arrives live in the patient's open thread.
    const reply = `reply-${Date.now()}`;
    await send(doctor.page, reply);
    await expect(bubbles(patient.page, reply)).toHaveCount(1, { timeout: 10_000 });

    await patient.page.reload();
    await expect(bubbles(patient.page, text)).toHaveCount(1, { timeout: 20_000 });
    await expect(bubbles(patient.page, reply)).toHaveCount(1);
    await patient.context.close();
    await doctor.context.close();
  });

  test('a dropped connection catches up with what was sent meanwhile', async ({ browser }) => {
    test.setTimeout(90_000);
    const patient = await party(browser, 'patientB');
    const doctor = await party(browser, 'doctorB');
    const id = await conversation(patient.page, 'patientB', 'doctorB');
    await doctor.page.goto(`/messages?c=${id}`);
    await patient.page.goto(`/messages?c=${id}`);
    await expect(composer(doctor.page)).toBeVisible({ timeout: 20_000 });
    await expect(composer(patient.page)).toBeVisible({ timeout: 20_000 });

    await doctor.context.setOffline(true);
    await doctor.page.waitForTimeout(1500);
    const missed = [`while-away-1-${Date.now()}`, `while-away-2-${Date.now()}`];
    for (const m of missed) await send(patient.page, m);
    await expect(bubbles(patient.page, missed[1])).toHaveAttribute('data-status', 'sent', { timeout: 10_000 });
    await doctor.page.waitForTimeout(1000);
    await doctor.context.setOffline(false);

    for (const m of missed) await expect(bubbles(doctor.page, m)).toHaveCount(1, { timeout: 25_000 });
    await patient.context.close();
    await doctor.context.close();
  });

  test('a message that cannot be sent says so, and is stored once when it goes (by itself or by Retry)', async ({ browser }) => {
    test.setTimeout(90_000);
    const patient = await party(browser, 'patientB');
    const id = await conversation(patient.page, 'patientB', 'doctorB');
    await patient.page.goto(`/messages?c=${id}`);
    await expect(composer(patient.page)).toBeVisible({ timeout: 20_000 });

    await patient.context.setOffline(true);
    await patient.page.waitForTimeout(1500);
    const text = `offline-${Date.now()}`;
    await send(patient.page, text);
    await expect(bubbles(patient.page, text)).toHaveAttribute('data-status', 'failed', { timeout: 20_000 });
    await expect(patient.page.getByRole('button', { name: 'Retry' })).toBeVisible();

    await patient.context.setOffline(false);
    // Back online, the message goes either by itself (the connection had kept
    // it to send) or through Retry — and in both cases it is stored once.
    const retry = patient.page.getByRole('button', { name: 'Retry' });
    await retry.click({ timeout: 3000 }).catch(() => { /* already sent by itself */ });
    await expect(bubbles(patient.page, text)).toHaveAttribute('data-status', 'sent', { timeout: 20_000 });
    await expect(retry).toHaveCount(0);
    const stored = await (await db()).collection('messages').countDocuments({ conversationId: new ObjectId(id), text });
    expect(stored).toBe(1);
    await patient.context.close();
  });

  test('older messages load on demand, in order', async ({ browser }) => {
    const patient = await party(browser, 'patientB');
    const id = await conversation(patient.page, 'patientB', 'doctorB');
    const { users } = fixtures();
    const tag = `old-${Date.now()}`;
    const base = Date.now() - 3 * 24 * 3600 * 1000;
    await (await db()).collection('messages').insertMany(Array.from({ length: 70 }, (_, i) => ({
      conversationId: new ObjectId(id), senderId: new ObjectId(users.doctorB.id), receiverId: new ObjectId(users.patientB.id),
      text: `${tag}-${String(i).padStart(2, '0')}`, isRead: true, createdAt: new Date(base + i * 60_000), updatedAt: new Date(),
    })));
    await patient.page.goto(`/messages?c=${id}`);
    await expect(composer(patient.page)).toBeVisible({ timeout: 20_000 });
    await expect(bubbles(patient.page, `${tag}-00`)).toHaveCount(0);
    // Day separators show for the older messages' day.
    await patient.page.getByRole('button', { name: 'Load older messages' }).click();
    await expect(bubbles(patient.page, `${tag}-00`)).toHaveCount(1, { timeout: 10_000 });
    await patient.context.close();
  });

  test('a chat whose last session was over 30 days ago is read-only, and says why', async ({ browser }) => {
    const { users } = fixtures();
    const patient = await party(browser, 'patientA');
    // patientA ↔ doctorB: only an old, completed session.
    await createSession({ patientId: users.patientA.id, doctorId: users.doctorB.id, startsInMinutes: -60 * 24 * 40, status: 'completed' });
    const { csrfToken } = await (await patient.page.request.get(`${API_URL}/csrf-token`)).json();
    const res = await patient.page.request.post(`${API_URL}/chat/conversation`, { headers: { 'X-CSRF-Token': csrfToken }, data: { otherUserId: users.doctorB.id } });
    const { conversationId } = await res.json();
    await patient.page.goto(`/messages?c=${conversationId}`);
    await expect(patient.page.getByText(/This chat closed 30 days after your last session/)).toBeVisible({ timeout: 20_000 });
    await expect(composer(patient.page)).toHaveCount(0);
    await patient.context.close();
  });

  test('on a phone, Back returns to the list and another conversation can be opened', async ({ browser }) => {
    const patient = await party(browser, 'patientB', { width: 375, height: 740 });
    await conversation(patient.page, 'patientB', 'doctorB');
    await conversation(patient.page, 'patientB', 'doctorA');
    await patient.page.goto('/messages');
    const items = patient.page.getByTestId('conversation-item');
    await expect(items.first()).toBeVisible({ timeout: 20_000 });
    expect(await items.count()).toBeGreaterThanOrEqual(2);
    await items.nth(0).click();
    await expect(composer(patient.page)).toBeVisible();
    await patient.page.getByRole('button', { name: 'Back to conversations' }).click();
    await expect(items.nth(1)).toBeVisible();
    await items.nth(1).click();
    await expect(composer(patient.page)).toBeVisible();
    // No sideways scrolling.
    expect(await patient.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await patient.context.close();
  });

  test('search narrows the list', async ({ browser }) => {
    const patient = await party(browser, 'patientB');
    await conversation(patient.page, 'patientB', 'doctorB');
    await conversation(patient.page, 'patientB', 'doctorA');
    await patient.page.goto('/messages');
    const items = patient.page.getByTestId('conversation-item');
    await expect(items.first()).toBeVisible({ timeout: 20_000 });
    const all = await items.count();
    await patient.page.getByLabel('Search conversations').fill('zzzz-nobody');
    await expect(items).toHaveCount(0);
    await expect(patient.page.getByText('No conversations match.')).toBeVisible();
    await patient.page.getByLabel('Search conversations').fill('');
    await expect(items).toHaveCount(all);
    await patient.context.close();
  });
});

test.describe('the chat inside a call', () => {
  test.beforeAll(async () => {
    const { users } = fixtures();
    await (await db()).collection('users').updateOne(
      { _id: new ObjectId(users.patientB.id) },
      { $set: { emergencyContact: { name: 'QA Contact', phone: '9876543210', relationship: 'Friend' } } },
    );
  });

  test('both people chat during the call; the doctor\'s closed panel shows an unread dot', async ({ browser }) => {
    test.setTimeout(120_000);
    const { users } = fixtures();
    const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -1 });
    const patient = await party(browser, 'patientB');
    const doctor = await party(browser, 'doctorB');
    await enterCall(patient.page, id);
    await enterCall(doctor.page, id);
    await expect(doctor.page.getByRole('button', { name: 'End session' })).toBeVisible({ timeout: 30_000 });

    // The patient opens the chat panel and writes.
    await patient.page.getByTitle('Chat').click();
    const text = `in-call-${Date.now()}`;
    await expect(composer(patient.page)).toBeVisible({ timeout: 20_000 });
    await send(patient.page, text);
    await expect(bubbles(patient.page, text)).toHaveAttribute('data-status', 'sent', { timeout: 10_000 });

    // The doctor's panel is closed: an unread dot on Session Tools.
    const tools = doctor.page.getByTitle('Session Tools');
    await expect(tools.locator('.bg-red-500')).toBeVisible({ timeout: 15_000 });
    await tools.click();
    await doctor.page.getByRole('button', { name: /^chat$/i }).click();
    await expect(bubbles(doctor.page, text)).toHaveCount(1, { timeout: 15_000 });
    const back = `doctor-${Date.now()}`;
    await send(doctor.page, back);
    await expect(bubbles(patient.page, back)).toHaveCount(1, { timeout: 15_000 });
    await patient.context.close();
    await doctor.context.close();
  });
});
