/**
 * Deciding what a session finally was, and acting on it.
 *
 * The rules are in services/sessionPolicy.js (pure); this module applies them
 * to the database, the money and the people (docs/SESSION_RULES.md):
 *
 *   runOutcomeSweep    a session whose time is over (+ 10 minutes) becomes
 *                      completed or a no-show; a therapist who never came, or
 *                      nobody coming at all, refunds the patient in full;
 *                      the doctor's late / no-show counters move; both are told.
 *   claimAbsentRefund  "Leave & full refund" — the patient left waiting on
 *                      their own for the therapist.
 *
 * Every state change goes through applyTransition (compare-and-set), every
 * refund through sessionRefund (its own claim), and the counters and emails
 * only follow a transition this call won — so two sweeps, or a sweep racing
 * the patient's own claim, act once.
 */

const Session = require('../models/session');
const policy = require('./sessionPolicy');
const attendance = require('./attendance');
const doctorCounters = require('./doctorCounters');
const { applyTransition, tryTransition } = require('./sessionTransition');
const { EVENT, ACTOR, LIVE_STATUSES } = require('./sessionState');
const { refundSession } = require('./sessionRefund');
const { resolveEndsAt, resolveStartsAt } = require('./sessionTime');
const { NO_SHOW_GRACE_MINUTES } = require('../config/time');
const { ConflictError } = require('../utils/errors');
const { formatForDisplay, formatTimeForDisplay } = require('../utils/zonedTime');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SESSION-OUTCOMES');

const MINUTE_MS = 60 * 1000;
const LOOKBACK_DAYS = 30;
const SWEEP_BATCH = 200;
const { OUTCOME } = policy;

const short = (id) => String(id).substring(0, 8);

/** Why money went back, as recorded with the refund. */
const REFUND_REASON = Object.freeze({
  [OUTCOME.DOCTOR_NO_SHOW]: 'Therapist did not join the session',
  [OUTCOME.NOBODY_CAME]: 'Nobody joined the session',
  [OUTCOME.DOCTOR_ABSENT_REFUND]: 'Therapist did not join; the patient left after waiting'
});

function emitter(io) {
  if (!io) return null;
  const SocketEmitter = require('../utils/socketEmitter');
  return new SocketEmitter(io);
}

function tellBoth(io, session, event, data) {
  const emit = emitter(io);
  if (!emit) return;
  emit.emitToUsers([String(session.patientId._id || session.patientId), String(session.doctorId._id || session.doctorId)],
    event, { sessionId: String(session._id), ...data });
}

/* ───────────────────────────── outcome emails ──────────────────────────── */

const REFUND_TIMING = 'It goes back to your original payment method, usually within 5–7 working days.';
const SUPPORT_LINE = 'If something went wrong on our side, write to support@veraawell.com.';

/** The words for each outcome, per recipient. Null means no email. */
function outcomeMessage(code, role, { patientName, price, doctorEarnings }) {
  if (role === 'patient') {
    switch (code) {
      case OUTCOME.DOCTOR_NO_SHOW:
        return {
          subject: "Your session didn't happen — full refund on its way",
          title: "Your therapist didn't join",
          paragraphs: ["Your therapist didn't join your session, so we're refunding you in full.", REFUND_TIMING],
          amountLabel: 'Refund', amount: price
        };
      case OUTCOME.NOBODY_CAME:
        return {
          subject: 'Session missed — full refund on its way',
          title: 'Nobody joined the session',
          paragraphs: ["Neither you nor your therapist joined the session, so we're refunding you in full.", REFUND_TIMING],
          amountLabel: 'Refund', amount: price
        };
      case OUTCOME.PATIENT_NO_SHOW:
        return {
          subject: 'We missed you today',
          title: 'We missed you today',
          paragraphs: [
            "Your therapist waited for you, but you didn't join the session.",
            "As our refund policy says, a missed session isn't refunded. You can book another session whenever you're ready."
          ]
        };
      case OUTCOME.DOCTOR_ABSENT_REFUND:
        return {
          subject: "Refund on its way — your therapist didn't join",
          title: 'Your refund is on its way',
          paragraphs: ["Your therapist didn't join, so you left the session and we're refunding you in full.", REFUND_TIMING],
          amountLabel: 'Refund', amount: price
        };
      default:
        return null;
    }
  }
  switch (code) {
    case OUTCOME.PATIENT_NO_SHOW:
      return {
        subject: "Your patient didn't join — you'll be paid",
        title: "Your patient didn't join",
        paragraphs: [`${patientName} didn't join the session.`, "You'll be paid your share of it in your weekly payout."],
        amountLabel: 'Your earnings', amount: doctorEarnings
      };
    case OUTCOME.DOCTOR_NO_SHOW:
    case OUTCOME.NOBODY_CAME:
      return {
        subject: "Session refunded — you didn't join",
        title: 'Session refunded',
        paragraphs: [`You didn't join your session with ${patientName}, so the patient has been refunded in full.`, SUPPORT_LINE]
      };
    case OUTCOME.DOCTOR_ABSENT_REFUND:
      return {
        subject: 'Session refunded — your patient left after waiting',
        title: 'Session refunded',
        paragraphs: [
          `${patientName} waited for you and, after 10 minutes on their own, left with a full refund.`,
          SUPPORT_LINE
        ]
      };
    default:
      return null;
  }
}

/** Best effort: an outcome stands whether or not its emails go out. */
async function sendOutcomeEmails(sessionId, code) {
  try {
    const session = await Session.findById(sessionId)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email')
      .lean();
    if (!session) return;
    const emailService = require('./email.service');
    const start = resolveStartsAt(session);
    const when = `${formatForDisplay(start, session.timezone)} (${session.duration} min)`;
    const patientName = session.patientId ? `${session.patientId.firstName} ${session.patientId.lastName || ''}`.trim() : 'Your patient';
    const facts = { patientName, price: session.price, doctorEarnings: session.doctorEarnings };

    for (const role of ['patient', 'doctor']) {
      const person = role === 'patient' ? session.patientId : session.doctorId;
      const message = outcomeMessage(code, role, facts);
      if (!message || !person || !person.email) continue;
      // eslint-disable-next-line no-await-in-loop
      await emailService.sendSessionOutcomeEmail(person.email, {
        ...message,
        recipientName: role === 'doctor' ? `${person.firstName} ${person.lastName || ''}`.trim() : person.firstName,
        doctor: role === 'doctor',
        when
      });
    }
  } catch (err) {
    logger.warn('outcome emails failed', { sessionId: short(sessionId), code, error: err.message });
  }
}

/* ───────────────────────────── the sweep ───────────────────────────────── */

/**
 * Every live session whose real end (effectiveEndsAt, or the booked end) was
 * more than NO_SHOW_GRACE_MINUTES ago, decided by the rules.
 *
 * @returns {Promise<number>} sessions decided by this run
 */
async function runOutcomeSweep({ now = new Date(), io = null } = {}) {
  const sweepBefore = new Date(now.getTime() - NO_SHOW_GRACE_MINUTES * MINUTE_MS);
  const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * MINUTE_MS);

  const due = await Session.find({
    status: { $in: LIVE_STATUSES },
    endsAt: { $gte: cutoff },
    $or: [
      { effectiveEndsAt: null, endsAt: { $lte: sweepBefore } },
      { effectiveEndsAt: { $lte: sweepBefore } }
    ]
  }).limit(SWEEP_BATCH);

  let decided = 0;
  for (const session of due) {
    // A legacy row whose stored end disagrees with its other fields.
    if ((session.effectiveEndsAt || resolveEndsAt(session)) > sweepBefore) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      if (await decide(session, { now, io })) decided += 1;
    } catch (err) {
      // One bad row must not stop the rest.
      logger.error('could not decide a session', { sessionId: short(session._id), error: err.message, stack: err.stack });
    }
  }
  if (decided > 0) logger.info('outcome sweep complete', { decided });
  return decided;
}

async function decide(session, { now, io }) {
  const outcome = policy.finalOutcome(session);
  const swept = await tryTransition(session, {
    event: EVENT.SWEEP_ELAPSED,
    actor: ACTOR.SYSTEM,
    now,
    extraSet: {
      outcome: { code: outcome.code, decidedAt: now, by: 'system', note: null },
      graceCheckedAt: now,
      graceResult: policy.classifyAtGrace(session),
      ...(outcome.code === OUTCOME.COMPLETED
        ? { callStatus: 'completed', actualDuration: policy.minutesTogether(session, now) }
        : {})
    }
  });
  if (!swept.changed) return false;

  logger.info('session-outcome', {
    sessionId: short(session._id), code: outcome.code, refund: outcome.refund, counter: outcome.counter
  });
  await attendance.closeAll(session._id, { at: now });

  let current = swept.session;
  if (outcome.refund === 'full' && current.paymentStatus === 'paid') {
    const refund = await refundSession(current, {
      actor: ACTOR.SYSTEM,
      amount: current.price,
      reason: REFUND_REASON[outcome.code]
    });
    if (refund.session) current = refund.session;
    if (refund.failed) {
      logger.error('Automatic refund failed; it is in the admin retry queue', { sessionId: short(session._id) });
    }
  }

  if (outcome.counter) await doctorCounters.increment(session.doctorId, outcome.counter, { now });

  if (outcome.code === OUTCOME.COMPLETED) {
    await require('./sessionEnding').sendCompletionSummary(session._id);
  } else {
    await sendOutcomeEmails(session._id, outcome.code);
  }
  tellBoth(io, current, 'session:ended', { reason: outcome.code, status: current.status });
  return true;
}

/* ─────────────────────────── "Leave & full refund" ─────────────────────── */

/**
 * The waiting patient leaves and takes a full refund (docs/SESSION_RULES.md,
 * D3): the therapist never came and the grace is over, or came, left, and the
 * patient has been on their own for 10 minutes.
 *
 * Idempotent: a second press returns the first one's result.
 *
 * @returns {Promise<{ alreadyDone?: boolean, refundAmount: number, paymentStatus: string }>}
 * @throws {ConflictError} with the message the patient sees
 */
async function claimAbsentRefund(session, { now = new Date(), io = null } = {}) {
  if (session.status === 'cancelled' && session.outcome && session.outcome.code === OUTCOME.DOCTOR_ABSENT_REFUND) {
    return { alreadyDone: true, refundAmount: session.refundAmount || session.price, paymentStatus: session.paymentStatus };
  }
  if (!LIVE_STATUSES.includes(session.status)) throw new ConflictError(`This session is ${session.status}.`);
  if (session.paymentStatus !== 'paid') {
    throw new ConflictError("This session had no charge, so there's nothing to refund.");
  }

  const at = policy.doctorAbsentRefundAt(session, now);
  if (!at) {
    if (policy.isPresent(session, 'doctor', now)) throw new ConflictError('Your therapist is here now.');
    if (!policy.isPresent(session, 'patient', now)) throw new ConflictError('Join the session first.');
    throw new ConflictError("A refund isn't available for this session.");
  }
  if (at > now) {
    throw new ConflictError(`You can leave with a full refund at ${formatTimeForDisplay(at, session.timezone)} if your therapist still hasn't joined.`);
  }

  const cancelled = await applyTransition(session, {
    event: EVENT.DOCTOR_ABSENT_REFUND,
    actor: ACTOR.PATIENT,
    now,
    payload: { cancelledBy: 'patient' },
    extraSet: {
      outcome: { code: OUTCOME.DOCTOR_ABSENT_REFUND, decidedAt: now, by: 'patient', note: null },
      graceCheckedAt: now,
      graceResult: policy.classifyAtGrace(session)
    }
  });
  if (!cancelled.changed) {
    const current = cancelled.session;
    return { alreadyDone: true, refundAmount: current.refundAmount || current.price, paymentStatus: current.paymentStatus };
  }

  await attendance.closeAll(session._id, { at: now });
  let current = cancelled.session;
  const refund = await refundSession(current, {
    actor: ACTOR.PATIENT,
    amount: current.price,
    reason: REFUND_REASON[OUTCOME.DOCTOR_ABSENT_REFUND]
  });
  if (refund.session) current = refund.session;
  if (refund.failed) {
    logger.error('Absent-therapist refund failed; it is in the admin retry queue', { sessionId: short(session._id) });
  }

  await doctorCounters.increment(session.doctorId._id || session.doctorId, 'late', { now });
  await sendOutcomeEmails(session._id, OUTCOME.DOCTOR_ABSENT_REFUND);

  // `cancelledBy` is the patient's id, like every other cancellation, so the
  // patient's own screens know it was theirs and stay quiet; the message is
  // for the doctor.
  const message = 'Your patient left after waiting for you, and the session was refunded.';
  tellBoth(io, current, 'session:cancelled', {
    status: 'cancelled', cancelledBy: String(session.patientId._id || session.patientId), refundAmount: current.price, message
  });
  // Anyone on the call screen (a therapist arriving right now) is told too.
  if (io) io.to(String(session._id)).emit('session-ended', { reason: OUTCOME.DOCTOR_ABSENT_REFUND });
  logger.info('absent-refund-claimed', { sessionId: short(session._id) });

  return { refundAmount: current.price, paymentStatus: current.paymentStatus };
}

module.exports = { runOutcomeSweep, claimAbsentRefund, sendOutcomeEmails, outcomeMessage };
