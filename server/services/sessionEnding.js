/**
 * How a session ends early: only when both people agree.
 *
 * docs/SESSION_RULES.md, D8. Leaving the call never ends a session — that is
 * what let one person complete a session a minute in, paying the doctor and
 * costing the patient their session. Ending early is a request from one side
 * and a yes from the other:
 *
 *   requestEnd   stamps `endConsent` and asks the other person;
 *   respondToEnd the other person's yes completes the session (CONSENT_END in
 *                services/sessionState.js); a no clears the request.
 *
 * A request lapses after END_REQUEST_MINUTES. Both the HTTP endpoints and the
 * call socket's request-end-session / confirm-end-session events come here,
 * so an older app still in someone's tab gets the same rules.
 *
 * Also owns what happens once a call is over for good — the doctor's session
 * summary email — because every path that completes a session (time up,
 * agreement, the end-of-day sweep) has to send it, and the endpoint that used
 * to send it, POST /complete, no longer completes anything.
 */

const Session = require('../models/session');
const policy = require('./sessionPolicy');
const attendance = require('./attendance');
const { applyTransition } = require('./sessionTransition');
const { EVENT, LIVE_STATUSES } = require('./sessionState');
const { END_REQUEST_MINUTES } = require('../config/time');
const { ConflictError, NotFoundError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SESSION-ENDING');

const REQUEST_MS = END_REQUEST_MINUTES * 60 * 1000;
const otherRole = (role) => (role === 'doctor' ? 'patient' : 'doctor');
const short = (id) => String(id).substring(0, 8);

const FIELDS = 'patientId doctorId status paymentStatus paymentId price refundAmount startsAt endsAt duration effectiveEndsAt timezone sessionDate sessionTime attendance doctorJoined doctorJoinedAt patientJoined patientJoinedAt endConsent';

function load(sessionId) {
  return Session.findById(sessionId).select(FIELDS).lean();
}

function isFresh(consent, now) {
  return !!(consent && consent.requestedBy && consent.requestedAt)
    && now.getTime() - new Date(consent.requestedAt).getTime() <= REQUEST_MS;
}

/**
 * Where events go. The call screen listens on the video socket's room (the
 * session id); dashboards listen on /data. `except` keeps an event from
 * echoing back to the socket that caused it.
 */
function channels(io, session, except) {
  const sessionId = String(session._id);
  const userRoom = { patient: String(session.patientId), doctor: String(session.doctorId) };
  let emit = null;
  if (io) {
    const SocketEmitter = require('../utils/socketEmitter');
    emit = new SocketEmitter(io);
  }
  return {
    room(event, data) {
      if (!io) return;
      const target = except ? io.to(sessionId).except(except) : io.to(sessionId);
      target.emit(event, data);
    },
    user(role, event, data) {
      if (emit) emit.emitToUser(userRoom[role], event, { sessionId, ...data });
    },
    both(event, data) {
      if (emit) emit.emitToUsers([userRoom.patient, userRoom.doctor], event, { sessionId, ...data });
    }
  };
}

/**
 * Ask the other person to end the session now.
 *
 * Both have to be in the call: with nobody to ask, the right action is
 * Leave, which ends nothing. If the other person has already asked, this is
 * their answer — two people pressing End at the same moment agree.
 *
 * @returns {Promise<{ ended: boolean, expiresAt?: Date }>}
 */
async function requestEnd(sessionId, role, { now = new Date(), io = null, except = null } = {}) {
  const session = await load(sessionId);
  if (!session) throw new NotFoundError('Session');
  if (!LIVE_STATUSES.includes(session.status)) throw new ConflictError('This session has already ended.');

  const other = otherRole(role);
  if (isFresh(session.endConsent, now) && session.endConsent.requestedBy === other) {
    return respondToEnd(sessionId, role, true, { now, io, except });
  }
  if (!policy.isPresent(session, role, now)) {
    throw new ConflictError('Join the call first.');
  }
  if (!policy.isPresent(session, other, now)) {
    throw new ConflictError("The other person isn't in the call — use Leave instead. You can rejoin while the session is on.");
  }

  const written = await Session.updateOne(
    { _id: session._id, status: { $in: LIVE_STATUSES } },
    { $set: { endConsent: { requestedBy: role, requestedAt: now, agreedAt: null } } }
  );
  if (written.modifiedCount === 0) throw new ConflictError('This session has already ended.');

  const expiresAt = new Date(now.getTime() + REQUEST_MS);
  const ch = channels(io, session, except);
  ch.room('request-end-session', { requestedByRole: role, expiresAt });
  ch.user(other, 'session:end-requested', { by: role, expiresAt });
  logger.info('end requested', { sessionId: short(sessionId), by: role });
  return { ended: false, expiresAt };
}

/**
 * The other person's answer. Yes completes the session; no clears the
 * request and the call carries on.
 *
 * @returns {Promise<{ ended: boolean, alreadyEnded?: boolean }>}
 */
async function respondToEnd(sessionId, role, agree, { now = new Date(), io = null, except = null } = {}) {
  const session = await load(sessionId);
  if (!session) throw new NotFoundError('Session');

  // A double click, or both people answering at once.
  if (session.status === 'completed' && session.endConsent && session.endConsent.agreedAt) {
    return { ended: true, alreadyEnded: true };
  }
  if (!LIVE_STATUSES.includes(session.status)) throw new ConflictError('This session has already ended.');

  const consent = session.endConsent || {};
  if (!consent.requestedBy || consent.requestedBy === role) {
    throw new ConflictError("There's no request to end this session.");
  }
  if (!isFresh(consent, now)) throw new ConflictError('That request to end the session has expired.');

  const ch = channels(io, session, except);

  if (!agree) {
    await Session.updateOne(
      { _id: session._id, 'endConsent.requestedAt': consent.requestedAt },
      { $set: { endConsent: { requestedBy: null, requestedAt: null, agreedAt: null } } }
    );
    ch.room('confirm-end-session', { agree: false, confirmedByRole: role });
    ch.user(consent.requestedBy, 'session:end-declined', { by: role });
    logger.info('end declined', { sessionId: short(sessionId), by: role });
    return { ended: false };
  }

  const result = await applyTransition(session, {
    event: EVENT.CONSENT_END,
    actor: role,
    now,
    // The request we checked is the one still standing.
    extraFilter: { 'endConsent.requestedAt': consent.requestedAt },
    extraSet: {
      'endConsent.agreedAt': now,
      outcome: { code: policy.OUTCOME.ENDED_BY_CONSENT, decidedAt: now, by: role, note: null },
      callStatus: 'completed',
      callEndTime: now,
      actualDuration: policy.minutesTogether(session, now)
    }
  });
  if (!result.changed) return { ended: true, alreadyEnded: true };

  await attendance.closeAll(session._id, { at: now });
  ch.room('confirm-end-session', { agree: true, confirmedByRole: role });
  ch.room('session-ended', { reason: 'consent' });
  ch.both('session:ended', { reason: 'consent', status: 'completed' });
  logger.info('ended by agreement', { sessionId: short(sessionId), agreedBy: role });

  await sendCompletionSummary(session._id);
  return { ended: true };
}

/**
 * The doctor's "session complete — ₹X earned" email. Best effort: a session
 * is over whether or not the email goes out.
 */
async function sendCompletionSummary(sessionId) {
  try {
    const session = await Session.findById(sessionId)
      .populate('patientId', 'firstName lastName')
      .populate('doctorId', 'firstName lastName email')
      .lean();
    if (!session || session.status !== 'completed' || !session.doctorId || !session.doctorId.email) return;

    const DoctorProfile = require('../models/doctorProfile');
    const PlatformSettings = require('../models/platformSettings');
    const { formatForDisplay } = require('../utils/zonedTime');
    const { resolveStartsAt } = require('./sessionTime');
    const emailService = require('./email.service');

    const [settings, profile] = await Promise.all([
      PlatformSettings.getSettings(),
      DoctorProfile.findOne({ userId: session.doctorId._id }).select('customFeePercentage').lean()
    ]);
    const feePercent = profile && profile.customFeePercentage != null
      ? profile.customFeePercentage
      : settings.defaultPlatformFeePercentage;

    await emailService.sendDoctorSessionSummaryEmail(session.doctorId.email, {
      doctorName: `${session.doctorId.firstName} ${session.doctorId.lastName}`,
      patientName: session.patientId ? `${session.patientId.firstName} ${session.patientId.lastName}` : 'your patient',
      date: formatForDisplay(resolveStartsAt(session), session.timezone),
      duration: session.duration,
      price: session.price,
      platformFee: session.platformFee,
      earnings: session.doctorEarnings,
      feePercent
    });
  } catch (err) {
    logger.warn('session summary email failed', { sessionId: short(sessionId), error: err.message });
  }
}

module.exports = { requestEnd, respondToEnd, sendCompletionSummary };
