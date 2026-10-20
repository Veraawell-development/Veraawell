import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { fixtures } from './fixtures';
import { closeDb, db, ObjectId } from './adminHelpers';
import { createSession, signIn, enterCall } from './sessionHelpers';

/**
 * A voice session must carry sound both ways. Voice mode has no <video>, and
 * the remote stream used to be attached to nothing — the call "connected"
 * and showed "Speaking…" while nobody heard anything.
 */

test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
});

test.afterAll(async () => { await closeDb(); });

test.beforeAll(async () => {
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

/** The audio element is playing a live remote audio track. */
async function hearsTheOtherSide(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const el = document.querySelector('[data-testid="remote-audio"]') as HTMLAudioElement | null;
    const stream = el?.srcObject as MediaStream | null;
    const live = stream?.getAudioTracks().filter((t) => t.readyState === 'live').length || 0;
    return { live, playing: !!el && !el.paused };
  }), { timeout: 30_000 }).toEqual({ live: 1, playing: true });
}

test('a voice session plays each person to the other, and never asks for the camera', async ({ browser }) => {
  const { users } = fixtures();
  const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -1, callMode: 'Voice Calling' });
  const patient = await party(browser, 'patient');
  const doctor = await party(browser, 'doctor');
  for (const p of [patient.page, doctor.page]) {
    await p.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      (window as any).__askedForVideo = false;
      navigator.mediaDevices.getUserMedia = (c?: MediaStreamConstraints) => {
        if (c && c.video) (window as any).__askedForVideo = true;
        return original(c);
      };
    });
  }
  await enterCall(patient.page, id);
  await enterCall(doctor.page, id);

  await hearsTheOtherSide(patient.page);
  await hearsTheOtherSide(doctor.page);
  for (const p of [patient.page, doctor.page]) {
    expect(await p.evaluate(() => (window as any).__askedForVideo)).toBe(false);
  }
  await patient.context.close();
  await doctor.context.close();
});
