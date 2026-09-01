/**
 * The five questions the codebase asks about "when is this session".
 *
 * Every `new Date(session.sessionDate); d.setHours(h, m)` site is replaced by
 * exactly one call here, so session-time semantics live in one greppable
 * place instead of being re-derived (differently) in nine.
 *
 * The sites this replaces, and what each of them got wrong by using the
 * server's local offset against a UTC-stored date:
 *
 *   session.controller bookSession    "cannot book in the past" — off by the
 *                                     server/IST offset, so a slot up to 5.5h
 *                                     in the past was bookable
 *   session.controller cancelSession  hoursUntil -> the refund TIER. A patient
 *                                     cancelling 25h out could be charged the
 *                                     4-24h 50% rate, or vice versa.
 *   adminPayments adminRefundSession  same calculation, same error
 *   models/session canJoin()          the 15-minute join window
 *   models/session sessionEndTime     displayed end time
 *   models/session isUpcoming()
 *   scheduler runSessionStatusUpdate  no-show sweep
 *   scheduler notification windows    additionally mixed UTC day boundaries
 *                                     with local setHours, so sessions in the
 *                                     00:00-05:30 IST band were never queried
 *                                     and never got a reminder
 */

const { zonedToUtc, utcToZoned, to12hSlot, formatForDisplay, formatTimeForDisplay } = require('../utils/zonedTime');
const {
  PLATFORM_TIMEZONE, JOIN_LEAD_MINUTES, JOIN_GRACE_MINUTES
} = require('../config/time');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SESSION-TIME');

const MINUTE_MS = 60 * 1000;

/**
 * The authoritative UTC instant a session starts.
 *
 * Prefers the stored `startsAt`. During the migration window it falls back to
 * deriving one from the legacy (sessionDate, sessionTime) pair, interpreting
 * the time as PLATFORM_TIMEZONE wall clock — which is what the doctor's
 * availability grid and the patient's booking screen both meant.
 *
 * @param {object} session
 * @returns {Date}
 */
function resolveStartsAt(session) {
  if (!session) throw new Error('sessionTime: no session given');
  if (session.startsAt) {
    return session.startsAt instanceof Date ? session.startsAt : new Date(session.startsAt);
  }

  // Legacy derivation. Logged at debug rather than warn because during the
  // backfill window this is expected; once `startsAt` is required it becomes
  // unreachable.
  const zone = session.timezone || PLATFORM_TIMEZONE;
  const rawDate = session.sessionDate instanceof Date
    ? session.sessionDate
    : new Date(session.sessionDate);

  if (Number.isNaN(rawDate.getTime())) {
    throw new Error(`sessionTime: session ${session._id} has no usable date`);
  }

  // An immediate session stored `new Date()` — a real instant, not a calendar
  // date at UTC midnight. Its sessionTime is redundant and (before this change)
  // was generated from getUTCHours(), so re-deriving from it would corrupt the
  // value. Detect it by the presence of a time component.
  const isInstant = rawDate.getUTCHours() !== 0
    || rawDate.getUTCMinutes() !== 0
    || rawDate.getUTCSeconds() !== 0;
  if (isInstant) return rawDate;

  const localDate = rawDate.toISOString().slice(0, 10);
  try {
    return zonedToUtc(localDate, session.sessionTime, zone);
  } catch (err) {
    logger.warn('Could not derive startsAt from legacy fields; using the raw date', {
      sessionId: session._id ? String(session._id).slice(0, 8) : undefined,
      sessionTime: session.sessionTime,
      error: err.message
    });
    return rawDate;
  }
}

/** The UTC instant a session ends. */
function resolveEndsAt(session) {
  if (session && session.endsAt) {
    return session.endsAt instanceof Date ? session.endsAt : new Date(session.endsAt);
  }
  const minutes = (session && session.duration) || 60;
  return new Date(resolveStartsAt(session).getTime() + minutes * MINUTE_MS);
}

/**
 * Hours from `now` until the session starts. Negative once it has started.
 * This is the input to services/refundPolicy.calculateRefund, so an error
 * here is a money error.
 */
function hoursUntilStart(session, now = new Date()) {
  return (resolveStartsAt(session).getTime() - now.getTime()) / (60 * MINUTE_MS);
}

/** `{ opensAt, closesAt }` — the interval in which a call may be joined. */
function joinWindow(session) {
  return {
    opensAt: new Date(resolveStartsAt(session).getTime() - JOIN_LEAD_MINUTES * MINUTE_MS),
    closesAt: new Date(resolveEndsAt(session).getTime() + JOIN_GRACE_MINUTES * MINUTE_MS)
  };
}

function isWithinJoinWindow(session, now = new Date()) {
  const { opensAt, closesAt } = joinWindow(session);
  return now >= opensAt && now <= closesAt;
}

/** Has the session's end time passed? */
function hasElapsed(session, now = new Date()) {
  return now.getTime() >= resolveEndsAt(session).getTime();
}

function hasStarted(session, now = new Date()) {
  return now.getTime() >= resolveStartsAt(session).getTime();
}

/**
 * Derive every stored representation from an instant.
 * Used by the model's pre-save hook so the fields cannot drift apart.
 */
function deriveFields(startsAt, durationMinutes = 60, zone = PLATFORM_TIMEZONE) {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const { localDate, localTime } = utcToZoned(start, zone);
  return {
    startsAt: start,
    endsAt: new Date(start.getTime() + durationMinutes * MINUTE_MS),
    timezone: zone,
    localDate,
    localTime,
    // Legacy display fields, kept in sync for one release. sessionTime is the
    // 12-hour form because slot identity in DoctorAvailability uses it.
    sessionDate: new Date(`${localDate}T00:00:00.000Z`),
    sessionTime: to12hSlot(localTime)
  };
}

/** The shape the API sends for a session's timing. */
function serializeTiming(session, zone = PLATFORM_TIMEZONE) {
  const startsAt = resolveStartsAt(session);
  const endsAt = resolveEndsAt(session);
  const tz = session.timezone || zone;
  const { localDate, localTime } = utcToZoned(startsAt, tz);
  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone: tz,
    localDate,
    localTime,
    // Pre-formatted, pinned to the platform zone. The browser would otherwise
    // render the ISO instant in the viewer's own zone — a patient abroad would
    // see a 9:00 AM IST session as 3:30 AM.
    displayTime: formatTimeForDisplay(startsAt, tz),
    displayDateTime: formatForDisplay(startsAt, tz)
  };
}

module.exports = {
  resolveStartsAt,
  resolveEndsAt,
  hoursUntilStart,
  joinWindow,
  isWithinJoinWindow,
  hasElapsed,
  hasStarted,
  deriveFields,
  serializeTiming
};
