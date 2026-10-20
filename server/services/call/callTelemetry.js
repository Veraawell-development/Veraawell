/**
 * Call statistics, accumulated in memory and written to CallLog only now and
 * then (MongoDB's free/flex tiers have a small write budget): when the call
 * first connects, on a failure (at most once per 10 s), when the room
 * closes, when the server shuts down, and every 5 minutes if anything
 * changed. Media heartbeats never write directly.
 */

const { createLogger } = require('../../utils/logger');

const logger = createLogger('CALL-TELEMETRY');
const FLUSH_EVERY_MS = 5 * 60 * 1000;
const FAILURE_FLUSH_GAP_MS = 10 * 1000;
// Every event the call engine notes (client/src/call/CallEngine.ts — a
// client test checks the two lists match, since one unknown type refuses
// the whole batch).
const EVENT_TYPES = ['join-attempt', 'connected', 'reconnecting', 'reconnected', 'ice-restart', 'relay-escalation',
  'failed', 'media-error', 'autoplay-blocked', 'device-lost', 'left', 'server-restart',
  'ice-stuck', 'ice-gave-up', 'rejoin', 'slow-connect', 'signalling-lost', 'peer-left', 'superseded', 'quality'];

const pending = new Map(); // sessionId -> accumulator

function acc(sessionId) {
  let a = pending.get(sessionId);
  if (!a) {
    a = { inc: {}, set: {}, min: {}, failures: [], rtt: [], loss: [], dirty: false, lastFlush: 0, lastFailureFlush: 0, connectedFlushed: false };
    pending.set(sessionId, a);
  }
  return a;
}

function noteHealth(sessionId, role, health) {
  const a = acc(String(sessionId));
  if (health.candidateType) a.set[`parties.${role}.candidateType`] = health.candidateType;
  if (health.candidateType === 'relay') a.set.relayUsed = true;
  if (typeof health.rtt === 'number') a.rtt.push(health.rtt);
  if (typeof health.loss === 'number') a.loss.push(health.loss);
  a.dirty = true;
  if (Date.now() - a.lastFlush > FLUSH_EVERY_MS) flush(sessionId, null);
}

/**
 * Events the browser reports (POST /api/sessions/:id/call-events).
 * @param {{type:string, at?:string|Date, data?:object}[]} events
 */
function noteEvents(sessionId, role, events, { client, mode } = {}) {
  const a = acc(String(sessionId));
  let flushNow = false;
  if (client) {
    for (const k of ['browser', 'os', 'appVersion']) if (client[k]) a.set[`parties.${role}.${k}`] = String(client[k]).slice(0, 60);
  }
  if (mode) a.set.mode = mode;
  for (const e of events) {
    const at = e.at ? new Date(e.at) : new Date();
    switch (e.type) {
      case 'join-attempt': a.inc.attempts = (a.inc.attempts || 0) + 1; if (!a.min.firstJoinAt || at < a.min.firstJoinAt) a.min.firstJoinAt = at; break;
      case 'connected':
        if (!a.min.connectedAt || at < a.min.connectedAt) a.min.connectedAt = at;
        if (!a.connectedFlushed) { flushNow = true; a.connectedFlushed = true; }
        if (e.data && typeof e.data.timeToConnectMs === 'number') a.set[`parties.${role}.timeToConnectMs`] = Math.round(e.data.timeToConnectMs);
        if (e.data && e.data.candidateType) a.set[`parties.${role}.candidateType`] = e.data.candidateType;
        if (e.data && e.data.candidateType === 'relay') a.set.relayUsed = true;
        break;
      case 'reconnected': a.inc.reconnects = (a.inc.reconnects || 0) + 1; break;
      case 'ice-restart': a.inc.iceRestarts = (a.inc.iceRestarts || 0) + 1; break;
      case 'server-restart': a.inc.serverRestarts = (a.inc.serverRestarts || 0) + 1; break;
      case 'rejoin': a.inc.attempts = (a.inc.attempts || 0) + 1; break;
      case 'failed': case 'media-error': case 'device-lost': case 'ice-stuck': case 'ice-gave-up':
        a.failures.push({ at, party: role, reason: e.type === 'failed' ? String((e.data && e.data.reason) || 'failed').slice(0, 60) : e.type, detail: String((e.data && e.data.detail) || '').slice(0, 200) });
        if (Date.now() - a.lastFailureFlush > FAILURE_FLUSH_GAP_MS) { flushNow = true; a.lastFailureFlush = Date.now(); }
        break;
      default: break;
    }
  }
  a.dirty = true;
  if (flushNow) return flush(sessionId, null);
  return Promise.resolve();
}

/** Saves for one call run one after another, so they can't land out of order. */
const saving = new Map(); // sessionId -> promise of the last save

function flush(sessionId, endReason) {
  const id = String(sessionId);
  const prev = saving.get(id) || Promise.resolve();
  const next = prev.then(() => save(id, endReason));
  saving.set(id, next);
  next.then(() => { if (saving.get(id) === next) saving.delete(id); });
  return next;
}

async function save(sessionId, endReason) {
  const id = String(sessionId);
  const a = pending.get(id);
  if (!a && !endReason) return;
  const CallLog = require('../../models/callLog');
  const update = { $setOnInsert: {} };
  const set = { ...(a ? a.set : {}) };
  if (endReason) { set.endedAt = new Date(); set.endReason = endReason; }
  if (Object.keys(set).length) update.$set = set;
  // First join / first connected: the earliest wins, across flushes.
  if (a && Object.keys(a.min).length) update.$min = { ...a.min };
  if (a && Object.keys(a.inc).length) update.$inc = { ...a.inc };
  // Running totals, so the average covers the whole call (a per-save
  // average used to overwrite the one before); the worst loss wins.
  if (a && a.rtt.length) update.$inc = { ...(update.$inc || {}), 'quality.samples': a.rtt.length, 'quality.rttSumMs': Math.round(a.rtt.reduce((x, y) => x + y, 0)) };
  if (a && a.loss.length) update.$max = { 'quality.lossPct': Math.max(...a.loss) };
  if (a && a.failures.length) update.$push = { failures: { $each: a.failures, $slice: -50 } };
  if (a) {
    a.inc = {}; a.min = {}; a.set = {}; a.failures = []; a.rtt = []; a.loss = []; a.dirty = false; a.lastFlush = Date.now();
  }
  if (endReason) pending.delete(id);
  try {
    const Session = require('../../models/session');
    const s = await Session.findById(id).select('doctorId patientId').lean();
    update.$setOnInsert = { doctorId: s ? s.doctorId : null, patientId: s ? s.patientId : null };
    await CallLog.updateOne({ sessionId: id }, update, { upsert: true });
  } catch (err) {
    logger.warn('Could not save call statistics', { sessionId: id.substring(0, 8), error: err.message });
  }
}

async function flushAll(reason) {
  await Promise.all([...pending.keys()].map((id) => flush(id, null)));
  if (reason === 'server-restart') pending.clear();
}

function _reset() { pending.clear(); saving.clear(); }

module.exports = { noteHealth, noteEvents, flush, flushAll, EVENT_TYPES, _reset };
