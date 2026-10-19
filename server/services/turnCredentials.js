/**
 * ICE servers for a call: STUN, plus a TURN relay from Cloudflare Realtime.
 *
 * A browser-to-browser call needs a relay on many networks — Jio/Airtel
 * mobile data (carrier NAT, IPv6-only), office Wi-Fi, many home routers. The
 * old Metered setup was on a 500 MB/month free plan (one relayed 40-minute
 * video call is ~1.8 GB), had no timeout, no cache, and when it failed
 * returned Google STUN only with `success: true` — so on those networks both
 * people were "joined" and nobody saw or heard anything, with no signal
 * anywhere that the relay was missing.
 *
 * Now:
 *  - Cloudflare mints short-lived credentials per user and session
 *    (developers.cloudflare.com/realtime/turn/generate-credentials). TTL
 *    outlives the session (max 48 h); the client refreshes at 80% of it.
 *  - 3 s timeout, cached per session+user, revoked when the session ends.
 *  - Port-53 URLs are dropped (browsers block them).
 *  - When no relay is available the answer says so (`relayAvailable:false`)
 *    and an error is logged — the call screen tells the person, and the
 *    admin Calls tab shows it.
 *  - Optional static fallback relay (TURN_FALLBACK_*) for an outage.
 */

const { createLogger } = require('../utils/logger');

const logger = createLogger('TURN');

const CF_API = 'https://rtc.live.cloudflare.com/v1/turn/keys';
const TIMEOUT_MS = 3000;
const MIN_TTL_S = 60 * 60;
const MAX_TTL_S = 24 * 60 * 60; // Cloudflare allows 48 h; a day is plenty
const REUSE_MARGIN_S = 15 * 60;
const FAILURE_COOLDOWN_MS = 30 * 1000;
const ALERT_EVERY_MS = 5 * 60 * 1000;
const STUN = { urls: ['stun:stun.cloudflare.com:3478'] };

const cache = new Map();        // `${sessionId}:${userId}` -> { value, expiresAt(ms), username }
let lastFailureAt = 0;
let lastAlertAt = 0;

function config(env = process.env) {
  return {
    keyId: env.CLOUDFLARE_TURN_KEY_ID || '',
    token: env.CLOUDFLARE_TURN_API_TOKEN || '',
    statics: ['FALLBACK', 'BACKUP'].map((k) => ({
      urls: (env[`TURN_${k}_URLS`] || '').split(',').map((u) => u.trim()).filter(Boolean),
      username: env[`TURN_${k}_USERNAME`] || '',
      credential: env[`TURN_${k}_CREDENTIAL`] || ''
    })).filter((x) => x.urls.length && x.username && x.credential)
  };
}

/** Drop URLs a browser refuses (port 53) and empty entries. */
function cleanIceServers(iceServers) {
  return (iceServers || [])
    .map((server) => {
      const urls = (Array.isArray(server.urls) ? server.urls : [server.urls])
        .filter((u) => typeof u === 'string' && !/:53(\?|$)/.test(u));
      return urls.length ? { ...server, urls } : null;
    })
    .filter(Boolean);
}

function hasRelay(iceServers) {
  return iceServers.some((s) => s.urls.some((u) => /^turns?:/.test(u)));
}

/** Seconds the credentials must live: the rest of the session + 30 min. */
function ttlFor(sessionEndsAt, now = Date.now()) {
  const ends = sessionEndsAt ? new Date(sessionEndsAt).getTime() : now;
  const wanted = Math.ceil((Math.max(ends - now, 0) / 1000) + 30 * 60);
  return Math.min(Math.max(wanted, MIN_TTL_S), MAX_TTL_S);
}

async function fetchCloudflare(cfg, ttl, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${CF_API}/${encodeURIComponent(cfg.keyId)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Cloudflare TURN answered ${res.status}`);
    const body = await res.json();
    const servers = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
    return cleanIceServers(servers);
  } finally {
    clearTimeout(timer);
  }
}

function alertNoRelay(reason) {
  const now = Date.now();
  if (now - lastAlertAt < ALERT_EVERY_MS) return;
  lastAlertAt = now;
  logger.error('TURN_UNAVAILABLE — calls on strict/mobile networks may not connect', { reason });
}

/**
 * @returns {Promise<{iceServers:object[], ttlSeconds:number, expiresAt:string,
 *   relayAvailable:boolean, provider:'cloudflare'|'fallback'|'none', iceConfigVersion:string}>}
 */
async function getIceServers({ userId, sessionId, sessionEndsAt }, { env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const key = `${sessionId}:${userId}`;
  const t = now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt - t > REUSE_MARGIN_S * 1000
      && (!sessionEndsAt || cached.expiresAt > new Date(sessionEndsAt).getTime())) {
    return cached.value;
  }

  const cfg = config(env);
  const ttl = ttlFor(sessionEndsAt, t);
  let servers = null;
  let provider = 'none';

  if (cfg.keyId && cfg.token && t - lastFailureAt > FAILURE_COOLDOWN_MS) {
    try {
      servers = await fetchCloudflare(cfg, ttl, fetchImpl);
      if (!hasRelay(servers)) throw new Error('no TURN url in the answer');
      provider = 'cloudflare';
    } catch (err) {
      lastFailureAt = t;
      servers = null;
      alertNoRelay(err.name === 'AbortError' ? 'Cloudflare TURN timed out' : err.message);
    }
  }

  // Static relays (no card needed): every one configured is offered, so the
  // browser can use whichever works on its network (e.g. a free 3478 relay
  // plus a backup with TLS on 443).
  if (!servers && cfg.statics.length) {
    servers = cleanIceServers(cfg.statics);
    provider = servers.length ? 'fallback' : 'none';
  }
  if (!servers || !hasRelay(servers)) {
    alertNoRelay(cfg.keyId && cfg.token ? 'Cloudflare failed and no static relay is set' : 'no relay configured (CLOUDFLARE_TURN_* or TURN_FALLBACK_*)');
  }

  const relayAvailable = !!servers && hasRelay(servers);
  const iceServers = [STUN, ...((servers || []).filter((s) => s.urls.some((u) => /^turns?:/.test(u))))];
  const ttlSeconds = relayAvailable ? ttl : 60; // retry soon when there is no relay
  const value = {
    iceServers,
    ttlSeconds,
    expiresAt: new Date(t + ttlSeconds * 1000).toISOString(),
    relayAvailable,
    provider,
    iceConfigVersion: `${provider}:${relayAvailable ? 1 : 0}`
  };
  const turn = (servers || []).find((s) => s.username);
  cache.set(key, { value, expiresAt: t + ttlSeconds * 1000, username: provider === 'cloudflare' && turn ? turn.username : null });
  return value;
}

/**
 * The session is over: revoke its Cloudflare credentials so they can't be
 * reused, and forget them. Best effort — never throws.
 */
async function revokeForSession(sessionId, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const cfg = config(env);
  const prefix = `${sessionId}:`;
  const jobs = [];
  for (const [key, entry] of cache) {
    if (!key.startsWith(prefix)) continue;
    cache.delete(key);
    if (entry.username && cfg.keyId && cfg.token) {
      jobs.push(fetchImpl(`${CF_API}/${encodeURIComponent(cfg.keyId)}/credentials/${encodeURIComponent(entry.username)}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.token}` }
      }).catch((err) => logger.warn('TURN revoke failed', { error: err.message })));
    }
  }
  await Promise.all(jobs);
}

/** Tests only. */
function _reset() {
  cache.clear();
  lastFailureAt = 0;
  lastAlertAt = 0;
}

module.exports = { getIceServers, revokeForSession, cleanIceServers, ttlFor, _reset };
