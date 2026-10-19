/**
 * services/turnCredentials.js — the relay a call falls back to on strict or
 * mobile networks. Cloudflare is mocked; nothing leaves the machine.
 */
const turn = require('../services/turnCredentials');

const ENV = { CLOUDFLARE_TURN_KEY_ID: 'key123', CLOUDFLARE_TURN_API_TOKEN: 'tok' };
const CF_ANSWER = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u1', credential: 'c1' }
  ]
};
const ok = (body) => Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve(body) });
const ends = (min) => new Date(Date.now() + min * 60 * 1000);

beforeEach(() => turn._reset());

test('Cloudflare credentials: TURN over UDP and TLS 443, port 53 dropped, TTL outlives the session', async () => {
  const fetchImpl = jest.fn(() => ok(CF_ANSWER));
  const r = await turn.getIceServers({ userId: 'p1', sessionId: 's1', sessionEndsAt: ends(40) }, { env: ENV, fetchImpl });
  expect(r.relayAvailable).toBe(true);
  expect(r.provider).toBe('cloudflare');
  const urls = r.iceServers.flatMap((s) => s.urls);
  expect(urls).toContain('turns:turn.cloudflare.com:443?transport=tcp');
  expect(urls.some((u) => /:53\b/.test(u))).toBe(false);
  expect(urls[0]).toBe('stun:stun.cloudflare.com:3478');
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/key123/credentials/generate-ice-servers');
  expect(init.headers.Authorization).toBe('Bearer tok');
  expect(JSON.parse(init.body).ttl).toBeGreaterThanOrEqual(60 * 60);
});

test('cached per session and person: a second ask in the same session does not call Cloudflare again', async () => {
  const fetchImpl = jest.fn(() => ok(CF_ANSWER));
  await turn.getIceServers({ userId: 'p1', sessionId: 's1', sessionEndsAt: ends(40) }, { env: ENV, fetchImpl });
  await turn.getIceServers({ userId: 'p1', sessionId: 's1', sessionEndsAt: ends(40) }, { env: ENV, fetchImpl });
  await turn.getIceServers({ userId: 'd1', sessionId: 's1', sessionEndsAt: ends(40) }, { env: ENV, fetchImpl });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('Cloudflare down or slow: no relay, said plainly, and not hammered', async () => {
  const fetchImpl = jest.fn(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  const r = await turn.getIceServers({ userId: 'p1', sessionId: 's2', sessionEndsAt: ends(40) }, { env: ENV, fetchImpl });
  expect(r.relayAvailable).toBe(false);
  expect(r.provider).toBe('none');
  expect(r.ttlSeconds).toBe(60);
  expect(r.iceServers.flatMap((s) => s.urls).every((u) => u.startsWith('stun:'))).toBe(true);
  await turn.getIceServers({ userId: 'p2', sessionId: 's3', sessionEndsAt: ends(40) }, { env: ENV, fetchImpl });
  expect(fetchImpl).toHaveBeenCalledTimes(1); // cooling off after a failure
});

test('an answer with no TURN in it counts as no relay', async () => {
  const fetchImpl = jest.fn(() => ok({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }] }));
  const r = await turn.getIceServers({ userId: 'p1', sessionId: 's4' }, { env: ENV, fetchImpl });
  expect(r.relayAvailable).toBe(false);
});

test('not configured: the static fallback relay is used if set, else STUN only', async () => {
  const fetchImpl = jest.fn();
  const fb = await turn.getIceServers({ userId: 'p1', sessionId: 's5' }, {
    env: { TURN_FALLBACK_URLS: 'turns:relay.example.com:443?transport=tcp', TURN_FALLBACK_USERNAME: 'x', TURN_FALLBACK_CREDENTIAL: 'y' }, fetchImpl
  });
  expect(fb.provider).toBe('fallback');
  expect(fb.relayAvailable).toBe(true);
  const none = await turn.getIceServers({ userId: 'p1', sessionId: 's6' }, { env: {}, fetchImpl });
  expect(none.relayAvailable).toBe(false);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('a session that ends revokes its Cloudflare credentials', async () => {
  const fetchImpl = jest.fn(() => ok(CF_ANSWER));
  await turn.getIceServers({ userId: 'p1', sessionId: 's7', sessionEndsAt: ends(40) }, { env: ENV, fetchImpl });
  fetchImpl.mockClear();
  fetchImpl.mockImplementation(() => Promise.resolve({ ok: true, status: 204 }));
  await turn.revokeForSession('s7', { env: ENV, fetchImpl });
  expect(fetchImpl).toHaveBeenCalledWith('https://rtc.live.cloudflare.com/v1/turn/keys/key123/credentials/u1/revoke', expect.objectContaining({ method: 'POST' }));
  // forgotten: the next ask mints new ones
  fetchImpl.mockClear();
  fetchImpl.mockImplementation(() => ok(CF_ANSWER));
  await turn.getIceServers({ userId: 'p1', sessionId: 's7', sessionEndsAt: ends(40) }, { env: ENV, fetchImpl });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('TTL: at least an hour, at most a day, otherwise the rest of the session + 30 min', () => {
  const now = Date.now();
  expect(turn.ttlFor(new Date(now + 10 * 60 * 1000), now)).toBe(60 * 60);
  expect(turn.ttlFor(new Date(now + 90 * 60 * 1000), now)).toBe(120 * 60);
  expect(turn.ttlFor(new Date(now + 72 * 3600 * 1000), now)).toBe(24 * 3600);
});
