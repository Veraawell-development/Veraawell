/**
 * Who is in a session's call, and when — the record the session rules read.
 *
 * Every join opens an interval and every leave closes it, on
 * `session.attendance`. The source today is the video socket (join-room,
 * leave-room, disconnect); with LiveKit it becomes LiveKit's own join/leave
 * webhooks. Either way the rules in services/sessionPolicy.js see the same
 * shape, and only this module writes it.
 *
 * Never touches status or paymentStatus — those change only through
 * services/sessionTransition.applyTransition. What this module does keep up to
 * date besides the intervals:
 *
 *   - doctorJoined / patientJoined and their timestamps (first join only),
 *     which payouts and older code still read;
 *   - effectiveEndsAt, which moves later when the doctor's first join was
 *     late (the patient keeps their full minutes).
 *
 * All writes are single atomic updates with the expected state in the filter,
 * so two tabs, a retried webhook or a join racing a leave cannot open two
 * intervals for one person or lose a close.
 */

const Session = require('../models/session');
const policy = require('./sessionPolicy');
const { createLogger } = require('../utils/logger');

const logger = createLogger('ATTENDANCE');

const ROLES = Object.freeze(['patient', 'doctor']);
const LIVE_STATUSES = Object.freeze(['scheduled', 'active']);
/** Plenty for real use (a join and a leave per drop); bounds a pathological loop. */
const MAX_INTERVALS = 200;

const short = (id) => String(id).substring(0, 8);

function assertRole(role) {
  if (!ROLES.includes(role)) throw new Error(`attendance: unknown role "${role}"`);
}

const FIELDS = 'patientId doctorId status paymentStatus startsAt endsAt duration effectiveEndsAt timezone sessionDate sessionTime attendance doctorJoined doctorJoinedAt patientJoined patientJoinedAt';

function emitter(io) {
  if (!io) return null;
  const SocketEmitter = require('../utils/socketEmitter');
  return new SocketEmitter(io);
}

/**
 * Recompute when the session really ends; store it if it moved. Returns the
 * session as reloaded, with `timingChanged`.
 */
async function refreshEffectiveEnd(sessionId) {
  const session = await Session.findById(sessionId).select(FIELDS).lean();
  if (!session) return { session: null, timingChanged: false };
  const computed = policy.effectiveEndsAt(session);
  const stored = session.effectiveEndsAt ? new Date(session.effectiveEndsAt) : new Date(session.endsAt);
  if (computed.getTime() === stored.getTime()) return { session, timingChanged: false };
  await Session.updateOne({ _id: sessionId }, { $set: { effectiveEndsAt: computed } });
  return { session: { ...session, effectiveEndsAt: computed }, timingChanged: true };
}

function notify(io, session, { timingChanged, at }) {
  const emit = emitter(io);
  if (!emit || !session) return;
  const parties = [String(session.patientId), String(session.doctorId)];
  const sessionId = String(session._id);
  emit.emitToUsers(parties, 'session:attendance', {
    sessionId,
    present: {
      patient: policy.isPresent(session, 'patient', at),
      doctor: policy.isPresent(session, 'doctor', at)
    },
    at
  });
  if (timingChanged) {
    emit.emitToUsers(parties, 'session:timing', {
      sessionId,
      effectiveEndsAt: session.effectiveEndsAt,
      serverNow: new Date()
    });
  }
}

/**
 * Someone came into the call. A no-op if they already have an open stay
 * (a second tab, a repeated webhook), or if the session is no longer live.
 *
 * @returns {Promise<{ opened: boolean }>}
 */
async function recordJoin(sessionId, role, { at = new Date(), source, io = null } = {}) {
  assertRole(role);

  // A session already under way when attendance started being recorded has
  // only the legacy first-join timestamp. Carry it over as a stay up to now,
  // so a reconnect after the release isn't mistaken for a late first join
  // (which would move the end and could count a punctual doctor as late).
  await Session.updateOne(
    {
      _id: sessionId,
      status: { $in: LIVE_STATUSES },
      attendance: { $not: { $elemMatch: { role } } },
      [`${role}JoinedAt`]: { $lt: at }
    },
    [{
      $set: {
        attendance: {
          $concatArrays: [
            { $ifNull: ['$attendance', []] },
            [{ role, joinedAt: `$${role}JoinedAt`, leftAt: at, source: 'backfill' }]
          ]
        }
      }
    }]
  );

  const opened = await Session.updateOne(
    {
      _id: sessionId,
      status: { $in: LIVE_STATUSES },
      attendance: { $not: { $elemMatch: { role, leftAt: null } } }
    },
    {
      $push: {
        attendance: { $each: [{ role, joinedAt: at, leftAt: null, source }], $slice: -MAX_INTERVALS }
      }
    }
  );

  // First join: the flags older code and payouts read. Separate, conditional
  // write so a later join never moves the original timestamp.
  await Session.updateOne(
    { _id: sessionId, [`${role}Joined`]: { $ne: true }, status: { $in: LIVE_STATUSES } },
    { $set: { [`${role}Joined`]: true, [`${role}JoinedAt`]: at } }
  );

  if (opened.modifiedCount === 0) return { opened: false };

  const { session, timingChanged } = await refreshEffectiveEnd(sessionId);
  logger.info('joined', { sessionId: short(sessionId), role, source });
  notify(io, session, { timingChanged, at });
  return { opened: true };
}

/**
 * Someone left the call. Closes their open stay; a no-op if they have none.
 * A leave stamped before the open stay began (an out-of-order webhook) is
 * ignored rather than producing a negative interval.
 *
 * @returns {Promise<{ closed: boolean }>}
 */
async function recordLeave(sessionId, role, { at = new Date(), source, io = null } = {}) {
  assertRole(role);
  const closed = await Session.updateOne(
    { _id: sessionId, attendance: { $elemMatch: { role, leftAt: null, joinedAt: { $lte: at } } } },
    { $set: { 'attendance.$[open].leftAt': at } },
    { arrayFilters: [{ 'open.role': role, 'open.leftAt': null, 'open.joinedAt': { $lte: at } }] }
  );
  if (closed.modifiedCount === 0) return { closed: false };

  logger.info('left', { sessionId: short(sessionId), role, source });
  const session = await Session.findById(sessionId).select(FIELDS).lean();
  notify(io, session, { timingChanged: false, at });
  return { closed: true };
}

/** Close every open stay — the room has closed, or the session has ended. */
async function closeAll(sessionId, { at = new Date() } = {}) {
  // $elemMatch, not 'attendance.leftAt': null — that also matches a session
  // with no attendance at all (null matches a missing path), and the array
  // update below then fails on it.
  const result = await Session.updateOne(
    { _id: sessionId, attendance: { $elemMatch: { leftAt: null } } },
    { $set: { 'attendance.$[open].leftAt': at } },
    { arrayFilters: [{ 'open.leftAt': null }] }
  );
  return { closed: result.modifiedCount > 0 };
}

/**
 * After a restart nobody is really in a socket room — rooms live in memory —
 * so open stays recorded by the socket before the restart are closed at the
 * boot instant. The people still in the call reconnect within seconds and
 * open fresh stays. LiveKit stays are not touched: LiveKit's rooms don't
 * restart with this server.
 */
async function closeStaleSocketStays({ bootAt = new Date() } = {}) {
  const result = await Session.updateMany(
    { attendance: { $elemMatch: { source: 'socket', leftAt: null, joinedAt: { $lt: bootAt } } } },
    { $set: { 'attendance.$[stale].leftAt': bootAt } },
    { arrayFilters: [{ 'stale.source': 'socket', 'stale.leftAt': null, 'stale.joinedAt': { $lt: bootAt } }] }
  );
  if (result.modifiedCount > 0) {
    logger.info('closed socket stays left open by the previous process', { sessions: result.modifiedCount });
  }
  return result.modifiedCount;
}

/** The stays and who is in right now. */
async function snapshot(sessionId, now = new Date()) {
  const session = await Session.findById(sessionId).select(FIELDS).lean();
  if (!session) return null;
  return {
    attendance: session.attendance || [],
    present: {
      patient: policy.isPresent(session, 'patient', now),
      doctor: policy.isPresent(session, 'doctor', now)
    }
  };
}

module.exports = {
  MAX_INTERVALS,
  recordJoin,
  recordLeave,
  closeAll,
  closeStaleSocketStays,
  snapshot,
  refreshEffectiveEnd
};
