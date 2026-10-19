/**
 * Money arriving, money not arriving, and money leaving outside the app.
 *
 * WHY THIS EXISTS
 *
 * A payment can be reported three ways — the patient's browser calling
 * POST /api/payments/verify, Razorpay's `payment.captured` webhook, and the
 * expiry sweep asking Razorpay directly — and all three used to write
 * `paymentStatus = 'paid'; save()` after checking only `!== 'paid'`. So:
 *
 *   - verify and the webhook, landing together, both passed the check and
 *     both sent the confirmation emails and rang the doctor twice;
 *   - a capture that arrived after the checkout had expired and its slot had
 *     been released brought the cancelled session back to `scheduled` with no
 *     slot held, so the slot could be sold twice;
 *   - a refund issued from the Razorpay dashboard was written straight onto
 *     the session whatever its state, leaving a live, joinable booking marked
 *     refunded.
 *
 * Everything here goes through applyTransition, so each of those is a
 * compare-and-set with the invariants checked, and side effects run only for
 * the caller whose write actually changed something.
 */

const Session = require('../models/session');
const DoctorAvailability = require('../models/doctorAvailability');
const SocketEmitter = require('../utils/socketEmitter');
const { applyTransition } = require('./sessionTransition');
const { EVENT, ACTOR, STATUS, PAYMENT, LIVE_STATUSES, isTerminalStatus } = require('./sessionState');
const { executeClaimedRefund } = require('./sessionRefund');
const { deriveFields } = require('./sessionTime');
const { getRazorpay } = require('./razorpay.client');
const { PLATFORM_TIMEZONE, INSTANT_ACCEPT_WINDOW_MINUTES, CHECKOUT_TTL_MINUTES } = require('../config/time');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SESSION-PAYMENT');

const MINUTE_MS = 60 * 1000;

/**
 * A checkout older than this is expired even if Razorpay cannot be asked
 * about it. Below it, an unanswered question means "try again next sweep":
 * expiring a checkout whose payment is in flight turns a booking into a
 * refund.
 */
const CHECKOUT_HARD_EXPIRY_MINUTES = 24 * 60;

function shortId(id) {
  return String(id).substring(0, 8);
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Release the calendar slot a session holds, if it holds one.
 *
 * Instant sessions never reserve a slot, so a miss for them is expected and
 * not worth a warning.
 */
async function releaseSessionSlot(session) {
  if (!session || session.sessionType === 'immediate') return false;
  try {
    const avail = await DoctorAvailability.findOne({ doctorId: session.doctorId._id || session.doctorId });
    if (!avail || !session.localDate || !session.localTime) return false;
    const released = await avail.releaseSlot(session.localDate, session.localTime, session._id);
    if (!released) {
      logger.warn('Slot release matched nothing', { sessionId: shortId(session._id) });
    }
    return released;
  } catch (err) {
    logger.warn('Slot release failed', { sessionId: shortId(session._id), error: err.message });
    return false;
  }
}

/**
 * The patient–doctor conversation, created when a booking is confirmed.
 *
 * It used to be created when checkout opened, before payment, so closing the
 * Razorpay window still left a working chat with the doctor. Best effort: a
 * booking stands whether or not this succeeds (the chat page creates it on
 * demand for a paid relationship too).
 */
async function openConversation(patientId, doctorId, sessionId) {
  try {
    const Conversation = require('../models/conversation');
    await Conversation.findOrCreateConversation(patientId, doctorId, sessionId);
  } catch (err) {
    logger.warn('Conversation creation failed', { sessionId: shortId(sessionId), error: err.message });
  }
}

/** Ring the doctor and email both parties. Only for the write that confirmed the booking. */
async function notifyBooked(session, io) {
  const populated = await Session.findById(session._id)
    .populate('patientId', 'firstName lastName email')
    .populate('doctorId', 'firstName lastName email');
  if (!populated) return null;

  const patientId = String(populated.patientId._id || populated.patientId);
  const doctorId = String(populated.doctorId._id || populated.doctorId);
  await openConversation(patientId, doctorId, populated._id);

  if (io) {
    new SocketEmitter(io).emitToUsers([patientId, doctorId], 'session:booked', {
      session: populated,
      patientId,
      doctorId,
      sessionId: String(populated._id),
      // Carried explicitly so the doctor's countdown never has to guess how
      // long the request has been in flight.
      acceptanceDeadline: populated.acceptanceDeadline || null,
      timestamp: new Date()
    });
  }

  const emailService = require('./email.service');
  const type = populated.sessionType === 'immediate' ? 'Immediate' : 'Regular';
  const date = formatDate(populated.sessionDate);
  try {
    if (populated.patientId && populated.patientId.email) {
      await emailService.sendBookingConfirmationEmail(populated.patientId.email, {
        date,
        time: populated.sessionTime,
        type,
        doctorName: `${populated.doctorId.firstName} ${populated.doctorId.lastName}`,
        duration: populated.duration,
        price: populated.price
      });
    }
    if (populated.doctorId && populated.doctorId.email) {
      await emailService.sendDoctorNewBookingEmail(populated.doctorId.email, {
        doctorName: `${populated.doctorId.firstName} ${populated.doctorId.lastName}`,
        patientName: `${populated.patientId.firstName} ${populated.patientId.lastName}`,
        date,
        time: populated.sessionTime,
        duration: populated.duration,
        type,
        doctorEarnings: populated.doctorEarnings
      });
    }
  } catch (err) {
    logger.warn('Booking confirmation email failed', { sessionId: shortId(populated._id), error: err.message });
  }

  return populated;
}

/**
 * A second, different payment captured against an order that is already
 * settled. Razorpay allows it (a patient paying twice from two tabs), and
 * the session can only absorb one — so the other goes straight back. A
 * payment cannot be over-refunded, so a redelivery of this is harmless.
 */
async function refundStrayPayment(paymentId, amount, reason) {
  try {
    const refund = await getRazorpay().payments.refund(paymentId, {
      amount: Math.round(amount * 100),
      speed: 'normal',
      notes: { reason }
    });
    logger.warn('Refunded a stray payment', { paymentId, refundId: refund.id });
    return { refunded: true, refundId: refund.id };
  } catch (err) {
    logger.error('Could not refund a stray payment — refund it from the Razorpay dashboard', {
      paymentId, error: err.message
    });
    return { refunded: false, error: err };
  }
}

/**
 * Record that a payment for this session was captured.
 *
 * @param {object} args
 * @param {object|string} args.session   document or id
 * @param {string} args.paymentId        Razorpay payment id
 * @param {string} args.actor            ACTOR.SYSTEM (verify, sweep) | ACTOR.RAZORPAY (webhook)
 * @param {object} [args.io]             Socket.IO server, for the ring
 * @returns {Promise<{outcome:'confirmed'|'already-confirmed'|'late-capture-refunded'|'late-capture-refund-failed'|'stray-payment'|'not-found', session:object|null}>}
 */
async function confirmPayment({ session: sessionOrId, paymentId, actor, io = null, now = new Date() }) {
  const id = (sessionOrId && sessionOrId._id) ? sessionOrId._id : sessionOrId;
  const session = await Session.findById(id);
  if (!session) return { outcome: 'not-found', session: null };

  if (session.paymentId && session.paymentId === paymentId && session.paymentStatus !== PAYMENT.PENDING) {
    return { outcome: 'already-confirmed', session };
  }

  // ── The booking was already resolved without this money ─────────────────
  if (isTerminalStatus(session.status)) {
    if (session.paymentStatus === PAYMENT.FAILED) {
      // The checkout expired (or was abandoned) and its slot has been given
      // back, so the booking cannot be revived — the slot may already belong
      // to someone else. Claim the refund in the same write that records the
      // payment, then send it.
      const claim = await applyTransition(session, {
        event: EVENT.LATE_CAPTURE,
        actor,
        payload: { paymentId, refundAmount: session.price }
      });
      if (!claim.changed) return { outcome: 'already-confirmed', session: claim.session };

      logger.warn('Payment captured after the checkout expired — refunding', { sessionId: shortId(id) });
      const result = await executeClaimedRefund(claim.session, {
        amount: session.price,
        reason: 'Payment captured after the booking had expired'
      });
      return {
        outcome: result.refunded ? 'late-capture-refunded' : 'late-capture-refund-failed',
        session: result.session
      };
    }
    await refundStrayPayment(paymentId, session.price, `Session ${id} already ${session.status}`);
    return { outcome: 'stray-payment', session };
  }

  if (session.paymentStatus === PAYMENT.PAID && session.paymentId !== paymentId) {
    await refundStrayPayment(paymentId, session.price, `Duplicate payment for session ${id}`);
    return { outcome: 'stray-payment', session };
  }

  // ── The normal case ──────────────────────────────────────────────────────
  const extraSet = {};
  if (session.sessionType === 'immediate') {
    // The clock on an instant request starts when it is PAID, not when it
    // was created: the patient may have sat on the Razorpay page for a
    // minute, and neither the doctor's window nor the patient's booked
    // minutes should lose it. Absolute, so every reader agrees.
    Object.assign(extraSet, deriveFields(now, session.duration || 20, session.timezone || PLATFORM_TIMEZONE));
    extraSet.acceptanceDeadline = new Date(now.getTime() + INSTANT_ACCEPT_WINDOW_MINUTES * MINUTE_MS);

    // Whether anyone is listening has to be sampled with the write, or the
    // sweep cannot later tell a doctor who ignored a ring from one who never
    // received it.
    const doctorId = String(session.doctorId);
    if (io && new SocketEmitter(io).hasListener(doctorId)) {
      extraSet.ringDeliveredAt = now;
    } else {
      logger.warn('Instant request has no live doctor socket to ring', { sessionId: shortId(id) });
    }
  }

  const result = await applyTransition(session, {
    event: EVENT.PAYMENT_VERIFIED,
    actor,
    payload: { paymentId },
    extraSet,
    now
  });

  if (!result.changed) {
    // Someone else confirmed it first. They own the notifications.
    return { outcome: 'already-confirmed', session: result.session };
  }

  logger.info('Payment confirmed', { sessionId: shortId(id), actor });
  const populated = await notifyBooked(result.session, io);
  return { outcome: 'confirmed', session: populated || result.session };
}

/**
 * Give up on a checkout that was never paid, and free its slot.
 *
 * Asks Razorpay first. The webhook is the normal way a payment arrives, but a
 * webhook can be late or lost; expiring a checkout that was in fact paid
 * turns a booking into a refund the patient did not ask for.
 */
async function expireCheckout(session, { now = new Date(), io = null } = {}) {
  const ageMinutes = (now.getTime() - new Date(session.createdAt).getTime()) / MINUTE_MS;

  if (session.razorpayOrderId) {
    try {
      const result = await getRazorpay().orders.fetchPayments(session.razorpayOrderId);
      const items = (result && result.items) || [];
      const captured = items.find((p) => p.status === 'captured');
      if (captured) {
        const confirmed = await confirmPayment({ session, paymentId: captured.id, actor: ACTOR.SYSTEM, io, now });
        return { outcome: `captured:${confirmed.outcome}` };
      }
      if (items.some((p) => p.status === 'authorized') && ageMinutes < CHECKOUT_HARD_EXPIRY_MINUTES) {
        return { outcome: 'awaiting-capture' };
      }
    } catch (err) {
      if (ageMinutes < CHECKOUT_HARD_EXPIRY_MINUTES) {
        logger.warn('Could not ask Razorpay about an unpaid checkout — will retry', {
          sessionId: shortId(session._id), error: err.message
        });
        return { outcome: 'gateway-unavailable' };
      }
    }
  }

  const expired = await applyTransition(session, {
    event: EVENT.CHECKOUT_EXPIRED,
    actor: ACTOR.SYSTEM,
    payload: { cancelledBy: 'system' },
    // Recorded so every screen says "Payment not completed" — without it the
    // row read "Cancelled — no refund", as if the patient had lost money.
    extraSet: { outcome: { code: 'checkout_abandoned', by: 'system', decidedAt: now } },
    now
  });
  if (!expired.changed) return { outcome: 'noop' };

  await releaseSessionSlot(expired.session);
  logger.info('Unpaid checkout expired', { sessionId: shortId(session._id) });
  return { outcome: 'expired' };
}

/**
 * The scheduler's half: every open checkout older than CHECKOUT_TTL_MINUTES.
 *
 * Also picks up the rows the old `payment.failed` handler left behind, which
 * flipped paymentStatus to 'failed' but left status at 'payment_pending' —
 * a combination no other sweep matched, so their slots were held forever.
 */
async function expireStaleCheckouts({ now = new Date(), io = null } = {}) {
  const cutoff = new Date(now.getTime() - CHECKOUT_TTL_MINUTES * MINUTE_MS);
  const stale = await Session.find({
    status: STATUS.PAYMENT_PENDING,
    paymentStatus: { $in: [PAYMENT.PENDING, PAYMENT.FAILED] },
    createdAt: { $lte: cutoff }
  }).limit(200);

  let expired = 0;
  for (const session of stale) {
    try {
      const result = await expireCheckout(session, { now, io });
      if (result.outcome === 'expired') expired += 1;
    } catch (err) {
      logger.error('Checkout expiry failed', { sessionId: shortId(session._id), error: err.message });
    }
  }
  return expired;
}

/**
 * Razorpay reports a refund (`refund.processed`) — possibly one this app did
 * not make, issued from the dashboard.
 *
 * A refunded booking cannot stay live, so a live one is cancelled (and its
 * slot freed) before the refund is recorded: the transition table only
 * accepts money events on a terminal session, for exactly this reason.
 *
 * @returns {Promise<{outcome:string, session:object|null}>}
 */
async function observeRefund(refund, { io = null } = {}) {
  let session = await Session.findOne({ paymentId: refund.payment_id });
  if (!session) return { outcome: 'no-session', session: null };

  if (session.status === STATUS.PAYMENT_PENDING) {
    logger.error('Refund reported for a session still awaiting payment', { sessionId: shortId(session._id) });
    return { outcome: 'ignored', session };
  }

  if (LIVE_STATUSES.includes(session.status)) {
    const cancelled = await applyTransition(session, {
      event: EVENT.CANCEL,
      actor: ACTOR.ADMIN,
      payload: { cancelledBy: 'admin' }
    });
    session = cancelled.session;
    if (cancelled.changed) {
      await releaseSessionSlot(session);
      if (io) {
        new SocketEmitter(io).emitToUsers(
          [String(session.patientId), String(session.doctorId)],
          'session:cancelled',
          { sessionId: String(session._id), cancelledBy: 'admin', refundAmount: refund.amount / 100, timestamp: new Date() }
        );
      }
      logger.warn('A refund issued outside the app cancelled a live booking', { sessionId: shortId(session._id) });
    }
  }

  const result = await applyTransition(session, {
    event: EVENT.REFUND_OBSERVED,
    actor: ACTOR.RAZORPAY,
    payload: {
      refundId: refund.id,
      refundAmount: refund.amount / 100,
      refundedAt: refund.created_at ? new Date(refund.created_at * 1000) : new Date()
    }
  });

  return { outcome: result.changed ? 'recorded' : 'already-recorded', session: result.session };
}

module.exports = {
  openConversation,
  confirmPayment,
  expireCheckout,
  expireStaleCheckouts,
  observeRefund,
  releaseSessionSlot,
  CHECKOUT_HARD_EXPIRY_MINUTES
};
