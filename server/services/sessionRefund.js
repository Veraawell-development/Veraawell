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
 *   - `_autoCancelUnacceptedSession` (session.controller.js) writes
 *     `paymentStatus: 'refunded'` directly from `paid`, skipping the claim
 *     entirely, and sets no `refundId` — a state invariant I7 forbids and
 *     which only survives because a raw `save()` bypasses assertInvariants.
 *   - `cancelSession` saved `refund_pending`, called the gateway, then
 *     mutated the document again — a read-modify-write around a network
 *     call, which let two concurrent cancels both refund. It now claims the
 *     cancellation with applyTransition and refunds through this module.
 *   - `adminRefundSession` fabricates `refund_mock_<ts>` / `refund_zero_<ts>`
 *     ids for payments it decides not to send.
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

  // ── 2. The network call. The only step that is not atomic, deliberately
  //       sandwiched between two that are: a crash here leaves the session in
  //       refund_pending, which getFailedRefunds surfaces and retryRefund
  //       can pick up, rather than in a state that looks finished.
  let refund;
  try {
    refund = await getRazorpay().payments.refund(session.paymentId, {
      amount: Math.round(amount * 100),
      speed: 'normal',
      notes: { reason, sessionId: String(id) }
    });
  } catch (err) {
    logger.error('Gateway refund failed', { sessionId: short, error: err.message });
    // ACTOR.SYSTEM, not `actor`: the table only lets the system record a
    // failure, because a failure is an observation rather than a request.
    const failed = await applyTransition(id, {
      event: EVENT.REFUND_FAILED,
      actor: ACTOR.SYSTEM,
      payload: { reason: err.message }
    });
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

module.exports = { refundSession };
