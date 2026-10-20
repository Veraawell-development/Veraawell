/* eslint-disable @typescript-eslint/no-explicit-any -- reads the engine's debug hook from the page */
import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { fixtures } from './fixtures';
import { closeDb, db, ObjectId } from './adminHelpers';
import { createSession, enterCall, readSession, signIn } from './sessionHelpers';

/**
 * The call itself, in two real Chromium windows with fake camera and
 * microphone: media must actually flow (picture moving, sound bytes
 * arriving), and survive what used to break it — a signalling drop, a
 * refresh, a second tab, an ICE restart — and the relay must really work.
 *
 * Reads the engine through window.__vwCall (dev builds only).
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

async function party(browser: Browser, who: 'patient' | 'doctor', init?: (page: Page) => Promise<void>): Promise<{ context: BrowserContext; page: Page }> {
  const { users } = fixtures();
  const user = who === 'patient' ? users.patientB : users.doctorB;
  const context = await browser.newContext();
  await signIn(context, user.email, user.password, who);
  const page = await context.newPage();
  if (process.env.PC_TRACE) await page.addInitScript(() => {
    const t0 = Date.now();
    const trace: string[] = ((window as any).__pcTrace = []);
    const Orig = window.RTCPeerConnection;
    let n = 0;
    (window as any).RTCPeerConnection = function (cfg: RTCConfiguration) {
      const pc = new Orig(cfg);
      const id = ++n;
      const log = (m: string) => trace.push(`${Date.now() - t0} pc${id} ${m}`);
      log('new');
      for (const ev of ['icecandidate', 'icegatheringstatechange', 'iceconnectionstatechange', 'signalingstatechange', 'negotiationneeded', 'icecandidateerror']) {
        pc.addEventListener(ev, (e: any) => log(`${ev} ${ev === 'icecandidate' ? (e.candidate ? e.candidate.candidate.split(' ')[7] : 'null') : ev === 'icegatheringstatechange' ? pc.iceGatheringState : ev === 'iceconnectionstatechange' ? pc.iceConnectionState : ev === 'signalingstatechange' ? pc.signalingState : ev === 'icecandidateerror' ? e.errorCode : ''}`));
      }
      for (const m of ['setLocalDescription', 'setRemoteDescription', 'addIceCandidate', 'restartIce', 'close', 'setConfiguration']) {
        const f = (pc as any)[m].bind(pc);
        (pc as any)[m] = (...a: any[]) => { log(`${m} ${a[0]?.type || (a[0]?.candidate ? 'cand' : '')}`); const r = f(...a); if (r && r.catch) r.catch((err: any) => log(`${m} FAILED ${err.name}`)); return r; };
      }
      return pc;
    };
    (window as any).RTCPeerConnection.prototype = Orig.prototype;
  });
  page.on('console', (m) => { if (/\[call\]/.test(m.text())) console.log(`[${who} console]`, m.text()); });
  if (init) await init(page);
  return { context, page };
}

const snap = (page: Page) => page.evaluate(() => {
  const s = (window as any).__vwCall?.getSnapshot();
  return s ? { phase: s.phase, peer: s.peer?.present, connection: s.peer?.connection, stats: s.stats, superseded: s.superseded, failure: s.failure } : null;
});

/** Picture from the other side is decoding and moving. */
async function seesTheOtherSide(page: Page) {
  const frame = () => page.evaluate(() => {
    const v = document.querySelector('[data-testid="remote-video"]') as HTMLVideoElement | null;
    return v ? { w: v.videoWidth, t: v.currentTime } : { w: 0, t: 0 };
  });
  await expect.poll(async () => (await frame()).w, { timeout: 30_000 }).toBeGreaterThan(0);
  const a = await frame();
  await expect.poll(async () => (await frame()).t, { timeout: 10_000 }).toBeGreaterThan(a.t);
}

/** Sound from the other side is arriving (bytes received grow). */
async function hearsTheOtherSide(page: Page) {
  await expect.poll(async () => (await snap(page))?.stats?.audioFlowing ?? false, { timeout: 30_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const el = document.querySelector('[data-testid="remote-audio"]') as HTMLAudioElement | null;
    const stream = el?.srcObject as MediaStream | null;
    return { live: stream?.getAudioTracks().filter((t) => t.readyState === 'live').length || 0, playing: !!el && !el.paused };
  }), { timeout: 15_000 }).toEqual({ live: 1, playing: true });
}

async function connected(page: Page) {
  try {
    await expect.poll(async () => (await snap(page))?.phase, { timeout: 40_000 }).toBe('connected');
  } catch (err) {
    // Say why, for the report.
    for (const other of page.context().browser()?.contexts().flatMap((c) => c.pages()) || []) if (other !== page) console.log('[call-debug other]', JSON.stringify(await other.evaluate(() => {
      const e = (window as any).__vwCall;
      const pc = e?.debug.pc as RTCPeerConnection | null;
      return { counts: e?.debug.counts, role: e?.getSnapshot().role, snap: e?.getSnapshot().phase, epoch: e?.debug.epoch, sig: pc?.signalingState, ice: pc?.iceConnectionState, gathering: pc?.iceGatheringState, local: pc?.localDescription?.type, remote: pc?.remoteDescription?.type, remoteSdpHasCand: /a=candidate/.test(pc?.remoteDescription?.sdp || ''), out: (e as any)?.outQueue?.length, pre: (e as any)?.preSignals?.length, pending: (e as any)?.negotiator?.pendingCandidates?.length };
    }).catch(() => null)));
    for (const pg of page.context().browser()?.contexts().flatMap((c) => c.pages()) || []) console.log('[pc-trace]', (await pg.evaluate(() => ((window as any).__pcTrace || []).join('\n')).catch(() => '')));
    console.log('[call-debug]', JSON.stringify(await page.evaluate(() => {
      const e = (window as any).__vwCall;
      const pc = e?.debug.pc as RTCPeerConnection | null;
      return { tx: pc?.getTransceivers().map((t) => `${t.mid}:${t.direction}:${t.sender.track?.kind}`), mlines: (pc?.localDescription?.sdp.match(/^m=/gm) || []).length, lcand: (pc?.localDescription?.sdp.match(/a=candidate/g) || []).length, cfg: pc?.getConfiguration().iceServers?.map((x: any) => x.urls), policy: pc?.getConfiguration().iceTransportPolicy, counts: e?.debug.counts, snap: e?.getSnapshot().phase, peer: e?.getSnapshot().peer, epoch: e?.debug.epoch, joined: e?.debug.joined,
        sig: pc?.signalingState, ice: pc?.iceConnectionState, conn: pc?.connectionState, local: pc?.localDescription?.type, remote: pc?.remoteDescription?.type,
        gathering: pc?.iceGatheringState, out: (e as any)?.outQueue?.length, pre: (e as any)?.preSignals?.length, pending: (e as any)?.negotiator?.pendingCandidates?.length, events: (e as any)?.events?.map((x: any) => x.type) };
    })));
    throw err;
  }
}

/** Remember this page's RTCPeerConnection, to tell later whether it was rebuilt. */
const markPc = (page: Page) => page.evaluate(() => { (window as any).__pcMark = (window as any).__vwCall.debug.pc; });
const samePc = (page: Page) => page.evaluate(() => (window as any).__vwCall.debug.pc === (window as any).__pcMark);

async function newCall(browser: Browser, init?: (page: Page) => Promise<void>) {
  const { users } = fixtures();
  const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -1 });
  const patient = await party(browser, 'patient', init);
  const doctor = await party(browser, 'doctor', init);
  return { id, patient, doctor };
}

async function closeAll(...parties: { context: BrowserContext }[]) {
  for (const p of parties) await p.context.close();
}

test.describe('a video call', () => {
  test('both see and hear each other; "connected" means media is arriving', async ({ browser }) => {
    test.setTimeout(90_000);
    const { id, patient, doctor } = await newCall(browser);
    await enterCall(patient.page, id);
    // The patient alone: waiting, not "connected".
    await expect.poll(async () => (await snap(patient.page))?.phase, { timeout: 20_000 }).toBe('waiting');
    await enterCall(doctor.page, id);

    for (const p of [patient.page, doctor.page]) {
      await connected(p);
      await seesTheOtherSide(p);
      await hearsTheOtherSide(p);
    }
    // Both stays recorded once.
    await expect.poll(async () => (await readSession(id))?.attendance?.length ?? 0, { timeout: 10_000 }).toBe(2);
    await closeAll(patient, doctor);
  });

  test('both joining at the same moment (offers crossing) still connects', async ({ browser }) => {
    test.setTimeout(90_000);
    const { id, patient, doctor } = await newCall(browser);
    await Promise.all([enterCall(patient.page, id), enterCall(doctor.page, id)]);
    await Promise.all([connected(patient.page), connected(doctor.page)]);
    await seesTheOtherSide(patient.page);
    await seesTheOtherSide(doctor.page);
    await closeAll(patient, doctor);
  });

  test('our signalling server dropping every connection does not interrupt the call', async ({ browser }) => {
    test.setTimeout(90_000);
    const { id, patient, doctor } = await newCall(browser);
    await enterCall(patient.page, id);
    await enterCall(doctor.page, id);
    await connected(patient.page);
    await connected(doctor.page);
    await markPc(patient.page);
    await markPc(doctor.page);

    const res = await fetch(`${fixtures().controlUrl}/signalling/disconnect-all`, { method: 'POST' });
    expect(res.ok).toBe(true);

    // Media keeps flowing on the same connection; the sockets come back.
    await seesTheOtherSide(patient.page);
    await hearsTheOtherSide(doctor.page);
    await expect.poll(() => patient.page.evaluate(() => (window as any).__vwCall.debug.joined), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => doctor.page.evaluate(() => (window as any).__vwCall.debug.joined), { timeout: 20_000 }).toBe(true);
    expect(await samePc(patient.page)).toBe(true);
    expect(await samePc(doctor.page)).toBe(true);
    expect((await snap(patient.page))?.phase).toBe('connected');
    // Nobody "left": still one open stay each.
    const after = await readSession(id);
    expect(after?.attendance?.length).toBe(2);
    expect(after?.attendance?.every((a: any) => a.leftAt === null)).toBe(true);
    await closeAll(patient, doctor);
  });

  test('a short loss of the network: the call carries on and nobody is marked as gone', async ({ browser }) => {
    test.setTimeout(90_000);
    const { id, patient, doctor } = await newCall(browser);
    await enterCall(patient.page, id);
    await enterCall(doctor.page, id);
    await connected(patient.page);
    await connected(doctor.page);

    await patient.context.setOffline(true);
    await patient.page.waitForTimeout(4000);
    await patient.context.setOffline(false);

    await expect.poll(() => patient.page.evaluate(() => (window as any).__vwCall.debug.joined), { timeout: 30_000 }).toBe(true);
    await connected(patient.page);
    await seesTheOtherSide(doctor.page);
    await expect.poll(async () => (await snap(doctor.page))?.connection, { timeout: 20_000 }).toBe('connected');
    const after = await readSession(id);
    expect(after?.attendance?.every((a: any) => a.leftAt === null)).toBe(true);
    await closeAll(patient, doctor);
  });

  test('a refresh rejoins: a fresh connection, media back, no departure recorded', async ({ browser }) => {
    test.setTimeout(120_000);
    const { id, patient, doctor } = await newCall(browser);
    await enterCall(patient.page, id);
    await enterCall(doctor.page, id);
    await connected(doctor.page);
    await markPc(doctor.page);

    await enterCall(patient.page, id); // goto again = refresh
    await connected(patient.page);
    await connected(doctor.page);
    await seesTheOtherSide(doctor.page);
    await seesTheOtherSide(patient.page);
    // The doctor's side rebuilt its connection for the new page (new pairing).
    expect(await samePc(doctor.page)).toBe(false);
    const after = await readSession(id);
    expect(after?.attendance?.filter((a: any) => a.role === 'patient').length).toBe(1);
    expect(after?.attendance?.every((a: any) => a.leftAt === null)).toBe(true);
    await closeAll(patient, doctor);
  });

  test('a second tab takes the call over; the first says so and can take it back', async ({ browser }) => {
    test.setTimeout(120_000);
    const { id, patient, doctor } = await newCall(browser);
    await enterCall(patient.page, id);
    await enterCall(doctor.page, id);
    await connected(patient.page);

    const second = await patient.context.newPage();
    await enterCall(second, id);
    await expect(patient.page.getByText('This call is open somewhere else')).toBeVisible({ timeout: 15_000 });
    await connected(second);
    await seesTheOtherSide(second);
    await seesTheOtherSide(doctor.page);

    await patient.page.getByRole('button', { name: 'Use this tab instead' }).click();
    await connected(patient.page);
    await expect.poll(async () => (await snap(second))?.superseded, { timeout: 15_000 }).toBe(true);
    await seesTheOtherSide(patient.page);
    await closeAll(patient, doctor);
  });

  test('an ICE restart mid-call renegotiates cleanly and the media keeps going', async ({ browser }) => {
    test.setTimeout(90_000);
    const { id, patient, doctor } = await newCall(browser);
    await enterCall(patient.page, id);
    await enterCall(doctor.page, id);
    await connected(patient.page);
    await connected(doctor.page);
    await markPc(patient.page);

    for (const p of [patient.page, doctor.page]) {
      await p.evaluate(() => (window as any).__vwCall.debug.pc.restartIce());
    }
    await expect.poll(() => patient.page.evaluate(() => (window as any).__vwCall.debug.pc.signalingState), { timeout: 15_000 }).toBe('stable');
    await expect.poll(() => doctor.page.evaluate(() => (window as any).__vwCall.debug.pc.signalingState), { timeout: 15_000 }).toBe('stable');
    await seesTheOtherSide(patient.page);
    await hearsTheOtherSide(doctor.page);
    expect(await samePc(patient.page)).toBe(true);
    await closeAll(patient, doctor);
  });

  test('the other person leaving: back to waiting, told when they can rejoin; they come back and it reconnects', async ({ browser }) => {
    test.setTimeout(120_000);
    const { id, patient, doctor } = await newCall(browser);
    await enterCall(patient.page, id);
    await enterCall(doctor.page, id);
    await connected(patient.page);

    await doctor.page.getByRole('button', { name: 'Back to Dashboard' }).click(); // leaving on purpose
    await expect(doctor.page).toHaveURL(/doctor-dashboard/);
    await expect.poll(async () => (await snap(patient.page))?.phase, { timeout: 15_000 }).toBe('waiting');
    await expect(patient.page.getByText(/left the call\. They can rejoin until/)).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => (await readSession(id))?.attendance?.find((a: any) => a.role === 'doctor')?.leftAt ?? null, { timeout: 10_000 }).not.toBeNull();

    await enterCall(doctor.page, id);
    await connected(patient.page);
    await seesTheOtherSide(patient.page);
    await closeAll(patient, doctor);
  });
});

test.describe('closing the tab', () => {
  test('the other side sees "reconnecting" at once, then "left" after the grace period, with the leave time backdated', async ({ browser }) => {
    test.setTimeout(150_000);
    const { id, patient, doctor } = await newCall(browser);
    await enterCall(patient.page, id);
    await enterCall(doctor.page, id);
    await connected(patient.page);
    const closedAt = Date.now();
    await doctor.context.close();

    await expect.poll(async () => (await snap(patient.page))?.connection, { timeout: 15_000 }).toBe('reconnecting');
    await expect(patient.page.getByText('Your therapist is reconnecting…')).toBeVisible();
    // Grace (25 s) + quiet (45 s) on the server, then gone.
    await expect.poll(async () => (await snap(patient.page))?.phase, { timeout: 90_000 }).toBe('waiting');
    const stay = (await readSession(id))?.attendance?.find((a: any) => a.role === 'doctor');
    expect(stay?.leftAt).toBeTruthy();
    // Recorded as when they were last seen, not when the grace ran out.
    expect(new Date(stay.leftAt).getTime()).toBeLessThan(closedAt + 15_000);
    await patient.context.close();
  });
});

test.describe('when the camera or sound is a problem', () => {
  test('camera refused: the patient is told how to fix it, joins with sound only, the therapist sees "Camera is off"', async ({ browser }) => {
    test.setTimeout(90_000);
    const { users } = fixtures();
    const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -1 });
    const patient = await party(browser, 'patient', (page) => page.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (c?: MediaStreamConstraints) => (c && c.video
        ? Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
        : original(c));
    }));
    const doctor = await party(browser, 'doctor');

    await patient.page.goto(`/video-call/${id}`);
    const prejoin = patient.page.getByTestId('prejoin');
    await expect(prejoin.getByText('Allow the camera and microphone', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(prejoin.getByRole('button', { name: 'Try again' })).toBeVisible();
    await prejoin.getByRole('button', { name: 'Join now' }).click();
    await enterCall(doctor.page, id);

    await connected(doctor.page);
    await hearsTheOtherSide(doctor.page);
    await hearsTheOtherSide(patient.page);
    await seesTheOtherSide(patient.page); // the patient still sees the therapist
    await expect(doctor.page.getByText('Camera is off')).toBeVisible({ timeout: 10_000 });
    await closeAll(patient, doctor);
  });

  test('no microphone or camera at all: still joins to listen, and the other side still connects', async ({ browser }) => {
    test.setTimeout(90_000);
    const { users } = fixtures();
    const id = await createSession({ patientId: users.patientB.id, doctorId: users.doctorB.id, startsInMinutes: -1 });
    const patient = await party(browser, 'patient', (page) => page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    }));
    const doctor = await party(browser, 'doctor');
    await patient.page.goto(`/video-call/${id}`);
    const prejoin = patient.page.getByTestId('prejoin');
    await expect(prejoin.getByText('No camera or microphone found', { exact: true })).toBeVisible({ timeout: 20_000 });
    await prejoin.getByRole('button', { name: 'Join without microphone' }).click();
    await enterCall(doctor.page, id);
    await seesTheOtherSide(patient.page);
    await hearsTheOtherSide(patient.page);
    await closeAll(patient, doctor);
  });

  test('sound blocked by the browser: a "Tap to turn on sound" button starts it', async ({ browser }) => {
    test.setTimeout(90_000);
    const blockSound = (page: Page) => page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        if (this instanceof HTMLAudioElement && !(window as any).__soundAllowed) {
          return Promise.reject(new DOMException('play() needs a user gesture', 'NotAllowedError'));
        }
        return play.call(this);
      };
    });
    const { id, patient, doctor } = await newCall(browser, blockSound);
    await enterCall(patient.page, id);
    await enterCall(doctor.page, id);
    await connected(patient.page);
    const tap = patient.page.getByRole('button', { name: 'Tap to turn on sound' });
    await expect(tap).toBeVisible({ timeout: 15_000 });
    // The picture is not held hostage by the sound.
    await seesTheOtherSide(patient.page);
    await patient.page.evaluate(() => { (window as any).__soundAllowed = true; });
    await tap.click();
    await hearsTheOtherSide(patient.page);
    await expect(tap).toBeHidden();
    await closeAll(patient, doctor);
  });
});

test.describe('the relay', () => {
  test('with the relay forced, the call goes through it and media flows', async ({ browser }) => {
    test.setTimeout(120_000);
    const force = (page: Page) => page.addInitScript(() => { (window as any).__vwForceRelay = true; });
    const { id, patient, doctor } = await newCall(browser, force);
    await enterCall(patient.page, id);
    await expect.poll(() => patient.page.evaluate(() => (window as any).__vwCall.getSnapshot().relayAvailable), { timeout: 10_000 }).not.toBeNull();
    const relay = await patient.page.evaluate(() => (window as any).__vwCall.getSnapshot().relayAvailable);
    test.skip(relay !== true, 'no relay configured for the e2e stack (TURN_FALLBACK_* / CLOUDFLARE_TURN_*)');
    await enterCall(doctor.page, id);
    await connected(patient.page);
    await connected(doctor.page);
    await expect.poll(async () => (await snap(patient.page))?.stats?.candidateType, { timeout: 20_000 }).toBe('relay');
    await seesTheOtherSide(patient.page);
    await seesTheOtherSide(doctor.page);
    await hearsTheOtherSide(doctor.page);
    await closeAll(patient, doctor);
  });
});
