/**
 * The one way to refund a session.
 *
 * WHY THIS EXISTS
 *
 * A refund is three steps that must happen in this order:
 *
 *   1. claim it        paid -> refund_pending
 *   2. call the gateway
 *   3. record the outcome   refund_pending -> refunded | refund_failed
 *
 * The order is the whole point. `refund_pending` is a mutual-exclusion claim:
 * whoever wins the compare-and-set in step 1 is the only caller that may make
 * the network call in step 2. Two requests arriving together — the patient
 * cancelling while the `refund.processed` webhook lands, say — cannot both
 * reach Razorpay, because the loser's transition collapses to a no-op.
 *
 * Every existing refund site got some part of this wrong:
 *
 *   - `_autoCancelUnacceptedSession` (session.controller.js) wrote
 *     `paymentStatus: 'refunded'` directly from `paid`, skipping the claim
 *     entirely and setting no `refundId` — a state invariant I7 forbids and
 *     which only survived because a raw `save()` bypassed assertInvariants.
 *   - `cancelSession` saved `refund_pending`, called the gateway, then
 *     mutated the document again — a read-modify-write around a network
 *     call, which let two concurrent cancels both refund.
 *   - `adminRefundSession` fabricated `refund_mock_<ts>` / `refund_zero_<ts>`
 *     ids for payments it decided not to send.
 *
 * All of them now refund through this module.
 *
 * Two non-obvious rules this encodes, both of which the transition table
 * enforces and neither of which is guessable from the call site:
 *
 *   - ANY actor may initiate a refund, but only SYSTEM (or the Razorpay
 *     webhook) may record its success, and only SYSTEM may record its
 *     failure. A patient-initiated cancellation that tried to complete its
 *     own refund as ACTOR.PATIENT would throw IllegalTransitionError.
 *   - If step 1 does not actually move the state — a free session, an
 *     already-refunded one, a repeat request — step 2 MUST NOT run. Calling
 *     the gateway anyway is how you refund twice.
 */

const { applyTransition } = require('./sessionTransition');
const { EVENT, ACTOR, PAYMENT } = require('./sessionState');
const { getRazorpay } = require('./razorpay.client');
const { isSyntheticPaymentId } = require('../config/payments');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SESSION-REFUND');

/**
 * Claim, call, record.
 *
 * @param {object|string} sessionOrId
 * @param {object}  args
 * @param {string}  args.actor    ACTOR.* — who is asking for the refund
 * @param {number}  args.amount   in rupees; must be > 0 and <= price (invariant I8)
 * @param {string}  args.reason   free text, sent to the gateway as a note
 * @returns {Promise<{refunded:boolean, skipped?:string, failed?:boolean, session:object|null, refundId?:string}>}
 */
async function refundSession(sessionOrId, { actor = ACTOR.SYSTEM, amount, reason = 'Refund' } = {}) {
  const Session = require('../models/session');
  const id = (sessionOrId && sessionOrId._id) ? sessionOrId._id : sessionOrId;
  const session = (sessionOrId && sessionOrId._id) ? sessionOrId : await Session.findById(id);
  if (!session) return { refunded: false, skipped: 'not-found', session: null };

  const short = String(id).substring(0, 8);

  // Nothing was ever captured, so there is nothing to send back. The
  // transition table would treat this as a no-op anyway; checking here keeps
  // the reason in the log rather than leaving a silent no-op.
  //
  // `refund_failed` is included deliberately: the table allows
  // refund_failed -> refund_pending for an admin or the system, which is what
  // the admin retry queue exists to do. Guarding on `paid` alone made every
  // failed refund permanently unretryable.
  const REFUNDABLE_FROM = [PAYMENT.PAID, PAYMENT.REFUND_FAILED];
  if (!REFUNDABLE_FROM.includes(session.paymentStatus)) {
    return { refunded: false, skipped: `paymentStatus=${session.paymentStatus}`, session };
  }
  if (!session.paymentId || isSyntheticPaymentId(session.paymentId)) {
    // Invariant I6: a refund requires a payment to refund. A synthetic id is
    // not one, and asking the gateway to reverse it would 400.
    logger.warn('Refusing to refund a session with no real payment', { sessionId: short, paymentId: session.paymentId });
    return { refunded: false, skipped: 'no-real-payment', session };
  }
  if (!(amount > 0)) {
    return { refunded: false, skipped: 'zero-amount', session };
  }

  // ── 1. Claim. Whoever wins this is the only caller that may hit the gateway.
  const claim = await applyTransition(session, {
    event: EVENT.REFUND_INITIATED,
    actor,
    payload: { refundAmount: amount }
  });

  if (!claim.changed) {
    // Someone else already holds the claim, or the session cannot be refunded
    // from its current state. Either way this caller must not call Razorpay.
    logger.info('Refund claim was a no-op; not calling the gateway', { sessionId: short, reason: claim.noopReason });
    return { refunded: false, skipped: 'claim-noop', session: claim.session };
  }

  return executeClaimedRefund(claim.session, { amount, reason });
}

/**
 * Steps 2 and 3 for a refund that is ALREADY claimed (refund_pending).
 *
 * Split out because a claim can be taken by something other than
 * refundSession: a payment captured after its checkout expired is claimed by
 * the LATE_CAPTURE transition itself (failed -> refund_pending), and still has
 * to reach the gateway exactly once. The caller must hold the claim — this
 * function does not take one.
 */
async function executeClaimedRefund(session, { amount, reason = 'Refund' } = {}) {
  const id = session._id;
  const short = String(id).substring(0, 8);

  // ── 2. The network call. The only step that is not atomic, deliberately
  //       sandwiched between two that are: a crash here leaves the session in
  //       refund_pending, which reconcileStuckRefund repairs by asking
  //       Razorpay what actually happened before trying again.
  let refund;
  try {
    refund = await getRazorpay().payments.refund(session.paymentId, {
      amount: Math.round(amount * 100),
      speed: 'normal',
      notes: { reason, sessionId: String(id) }
    });
  } catch (err) {
    const message = gatewayErrorMessage(err);
    logger.error('Gateway refund failed', { sessionId: short, error: message });
    // ACTOR.SYSTEM, not `actor`: the table only lets the system record a
    // failure, because a failure is an observation rather than a request.
    const failed = await applyTransition(id, {
      event: EVENT.REFUND_FAILED,
      actor: ACTOR.SYSTEM,
      payload: { reason: message }
    });
    // Someone must look: the failed-refunds queue used to fill up unseen. The
    // patient's own email (cancellation / outcome) already says it's delayed.
    require('./email.service').sendAdminAlertEmail('A refund failed', [
      `Razorpay refused a refund of ${require('../utils/money').inr(amount)}: ${message}.`,
      'It is in the failed-refunds queue (admin console → Revenue). Retry it there once the cause is fixed.'
    ], { rows: [['Session', String(id)]] }).catch(() => {});
    return { refunded: false, failed: true, session: failed.session, error: err };
  }

  // ── 3. Record it. Again SYSTEM: only the system and the webhook may.
  const done = await applyTransition(id, {
    event: EVENT.REFUND_SUCCEEDED,
    actor: ACTOR.SYSTEM,
    payload: { refundId: refund.id, refundAmount: amount }
  });

  logger.info('Refund completed', { sessionId: short, refundId: refund.id, amount });
  return { refunded: true, session: done.session, refundId: refund.id };
}

/**
 * Razorpay SDK errors carry the useful text in `error.description`, not
 * `message`. Kept short: it is stored on the session for the admin screen.
 */
function gatewayErrorMessage(err) {
  const described = err && err.error && (err.error.description || err.error.reason);
  return String(described || (err && err.message) || 'Unknown gateway error').substring(0, 300);
}

/** How long a refund may sit claimed before it is presumed orphaned by a crash. */
const STUCK_REFUND_MINUTES = 10;

/**
 * Resolve a refund that was claimed and never recorded.
 *
 * A crash (or a deploy) between the gateway call and step 3 leaves
 * refund_pending with no way to tell whether the money moved — and calling
 * the gateway again blind is how a patient gets refunded twice. So ask
 * Razorpay first: if a refund for this payment exists, record it; only if
 * none does is it safe to send one.
 *
 * @returns {Promise<{resolved:string, session:object|null}>}
 */
async function reconcileStuckRefund(sessionOrId, { now = new Date() } = {}) {
  const Session = require('../models/session');
  const id = (sessionOrId && sessionOrId._id) ? sessionOrId._id : sessionOrId;
  const session = await Session.findById(id);
  if (!session) return { resolved: 'not-found', session: null };
  if (session.paymentStatus !== PAYMENT.REFUND_PENDING) return { resolved: 'not-pending', session };

  const claimedAt = session.refundRequestedAt || session.updatedAt;
  if (claimedAt && now.getTime() - new Date(claimedAt).getTime() < STUCK_REFUND_MINUTES * 60 * 1000) {
    // Probably still in flight in another request. Leave it alone.
    return { resolved: 'too-recent', session };
  }

  let existing = [];
  try {
    const result = await getRazorpay().payments.fetchMultipleRefund(session.paymentId);
    existing = (result && result.items) || [];
  } catch (err) {
    // Unknown is not "none": refunding on an unanswered question is the
    // double-refund this function exists to prevent. Try again next time.
    logger.warn('Could not ask Razorpay about a stuck refund', { sessionId: String(id).substring(0, 8), error: gatewayErrorMessage(err) });
    return { resolved: 'gateway-unavailable', session };
  }

  const live = existing.find((r) => r && r.status !== 'failed');
  if (live) {
    const done = await applyTransition(session, {
      event: EVENT.REFUND_SUCCEEDED,
      actor: ACTOR.SYSTEM,
      payload: { refundId: live.id, refundAmount: (live.amount || 0) / 100 || session.refundAmount }
    });
    return { resolved: 'recorded-existing', session: done.session };
  }

  const amount = session.refundAmount > 0 ? session.refundAmount : session.price;
  const result = await executeClaimedRefund(session, { amount, reason: 'Retry of an interrupted refund' });
  return { resolved: result.refunded ? 'refunded' : 'failed', session: result.session };
}

module.exports = { refundSession, executeClaimedRefund, reconcileStuckRefund, STUCK_REFUND_MINUTES };
