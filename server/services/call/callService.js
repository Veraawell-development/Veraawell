/**
 * Calls, server side (signalling v2 — socket/call.socket.js is the thin
 * socket layer over this).
 *
 * The media goes browser to browser; this only introduces the two browsers to
 * each other and keeps track of who is in the call. What it fixes over the
 * first version (socket/video.socket.js, kept for one release as v1):
 *
 *  - A network blip was "the other person left": the call was torn down and
 *    attendance closed at once. Now a dropped connection gets a grace period
 *    (CALL_GRACE_MS, 25 s); the other side sees "reconnecting", and only if
 *    the person is still gone after it — and quiet for 45 s — are they marked
 *    as having left, at the time they were last heard from.
 *  - Joining did 6–9 database round trips before the socket was allowed to
 *    signal, so messages sent right after a reconnect were refused and lost.
 *    Now one read (the policy check), then the socket is in; the writes
 *    follow, in order, per session.
 *  - Signals went to everyone in the room (a second tab answered offers it
 *    should not have). Now they go to the other person's current socket
 *    only; a newer tab takes over and the older one is told so. Signals for
 *    someone who is reconnecting wait in a small outbox.
 *  - Each pairing of the two browsers has an epoch; a signal from an older
 *    pairing (a refreshed tab) is dropped instead of confusing the new one.
 *  - Calls survive our server restarting: the browsers keep talking, the
 *    server says "restarting", and attendance is settled after boot only for
 *    whoever did not come back (attendance.settleStaleStays).
 *  - A session that is cancelled, refunded or completed throws its sockets
 *    out of the call (evict, called from sessionTransition).
 *
 * State is in memory (one instance — render.yaml numInstances: 1). Media-
 * health heartbeats cost no database writes.
 */

const Session = require('../../models/session');
const { createLogger } = require('../../utils/logger');
const { grantRoom, revokeRoom } = require('../../authz/socket');
const { LIVE_STATUSES } = require('../sessionState');
const { resolveEndsAt } = require('../sessionTime');
const policy = require('../sessionPolicy');
const attendance = require('../attendance');

const logger = createLogger('CALL');
const short = (id) => String(id).substring(0, 8);

const CALL_PROTOCOL = 2;
const MIN_CALL_PROTOCOL = 2;
const graceMs = () => Number(process.env.CALL_GRACE_MS) || 25 * 1000;
const quietMs = () => Number(process.env.CALL_QUIET_MS) || 45 * 1000;
const HEARTBEAT_MS = 15 * 1000;
const TIMER_SYNC_EVERY_TICKS = 5;
const TIMING_REREAD_MS = 60 * 1000;
const OUTBOX_MAX = 64;
const OUTBOX_MAX_BYTES = 64 * 1024;
const OUTBOX_MAX_AGE_MS = 30 * 1000;

let io = null;
const rooms = new Map();      // sessionId -> room
const writeQueues = new Map(); // sessionId -> Promise (serial writes per session)
let ticker = null;
let ticks = 0;
let draining = false;

/* ─────────────────────────────── plumbing ──────────────────────────────── */

function init(socketIo) {
  io = socketIo;
}

function socketById(id) {
  return io && id ? io.sockets.sockets.get(id) : null;
}

/** Run `job` after the previous write for this session — never concurrently. */
function queueWrite(sessionId, job) {
  const prev = writeQueues.get(sessionId) || Promise.resolve();
  const next = prev.then(job).catch((err) => {
    logger.error('Call write failed', { sessionId: short(sessionId), error: err.message });
  });
  writeQueues.set(sessionId, next);
  next.then(() => { if (writeQueues.get(sessionId) === next) writeQueues.delete(sessionId); });
  return next;
}

function endOf(session) {
  if (session.effectiveEndsAt) return new Date(session.effectiveEndsAt);
  try { return resolveEndsAt(session); } catch (e) { return null; }
}

function peerOf(room, userId) {
  for (const party of room.parties.values()) if (party.userId !== userId) return party;
  return null;
}

function publicPeer(party) {
  if (!party) return { present: false, connection: 'absent' };
  return {
    userId: party.userId,
    role: party.role,
    present: true,
    connection: party.connection,
    instanceId: party.instanceId,
    media: party.media
  };
}

function emitTo(party, event, payload) {
  if (!party || !party.socketId || party.connection !== 'connected') return false;
  const s = socketById(party.socketId);
  if (!s) return false;
  s.emit(event, payload);
  return true;
}

function timerPayload(room, now = new Date()) {
  return {
    endsAt: room.endsAt,
    serverNow: now,
    remainingSeconds: room.endsAt ? Math.max(0, Math.round((room.endsAt.getTime() - now.getTime()) / 1000)) : null
  };
}

/* ─────────────────────────────────── join ──────────────────────────────── */

/**
 * A socket joins the call. `session` is the record the policy check already
 * loaded (ctx.resource) — no further read before the socket is let in.
 *
 * @returns {Promise<object>} the ack
 */
async function join(socket, session, { instanceId, protocol, client }) {
  const sessionId = String(session._id);
  const userId = String(socket.actor.id);
  const role = String(session.doctorId) === userId ? 'doctor' : 'patient';

  if (draining) return { ok: false, code: 'SERVER_RESTARTING', message: 'Veraawell is restarting — reconnecting in a moment.', retryable: true };
  if (!(protocol >= MIN_CALL_PROTOCOL)) {
    socket.emit('call:please-refresh', { code: 'PROTOCOL_OUTDATED' });
    return { ok: false, code: 'PROTOCOL_OUTDATED', message: 'Veraawell has been updated. Please refresh this page.', retryable: false };
  }
  if (!['paid', 'not_required'].includes(session.paymentStatus)) {
    return { ok: false, code: 'NOT_PAID', message: 'This session has not been paid for yet.', retryable: false };
  }
  if (!LIVE_STATUSES.includes(session.status)) {
    return { ok: false, code: 'CLOSED', message: `This session is ${session.status} and can no longer be joined.`, retryable: false };
  }
  const { isWithinJoinWindow, deriveFields } = require('../sessionTime');
  if (session.sessionType !== 'immediate' && !isWithinJoinWindow(session)) {
    return { ok: false, code: 'NOT_YET', message: 'This session can be joined from 15 minutes before its start time.', retryable: true };
  }

  // Joining IS accepting an instant request (same compare-and-set as
  // POST /accept and the v1 join; see video.socket.js for the history).
  if (role === 'doctor' && session.sessionType === 'immediate' && session.acceptanceStatus !== 'accepted') {
    const { PLATFORM_TIMEZONE } = require('../../config/time');
    const now = new Date();
    const accepted = await Session.findOneAndUpdate(
      { _id: session._id, status: 'active', acceptanceStatus: { $in: ['pending', 'delayed'] } },
      { $set: { acceptanceStatus: 'accepted', acceptanceDeadline: null, ...deriveFields(now, session.duration || 20, session.timezone || PLATFORM_TIMEZONE) } },
      { new: true }
    );
    if (!accepted) return { ok: false, code: 'WITHDRAWN', message: 'This request is no longer waiting — it was withdrawn or has expired.', retryable: false };
    session = accepted;
  }

  // The socket may have gone while we were checking: nothing granted yet,
  // so nothing to undo — no ghost member.
  if (!socket.connected) return { ok: false, code: 'GONE', message: 'Disconnected', retryable: true };

  const { room, party, epochChanged } = attach(socket, session, { userId, role, instanceId, client });

  // The other person's v1 tab (an old build) can't talk to this one.
  const v1 = require('../../socket/video.socket');
  if (typeof v1.v1SocketsInRoom === 'function') {
    const stale = v1.v1SocketsInRoom(sessionId).filter((sid) => sid !== socket.id);
    if (stale.length) {
      for (const sid of stale) {
        const s = socketById(sid);
        if (s) s.emit('error', { message: 'Veraawell has been updated. Please refresh this page to continue your call.' });
      }
      socket.emit('call:peer-outdated', { sessionId });
    }
  }

  const peer = peerOf(room, userId);
  const ack = {
    ok: true,
    callId: sessionId,
    epoch: room.epoch,
    self: { userId, role, polite: role === 'patient' },
    peer: publicPeer(peer),
    endsAt: room.endsAt,
    serverNow: new Date(),
    pendingAccept: room.pendingAccept,
    heartbeatMs: HEARTBEAT_MS,
    timerSyncMs: TIMER_SYNC_EVERY_TICKS * 1000,
    protocol: CALL_PROTOCOL
  };

  // Tell the other person (after the ack is built; delivery order on one
  // socket is preserved, so the peer learns of us before any of our signals).
  if (peer) emitTo(peer, 'call:peer', { ...publicPeer(party), epoch: room.epoch, reason: epochChanged ? 'new-instance' : 'joined' });
  flushOutbox(room, party);
  ensureTicker();

  // The writes, after the person is already in (serial per session). A
  // rejoin while the stay is still open — a blip, a refresh, our restart —
  // writes nothing.
  const hasOpenStay = (session.attendance || []).some((a) => a.role === role && !a.leftAt);
  // Stamped now, not when the queued write runs: a leave right after the join
  // is stamped first, and a join written later than it was refused the leave
  // (the stay stayed open — "still in the call").
  const joinedAt = new Date();
  queueWrite(sessionId, async () => {
    if (!session.callStatus || session.callStatus === 'not-started' || session.callStatus === 'paused') {
      await Session.updateOne({ _id: session._id, status: { $in: LIVE_STATUSES } }, { $set: { callStatus: 'in-progress', callStartTime: new Date() } });
    }
    if (!hasOpenStay) {
      await attendance.recordJoin(session._id, role, { at: joinedAt, source: 'socket', io });
      await refreshTiming(sessionId); // a late doctor's first join moves the end
    }
  });
  if (room.endsAt && !room.pendingAccept) emitToRoom(room, 'timer-sync', timerPayload(room));

  logger.info('call-join', { sessionId: short(sessionId), role, epoch: room.epoch, peer: peer ? peer.connection : 'absent' });
  return ack;
}

/**
 * Put this socket into the room as the user's current connection (in memory,
 * no awaits). An older socket of the same user is superseded.
 */
function attach(socket, session, { userId, role, instanceId, client }) {
  const sessionId = String(session._id);
  let room = rooms.get(sessionId);
  if (!room) {
    room = {
      sessionId,
      epoch: Date.now(),
      endsAt: endOf(session),
      pendingAccept: session.sessionType === 'immediate' && session.acceptanceStatus !== 'accepted',
      parties: new Map(),
      outbox: new Map(),
      ended: false,
      timeUpFired: false,
      lastTimingRead: Date.now()
    };
    rooms.set(sessionId, room);
  }

  // A fresher read than the room's (e.g. the doctor's join just accepted an
  // instant request the patient was waiting on): its clock starts now.
  if (room.pendingAccept && !(session.sessionType === 'immediate' && session.acceptanceStatus !== 'accepted')) {
    room.pendingAccept = false;
    room.endsAt = endOf(session);
  }

  let party = room.parties.get(userId);
  let epochChanged = false;
  if (party) {
    if (party.graceTimer) { clearTimeout(party.graceTimer); party.graceTimer = null; }
    if (party.socketId && party.socketId !== socket.id) {
      const old = socketById(party.socketId);
      if (old && old.connected && party.instanceId !== instanceId) old.emit('call:superseded', { sessionId });
      if (old) { revokeRoom(old, sessionId); old.leave(sessionId); if (old.data) old.data.call = null; }
    }
    if (party.instanceId !== instanceId) {
      epochChanged = true;
      room.epoch = Math.max(Date.now(), room.epoch + 1);
      room.outbox.delete(userId); // signals for the old page are useless
      const peer = peerOf(room, userId);
      if (peer) room.outbox.delete(peer.userId); // and so are the peer's queued ones for us
    }
  } else {
    party = { userId, role, media: { audio: true, video: true }, health: null };
    room.parties.set(userId, party);
    if (room.parties.size === 2) room.epoch = Math.max(Date.now(), room.epoch + 1);
    epochChanged = room.parties.size === 2;
  }
  Object.assign(party, {
    socketId: socket.id,
    instanceId,
    connection: 'connected',
    lastActivityAt: Date.now(),
    client: client || party.client || null
  });

  grantRoom(socket, sessionId, { role });
  socket.join(sessionId);
  socket.data.call = { sessionId, userId, role };
  if (!socket.data.activityHooked && socket.conn && typeof socket.conn.on === 'function') {
    socket.data.activityHooked = true;
    socket.conn.on('packet', () => markActivity(socket));
  }
  return { room, party, epochChanged };
}

function markActivity(socket) {
  const c = socket.data && socket.data.call;
  if (!c) return;
  const room = rooms.get(c.sessionId);
  const party = room && room.parties.get(c.userId);
  if (party && party.socketId === socket.id) party.lastActivityAt = Date.now();
}

/* ───────────────────────────── signalling ───────────────────────────────── */

/**
 * Relay an offer/answer/candidate to the other person's current socket, or
 * keep it for them if they are reconnecting.
 */
function signal(socket, { sessionId, epoch, description, candidate }) {
  const room = rooms.get(sessionId);
  const me = room && room.parties.get(String(socket.actor.id));
  if (!room || !me || me.socketId !== socket.id) return { ok: false, code: 'NOT_IN_CALL', message: 'Join the call first.' };
  if (epoch !== room.epoch) return { ok: false, code: 'STALE_EPOCH', epoch: room.epoch, message: 'The call was re-established; using the newer connection.' };
  me.lastActivityAt = Date.now();
  const peer = peerOf(room, me.userId);
  const message = { from: { userId: me.userId, role: me.role, instanceId: me.instanceId }, epoch, ...(description !== undefined ? { description } : { candidate }) };
  if (peer && emitTo(peer, 'call:signal', message)) return { ok: true, delivered: true };

  // Not reachable right now: hold it (bounded) for when they reconnect.
  const key = peer ? peer.userId : '__peer__';
  const box = (room.outbox.get(key) || []).filter((m) => Date.now() - m.at < OUTBOX_MAX_AGE_MS);
  const size = JSON.stringify(message).length;
  const total = box.reduce((n, m) => n + m.size, 0);
  if (box.length >= OUTBOX_MAX || total + size > OUTBOX_MAX_BYTES) return { ok: false, code: 'OUTBOX_FULL', message: 'The other person is not reachable right now.' };
  box.push({ at: Date.now(), size, message });
  room.outbox.set(key, box);
  return { ok: true, queued: true };
}

function flushOutbox(room, party) {
  for (const key of [party.userId, '__peer__']) {
    const box = room.outbox.get(key);
    if (!box || !box.length) continue;
    // '__peer__' messages were sent before the other person had ever joined;
    // they are for whoever arrives, unless that is their own sender.
    const deliverable = box.filter((m) => Date.now() - m.at < OUTBOX_MAX_AGE_MS && m.message.epoch === room.epoch && m.message.from.userId !== party.userId);
    room.outbox.delete(key);
    for (const m of deliverable) emitTo(party, 'call:signal', m.message);
  }
}

function mediaState(socket, { sessionId, audio, video }) {
  const room = rooms.get(sessionId);
  const me = room && room.parties.get(String(socket.actor.id));
  if (!me) return { ok: false, code: 'NOT_IN_CALL' };
  me.media = { audio, video };
  emitTo(peerOf(room, me.userId), 'call:media', { userId: me.userId, audio, video });
  return { ok: true };
}

/** Media heartbeat: memory only (no database writes). */
function mediaHealth(socket, payload) {
  const room = rooms.get(payload.sessionId);
  const me = room && room.parties.get(String(socket.actor.id));
  if (!me) return { ok: false, code: 'NOT_IN_CALL' };
  me.lastActivityAt = Date.now();
  me.health = { at: Date.now(), audioFlowing: payload.audioFlowing, videoFlowing: payload.videoFlowing, candidateType: payload.candidateType || null, rtt: payload.rtt ?? null, loss: payload.loss ?? null, iceState: payload.iceState || null };
  try { require('./callTelemetry').noteHealth(payload.sessionId, me.role, me.health); } catch (e) { /* telemetry is optional */ }
  return { ok: true };
}

function prepData(socket, { sessionId, tags }) {
  const room = rooms.get(sessionId);
  const me = room && room.parties.get(String(socket.actor.id));
  if (!me) return { ok: false, code: 'NOT_IN_CALL' };
  emitTo(peerOf(room, me.userId), 'call:prep-data', { tags });
  return { ok: true };
}

/* ─────────────────────────── leaving & grace ──────────────────────────── */

/** The person pressed Leave: out now, no grace. */
async function leave(socket, { sessionId }) {
  const room = rooms.get(sessionId);
  const userId = String(socket.actor.id);
  const me = room && room.parties.get(userId);
  if (!me || me.socketId !== socket.id) return { ok: true };
  await removeParty(room, me, { at: new Date(), reason: 'left' });
  revokeRoom(socket, sessionId);
  socket.leave(sessionId);
  if (socket.data) socket.data.call = null;
  return { ok: true };
}

/**
 * The socket dropped. If it was the person's current connection, they get
 * a grace period before counting as gone. During a server shutdown nothing
 * is recorded at all — the next process carries the call on.
 */
function onDisconnect(socket) {
  const c = socket.data && socket.data.call;
  if (!c || draining) return;
  const room = rooms.get(c.sessionId);
  const party = room && room.parties.get(c.userId);
  if (!party || party.socketId !== socket.id) return; // superseded or already gone
  party.connection = 'reconnecting';
  emitTo(peerOf(room, party.userId), 'call:peer', { ...publicPeer(party), epoch: room.epoch, reason: 'reconnecting' });
  scheduleGrace(room, party, socket.id, graceMs());
}

function scheduleGrace(room, party, socketId, delay) {
  if (party.graceTimer) clearTimeout(party.graceTimer);
  party.graceTimer = setTimeout(() => {
    party.graceTimer = null;
    if (!rooms.has(room.sessionId) || party.socketId !== socketId || party.connection !== 'reconnecting') return;
    const quietFor = Date.now() - party.lastActivityAt;
    if (quietFor < quietMs()) return scheduleGrace(room, party, socketId, quietMs() - quietFor);
    removeParty(room, party, { at: new Date(party.lastActivityAt), reason: 'timeout' }).catch((err) => {
      logger.error('Could not finish a departure', { sessionId: short(room.sessionId), error: err.message });
    });
  }, delay);
  if (party.graceTimer.unref) party.graceTimer.unref();
}

/** Someone is gone: tell the other person, close their stay, maybe the room. */
async function removeParty(room, party, { at, reason }) {
  if (party.graceTimer) { clearTimeout(party.graceTimer); party.graceTimer = null; }
  room.parties.delete(party.userId);
  room.outbox.delete(party.userId);
  emitTo(peerOf(room, party.userId), 'call:peer-left', { userId: party.userId, role: party.role, reason });
  logger.info('call-leave', { sessionId: short(room.sessionId), role: party.role, reason });
  const sessionId = room.sessionId;
  await queueWrite(sessionId, async () => {
    await attendance.recordLeave(sessionId, party.role, { at, source: 'socket', io });
    if (reason === 'timeout') {
      await Session.updateOne({ _id: sessionId }, { $set: { [`callPresence.${party.role}LastSeenAt`]: at } });
    }
  });
  if (room.parties.size === 0) await closeRoom(room);
}

/** Empty: stop the clock and note how far the call got. */
async function closeRoom(room) {
  rooms.delete(room.sessionId);
  await queueWrite(room.sessionId, async () => {
    const s = await Session.findById(room.sessionId)
      .select('callStatus attendance doctorJoinedAt patientJoinedAt doctorJoined patientJoined startsAt endsAt duration timezone sessionDate sessionTime')
      .lean();
    if (s && s.callStatus === 'in-progress' && !rooms.has(room.sessionId)) {
      const now = new Date();
      await Session.updateOne(
        { _id: room.sessionId, status: { $in: LIVE_STATUSES }, callStatus: 'in-progress' },
        { $set: { callStatus: 'paused', callEndTime: now, actualDuration: policy.minutesTogether(s, now) } }
      );
    }
  });
  try { require('./callTelemetry').flush(room.sessionId, 'room-closed'); } catch (e) { /* optional */ }
}

/* ────────────────────────────── clock ─────────────────────────────────── */

function emitToRoom(room, event, payload) {
  for (const party of room.parties.values()) emitTo(party, event, payload);
}

async function refreshTiming(sessionId) {
  const room = rooms.get(sessionId);
  if (!room) return;
  const s = await Session.findById(sessionId)
    .select('effectiveEndsAt endsAt startsAt duration timezone sessionDate sessionTime sessionType acceptanceStatus status')
    .lean();
  if (!s) return;
  const before = room.endsAt ? room.endsAt.getTime() : null;
  room.endsAt = endOf(s);
  room.pendingAccept = s.sessionType === 'immediate' && s.acceptanceStatus !== 'accepted';
  room.lastTimingRead = Date.now();
  if (room.endsAt && room.endsAt.getTime() !== before && !room.pendingAccept) emitToRoom(room, 'timer-sync', timerPayload(room));
}

/** Pushed by attendance / accept when a session's end moves. */
function setTiming(sessionId, { endsAt, pendingAccept }) {
  const room = rooms.get(String(sessionId));
  if (!room) return;
  if (endsAt) room.endsAt = new Date(endsAt);
  if (pendingAccept !== undefined) room.pendingAccept = pendingAccept;
  if (room.endsAt && !room.pendingAccept) emitToRoom(room, 'timer-sync', timerPayload(room));
}

/**
 * The booked time is over. If the two were in the call together at some
 * point it is decided now, by the same code as the end-of-session sweep
 * (outcome, late counter, summary email) — the v1 clock completed it on a
 * weaker rule and skipped the counter. Anything else is the sweep's.
 */
async function onTimeUp(room) {
  room.timeUpFired = true;
  try {
    const s = await Session.findById(room.sessionId);
    if (s && LIVE_STATUSES.includes(s.status) && policy.everTogether(s)) {
      await require('../sessionOutcomes').decideSession(s, { now: new Date(), io });
    }
  } catch (err) {
    logger.error('Failed to finish a session whose time is up', { sessionId: short(room.sessionId), error: err.message });
  }
  emitToRoom(room, 'session-time-up', {});
}

function tick() {
  ticks += 1;
  const now = new Date();
  for (const room of rooms.values()) {
    if (Date.now() - room.lastTimingRead > TIMING_REREAD_MS) {
      room.lastTimingRead = Date.now();
      refreshTiming(room.sessionId).catch((err) => logger.warn('Could not re-read call timing', { error: err.message }));
    }
    if (room.pendingAccept || !room.endsAt || room.ended) continue;
    if (ticks % TIMER_SYNC_EVERY_TICKS === 0) emitToRoom(room, 'timer-sync', timerPayload(room, now));
    if (!room.timeUpFired && now >= room.endsAt) onTimeUp(room);
  }
  if (rooms.size === 0 && ticker) { clearInterval(ticker); ticker = null; }
}

function ensureTicker() {
  if (ticker) return;
  ticker = setInterval(tick, 1000);
  if (ticker.unref) ticker.unref();
}

/* ───────────────────────── eviction & shutdown ─────────────────────────── */

/**
 * The session is no longer live (cancelled, refunded, completed, no-show):
 * everyone out. Called from sessionTransition after the change is saved.
 */
function evict(sessionId, { reason = 'ended' } = {}) {
  const room = rooms.get(String(sessionId));
  if (!room || room.ended) return;
  room.ended = true;
  for (const party of room.parties.values()) {
    if (party.graceTimer) clearTimeout(party.graceTimer);
    const s = socketById(party.socketId);
    if (s) {
      s.emit('session-ended', { sessionId: room.sessionId, reason });
      revokeRoom(s, room.sessionId);
      s.leave(room.sessionId);
      if (s.data) s.data.call = null;
    }
  }
  rooms.delete(room.sessionId);
  require('../turnCredentials').revokeForSession(room.sessionId).catch(() => {});
  try { require('./callTelemetry').flush(room.sessionId, reason); } catch (e) { /* optional */ }
}

/**
 * SIGTERM: stop taking joins, tell everyone we're restarting (they keep
 * talking — the media doesn't go through us — and reconnect to the next
 * process), and save when each person was last heard from.
 */
async function prepareShutdown() {
  draining = true;
  const writes = [];
  for (const room of rooms.values()) {
    const reconnectAfterMs = 1000 + Math.floor(Math.random() * 5000);
    emitToRoom(room, 'call:server-restarting', { reconnectAfterMs });
    const set = {};
    for (const party of room.parties.values()) set[`callPresence.${party.role}LastSeenAt`] = new Date(party.lastActivityAt);
    if (Object.keys(set).length) writes.push(Session.updateOne({ _id: room.sessionId }, { $set: set }).catch(() => {}));
  }
  await Promise.all([...writes, ...writeQueues.values()]);
  try { await require('./callTelemetry').flushAll('server-restart'); } catch (e) { /* optional */ }
}

/* ─────────────────────────────── queries ──────────────────────────────── */

function isPresent(sessionId, role) {
  const room = rooms.get(String(sessionId));
  return !!room && [...room.parties.values()].some((p) => p.role === role);
}

function hasRoom(sessionId) {
  return rooms.has(String(sessionId));
}

function snapshot(sessionId) {
  const room = rooms.get(String(sessionId));
  if (!room) return null;
  return {
    epoch: room.epoch,
    endsAt: room.endsAt,
    parties: [...room.parties.values()].map((p) => ({ userId: p.userId, role: p.role, connection: p.connection, instanceId: p.instanceId, health: p.health }))
  };
}

/** Tests only. */
function _reset() {
  for (const room of rooms.values()) for (const p of room.parties.values()) if (p.graceTimer) clearTimeout(p.graceTimer);
  rooms.clear();
  writeQueues.clear();
  if (ticker) clearInterval(ticker);
  ticker = null;
  ticks = 0;
  draining = false;
}

/** Tests only: wait for the queued writes. */
async function _settled() {
  await Promise.all([...writeQueues.values()]);
}

module.exports = {
  CALL_PROTOCOL, MIN_CALL_PROTOCOL,
  init, join, signal, mediaState, mediaHealth, prepData, leave, onDisconnect,
  setTiming, refreshTiming, evict, prepareShutdown, isPresent, hasRoom, snapshot,
  _reset, _settled, _tick: tick
};
