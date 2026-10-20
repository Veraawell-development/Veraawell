/* eslint-disable @typescript-eslint/no-explicit-any -- hand-made stand-ins for browser objects */
import { describe, it, expect } from 'vitest';
import { mapMediaError, acquireMedia } from '../call/media';
import { detectInAppBrowser, describeClient, androidChromeIntent, isIOS } from '../call/browser';
import { QualityLadder, LADDER, applyQuality, sampleStats, isBadSample, isGoodSample } from '../call/stats';

const err = (name: string, message = '') => Object.assign(new Error(message), { name });

function fakeStream(audio: number, video: number): MediaStream {
  const t = (kind: string) => ({ kind, stop() {} });
  const a = Array.from({ length: audio }, () => t('audio'));
  const v = Array.from({ length: video }, () => t('video'));
  return { getAudioTracks: () => a, getVideoTracks: () => v, getTracks: () => [...a, ...v] } as unknown as MediaStream;
}

describe('camera/mic errors', () => {
  it.each([
    ['NotAllowedError', '', 'permission-denied'],
    ['NotAllowedError', 'Permission denied by system', 'permission-denied-system'],
    ['NotFoundError', '', 'no-device'],
    ['NotReadableError', 'Could not start video source', 'device-in-use'],
    ['OverconstrainedError', '', 'constraints'],
    ['SecurityError', '', 'insecure'],
    ['AbortError', '', 'aborted'],
    ['TypeError', '', 'unsupported'],
    ['Weird', '', 'unknown'],
  ])('%s %s ⇒ %s', (name, message, kind) => {
    expect(mapMediaError(err(name, message))).toBe(kind);
  });
  it('null ⇒ unknown', () => expect(mapMediaError(null)).toBe('unknown'));
});

describe('getting camera and mic (the ladder)', () => {
  it('video session: asks for 540p camera + mic first', async () => {
    const asked: MediaStreamConstraints[] = [];
    const r = await acquireMedia({ voice: false, getUserMedia: async (c) => { asked.push(c); return fakeStream(1, 1); } });
    expect(r).toMatchObject({ hasAudio: true, hasVideo: true, error: null });
    expect((asked[0].video as MediaTrackConstraints).height).toEqual({ ideal: 540 });
  });

  it('voice session: never asks for the camera', async () => {
    const asked: MediaStreamConstraints[] = [];
    await acquireMedia({ voice: true, getUserMedia: async (c) => { asked.push(c); throw err('NotFoundError'); } });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((c) => !('video' in c))).toBe(true);
  });

  it('camera busy in another app ⇒ joins with the mic only, and says why', async () => {
    const r = await acquireMedia({
      voice: false,
      getUserMedia: async (c) => { if (c.video) throw err('NotReadableError'); return fakeStream(1, 0); },
    });
    expect(r).toMatchObject({ hasAudio: true, hasVideo: false, error: 'device-in-use' });
  });

  it('too-strict constraints ⇒ falls back to a plain camera', async () => {
    const r = await acquireMedia({
      voice: false,
      getUserMedia: async (c) => { if (typeof c.video === 'object') throw err('OverconstrainedError'); return fakeStream(1, 1); },
    });
    expect(r).toMatchObject({ hasVideo: true, error: 'constraints' });
  });

  it('everything denied ⇒ no stream, stops asking once the mic is refused', async () => {
    let calls = 0;
    const r = await acquireMedia({ voice: false, getUserMedia: async () => { calls += 1; throw err('NotAllowedError'); } });
    expect(r).toMatchObject({ stream: null, hasAudio: false, hasVideo: false, error: 'permission-denied' });
    expect(calls).toBe(3); // camera+mic, plain camera+mic, mic — then gives up
  });

  it('chosen devices are asked for exactly', async () => {
    const asked: MediaStreamConstraints[] = [];
    await acquireMedia({ voice: false, audioDeviceId: 'mic2', videoDeviceId: 'cam2', getUserMedia: async (c) => { asked.push(c); return fakeStream(1, 1); } });
    expect((asked[0].audio as MediaTrackConstraints).deviceId).toEqual({ exact: 'mic2' });
    expect((asked[0].video as MediaTrackConstraints).deviceId).toEqual({ exact: 'cam2' });
  });
});

describe('where the page runs', () => {
  const UA = {
    whatsappAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A515F Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 WhatsApp/2.24',
    instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0',
    facebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]',
    gmailGsa: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/300.0 Mobile/15E148 Safari/604.1',
    linkedin: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 LinkedInApp',
    webview: 'Mozilla/5.0 (Linux; Android 12; Pixel 6; wv) AppleWebKit/537.36 Version/4.0 Chrome/119.0 Mobile Safari/537.36',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
    chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
    firefoxWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
    samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
  };

  it.each([
    ['whatsappAndroid', 'whatsapp'], ['instagram', 'instagram'], ['facebook', 'facebook'], ['gmailGsa', 'gmail-google'],
    ['linkedin', 'linkedin'], ['webview', 'android-webview'],
    ['chromeAndroid', null], ['safariIphone', null], ['chromeIphone', null], ['chromeMac', null], ['safariMac', null],
    ['edgeWin', null], ['firefoxWin', null], ['samsung', null],
  ] as const)('%s ⇒ %s', (key, expected) => {
    expect(detectInAppBrowser(UA[key])).toBe(expected);
  });

  it('names browsers and systems for the call statistics', () => {
    expect(describeClient(UA.safariIphone)).toEqual({ browser: 'Safari', os: 'iOS' });
    expect(describeClient(UA.chromeIphone)).toEqual({ browser: 'Chrome', os: 'iOS' });
    expect(describeClient(UA.chromeAndroid)).toEqual({ browser: 'Chrome', os: 'Android' });
    expect(describeClient(UA.edgeWin)).toEqual({ browser: 'Edge', os: 'Windows' });
    expect(describeClient(UA.firefoxWin)).toEqual({ browser: 'Firefox', os: 'Windows' });
    expect(describeClient(UA.safariMac)).toEqual({ browser: 'Safari', os: 'macOS' });
    expect(describeClient(UA.samsung)).toEqual({ browser: 'Samsung', os: 'Android' });
    expect(describeClient(UA.whatsappAndroid).browser).toBe('in-app:whatsapp');
    expect(isIOS(UA.safariMac)).toBe(false);
  });

  it('builds an "open in Chrome" link that falls back to the page', () => {
    const link = androidChromeIntent('https://veraawell.com/video-call/abc?x=1');
    expect(link).toBe('intent://veraawell.com/video-call/abc?x=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fveraawell.com%2Fvideo-call%2Fabc%3Fx%3D1;end');
  });
});

describe('call quality', () => {
  const bad = { rttMs: 800, audioLossPct: 0, videoLossPct: 0 };
  const good = { rttMs: 80, audioLossPct: 0, videoLossPct: 0 };
  const meh = { rttMs: 400, audioLossPct: 0, videoLossPct: 0 };

  it('classifies samples', () => {
    expect(isBadSample(bad)).toBe(true);
    expect(isBadSample({ rttMs: null, audioLossPct: 9, videoLossPct: 0 })).toBe(true);
    expect(isBadSample({ rttMs: null, audioLossPct: 0, videoLossPct: 11 })).toBe(true);
    expect(isGoodSample(good)).toBe(true);
    expect(isGoodSample({ rttMs: null, audioLossPct: null, videoLossPct: null })).toBe(true);
    expect(isGoodSample(meh)).toBe(false);
    expect(isBadSample(meh)).toBe(false);
  });

  it('steps down after 3 bad samples, back up after 5 good ones', () => {
    const l = new QualityLadder();
    expect([l.next(bad), l.next(bad)]).toEqual([0, 0]);
    expect(l.next(bad)).toBe(1);
    for (let i = 0; i < 6; i++) l.next(bad);
    expect(l.level).toBe(3);
    l.next(bad); l.next(bad); l.next(bad);
    expect(l.level).toBe(3); // floor: video paused, never below
    for (let i = 0; i < 4; i++) l.next(good);
    expect(l.level).toBe(3);
    expect(l.next(good)).toBe(2);
  });

  it('an in-between sample resets the streak (no flapping)', () => {
    const l = new QualityLadder();
    l.next(bad); l.next(bad); l.next(meh); l.next(bad); l.next(bad);
    expect(l.level).toBe(0);
  });

  it('applyQuality changes only the encoding fields and passes the rest back', async () => {
    let saved: any = null;
    const params = { transactionId: 't1', codecs: [{ mimeType: 'video/VP8' }], encodings: [{ rid: undefined, maxBitrate: 1 }] };
    const sender = {
      track: {},
      getParameters: () => params,
      setParameters: async (p: unknown) => { saved = p; },
    } as unknown as RTCRtpSender;
    await applyQuality(sender, 2);
    expect(saved.transactionId).toBe('t1');
    expect(saved.codecs).toEqual([{ mimeType: 'video/VP8' }]);
    expect(saved.encodings[0]).toMatchObject({ maxBitrate: LADDER[2].maxBitrate, scaleResolutionDownBy: 3, active: true });
    await applyQuality(sender, 3);
    expect(saved.encodings[0].active).toBe(false);
  });

  it('applyQuality never throws (no sender, no encodings, browser refuses)', async () => {
    await expect(applyQuality(null, 1)).resolves.toBeUndefined();
    await expect(applyQuality({ track: {}, getParameters: () => ({ encodings: [] }), setParameters: async () => {} } as any, 1)).resolves.toBeUndefined();
    const orig = console.warn; console.warn = () => {};
    await expect(applyQuality({ track: {}, getParameters: () => ({ encodings: [{}] }), setParameters: async () => { throw new Error('InvalidModificationError'); } } as any, 1)).resolves.toBeUndefined();
    console.warn = orig;
  });
});

describe('reading call statistics', () => {
  const report = (entries: any[]) => ({ getStats: async () => new Map(entries.map((e) => [e.id, e])) }) as unknown as RTCPeerConnection;

  it('Chrome: route from the transport, RTT from the pair, loss and bytes per kind', async () => {
    const pc = report([
      { id: 'T', type: 'transport', selectedCandidatePairId: 'P' },
      { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', currentRoundTripTime: 0.12 },
      { id: 'L', type: 'local-candidate', candidateType: 'relay' },
      { id: 'R', type: 'remote-candidate', candidateType: 'srflx' },
      { id: 'A', type: 'inbound-rtp', kind: 'audio', bytesReceived: 5000, packetsLost: 2, packetsReceived: 98 },
      { id: 'V', type: 'inbound-rtp', kind: 'video', bytesReceived: 90000, packetsLost: 0, packetsReceived: 200 },
    ]);
    const { stats, totals } = await sampleStats(pc, null);
    expect(stats).toMatchObject({ candidateType: 'relay', rttMs: 120, audioLossPct: 2, videoLossPct: 0, audioFlowing: true, videoFlowing: true });
    // Next sample: nothing new arrived ⇒ not flowing.
    const again = await sampleStats(pc, totals);
    expect(again.stats.audioFlowing).toBe(false);
    expect(again.stats.audioLossPct).toBeNull();
  });

  it('Safari: no transport pair id and no pair RTT ⇒ nominated pair + remote-inbound RTT', async () => {
    const pc = report([
      { id: 'P1', type: 'candidate-pair', nominated: false, state: 'in-progress', localCandidateId: 'L2', remoteCandidateId: 'R' },
      { id: 'P', type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'L', remoteCandidateId: 'R' },
      { id: 'L', type: 'local-candidate', candidateType: 'host' },
      { id: 'L2', type: 'local-candidate', candidateType: 'relay' },
      { id: 'R', type: 'remote-candidate', candidateType: 'host' },
      { id: 'RI', type: 'remote-inbound-rtp', kind: 'audio', roundTripTime: 0.05 },
      { id: 'A', type: 'inbound-rtp', mediaType: 'audio', bytesReceived: 100, packetsReceived: 10 },
    ]);
    const { stats } = await sampleStats(pc, null);
    expect(stats).toMatchObject({ candidateType: 'host', rttMs: 50, audioFlowing: true, videoFlowing: false });
  });

  it('Firefox: the `selected` pair', async () => {
    const pc = report([
      { id: 'P', type: 'candidate-pair', selected: true, localCandidateId: 'L', remoteCandidateId: 'R' },
      { id: 'L', type: 'local-candidate', candidateType: 'srflx' },
      { id: 'R', type: 'remote-candidate', candidateType: 'srflx' },
    ]);
    expect((await sampleStats(pc, null)).stats.candidateType).toBe('srflx');
  });

  it('nothing connected yet ⇒ empty, not an error', async () => {
    const { stats } = await sampleStats(report([]), null);
    expect(stats).toMatchObject({ candidateType: null, rttMs: null, audioFlowing: false, videoFlowing: false });
  });
});

describe('call statistics', () => {
  it('the server accepts every event type the call engine reports (one unknown type refuses the whole batch)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../call/CallEngine.ts'), 'utf8');
    const noted = new Set<string>();
    for (const m of src.matchAll(/this\.note\(\s*'([a-z-]+)'/g)) noted.add(m[1]);
    for (const m of src.matchAll(/'(ice-stuck|ice-gave-up|ice-restart|relay-escalation)'/g)) noted.add(m[1]);
    // Read as text: requiring it would pull in server-only packages (the
    // client CI job doesn't install the server's dependencies).
    const server = fs.readFileSync(path.resolve(__dirname, '../../../server/services/call/callTelemetry.js'), 'utf8');
    const list = /const EVENT_TYPES = \[([^\]]+)\]/.exec(server)?.[1] || '';
    const EVENT_TYPES = [...list.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    expect(EVENT_TYPES.length).toBeGreaterThan(10);
    expect(noted.size).toBeGreaterThan(10);
    expect([...noted].filter((t) => !EVENT_TYPES.includes(t))).toEqual([]);
  });
});
