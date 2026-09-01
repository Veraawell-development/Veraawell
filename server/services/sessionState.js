/**
 * The Session lifecycle, as an explicit transition table.
 *
 * WHY THIS EXISTS
 *
 * `status` (6 values) and `paymentStatus` (7 values) were mutated from twelve
 * independent places with no shared rule, so illegal combinations were
 * reachable by construction rather than by accident. Three were verified
 * against the running server:
 *
 *   - a gateway failure produced `paymentStatus: 'paid'` with a fabricated
 *     `mock_payment_<ts>` id and ₹0 collected;
 *   - cancelling a never-paid session wrote `refunded` with a non-zero
 *     refundAmount against `paymentId: null` — a refund of money that was
 *     never taken, which then flows into revenue analytics and the admin
 *     refund tooling;
 *   - a doctor could mark a session a week in the future `completed`, which
 *     then blocked the patient's refund because cancel rejects completed
 *     sessions.
 *
 * Patching each site individually leaves the next one to be written. A table
 * makes the illegal states unrepresentable: anything not listed throws.
 *
 * This module is PURE — no database, no network, no clock beyond an injected
 * `now`. That is what makes the exhaustive table test in
 * __tests__/sessionState.test.js possible (6 x 7 x every event x every actor,
 * in milliseconds).
 */

const { AppError } = require('../utils/errors');
const { isSyntheticPaymentId } = require('../config/payments');
const { isProduction } = require('../config/environment');

const STATUS = Object.freeze({
  PAYMENT_PENDING: 'payment_pending',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no-show'
});

const PAYMENT = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  REFUND_PENDING: 'refund_pending',
  REFUNDED: 'refunded',
  REFUND_FAILED: 'refund_failed',
  FAILED: 'failed',
  NOT_REQUIRED: 'not_required'
});

const EVENT = Object.freeze({
  PAYMENT_VERIFIED: 'PAYMENT_VERIFIED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  CHECKOUT_EXPIRED: 'CHECKOUT_EXPIRED',
  LATE_CAPTURE: 'LATE_CAPTURE',
  CANCEL: 'CANCEL',
  COMPLETE: 'COMPLETE',
  CALL_STARTED: 'CALL_STARTED',
  SWEEP_ELAPSED: 'SWEEP_ELAPSED',
  ACCEPT_TIMEOUT: 'ACCEPT_TIMEOUT',
  REFUND_INITIATED: 'REFUND_INITIATED',
  REFUND_SUCCEEDED: 'REFUND_SUCCEEDED',
  REFUND_FAILED: 'REFUND_FAILED',
  REFUND_OBSERVED: 'REFUND_OBSERVED'
});

const ACTOR = Object.freeze({
  PATIENT: 'patient',
  DOCTOR: 'doctor',
  ADMIN: 'admin',
  SYSTEM: 'system',
  RAZORPAY: 'razorpay_webhook'
});

const TERMINAL_STATUSES = [STATUS.COMPLETED, STATUS.CANCELLED, STATUS.NO_SHOW];
const LIVE_STATUSES = [STATUS.SCHEDULED, STATUS.ACTIVE];
const OPEN_STATUSES = [STATUS.PAYMENT_PENDING, STATUS.SCHEDULED, STATUS.ACTIVE];

const isTerminalStatus = (s) => TERMINAL_STATUSES.includes(s);
const ANY = Object.freeze(Object.values(ACTOR));

class IllegalTransitionError extends AppError {
  constructor({ field, from, event, actor }) {
    super(`Cannot ${event} a session whose ${field} is "${from}"`, 409);
    Object.assign(this, { field, from, event, actor, code: 'ILLEGAL_TRANSITION' });
  }
}

class InvariantViolationError extends AppError {
  constructor(rule, detail) {
    super(`Session invariant violated: ${rule}`, 500);
    this.rule = rule;
    this.detail = detail;
  }
}

/**
 * status transitions.
 *
 * `to: null` means "accept and change nothing" — an idempotent no-op, which is
 * what a duplicate request (double click, network retry, redelivered webhook)
 * should get. Anything absent from this table throws.
 */
const STATUS_TABLE = [
  // ── payment lifecycle ──
  { from: STATUS.PAYMENT_PENDING, event: EVENT.PAYMENT_VERIFIED, actors: [ACTOR.SYSTEM, ACTOR.RAZORPAY],
    to: (s) => (s.sessionType === 'immediate' ? STATUS.ACTIVE : STATUS.SCHEDULED) },
  { from: STATUS.PAYMENT_PENDING, event: EVENT.PAYMENT_FAILED, actors: [ACTOR.SYSTEM, ACTOR.RAZORPAY], to: STATUS.CANCELLED },
  { from: STATUS.PAYMENT_PENDING, event: EVENT.CHECKOUT_EXPIRED, actors: [ACTOR.SYSTEM], to: STATUS.CANCELLED },
  { from: STATUS.PAYMENT_PENDING, event: EVENT.CANCEL, actors: ANY, to: STATUS.CANCELLED },

  // ── scheduled ──
  { from: STATUS.SCHEDULED, event: EVENT.CALL_STARTED, actors: [ACTOR.PATIENT, ACTOR.DOCTOR], to: STATUS.ACTIVE },
  { from: STATUS.SCHEDULED, event: EVENT.CANCEL, actors: ANY, to: STATUS.CANCELLED },
  /**
   * The guard that closes the "complete a future session" hole. Completion
   * required only that the session was not already completed or cancelled, so
   * a doctor could complete a booking a week out and thereby block the
   * patient's refund, since cancel rejects completed sessions.
   */
  { from: STATUS.SCHEDULED, event: EVENT.COMPLETE, actors: [ACTOR.PATIENT, ACTOR.DOCTOR, ACTOR.SYSTEM],
    to: STATUS.COMPLETED,
    guard: ({ session, now }) => {
      const { hasStarted } = require('./sessionTime');
      if (!hasStarted(session, now)) {
        return 'A session cannot be completed before its scheduled start time';
      }
      return null;
    } },
  { from: STATUS.SCHEDULED, event: EVENT.SWEEP_ELAPSED, actors: [ACTOR.SYSTEM],
    to: (s) => ((s.doctorJoined && s.patientJoined) ? STATUS.COMPLETED : STATUS.NO_SHOW) },

  // ── active (an immediate session, or a call in progress) ──
  { from: STATUS.ACTIVE, event: EVENT.COMPLETE, actors: [ACTOR.PATIENT, ACTOR.DOCTOR, ACTOR.SYSTEM], to: STATUS.COMPLETED },
  { from: STATUS.ACTIVE, event: EVENT.CANCEL, actors: [ACTOR.DOCTOR, ACTOR.ADMIN, ACTOR.SYSTEM], to: STATUS.CANCELLED },
  { from: STATUS.ACTIVE, event: EVENT.ACCEPT_TIMEOUT, actors: [ACTOR.SYSTEM], to: STATUS.CANCELLED },
  { from: STATUS.ACTIVE, event: EVENT.SWEEP_ELAPSED, actors: [ACTOR.SYSTEM],
    to: (s) => (s.callStatus === 'in-progress' ? STATUS.COMPLETED : STATUS.NO_SHOW) },
  { from: STATUS.ACTIVE, event: EVENT.CALL_STARTED, actors: [ACTOR.PATIENT, ACTOR.DOCTOR], to: null },

  // Scheduled sessions can also be timed out on the unaccepted-instant path.
  { from: STATUS.SCHEDULED, event: EVENT.ACCEPT_TIMEOUT, actors: [ACTOR.SYSTEM], to: STATUS.CANCELLED },

  // ── idempotent repeats ──
  { from: STATUS.CANCELLED, event: EVENT.CANCEL, actors: ANY, to: null },
  { from: STATUS.COMPLETED, event: EVENT.COMPLETE, actors: ANY, to: null },
  { from: STATUS.CANCELLED, event: EVENT.CHECKOUT_EXPIRED, actors: [ACTOR.SYSTEM], to: null },
  { from: STATUS.CANCELLED, event: EVENT.ACCEPT_TIMEOUT, actors: [ACTOR.SYSTEM], to: null },
  { from: STATUS.COMPLETED, event: EVENT.SWEEP_ELAPSED, actors: [ACTOR.SYSTEM], to: null },
  { from: STATUS.CANCELLED, event: EVENT.SWEEP_ELAPSED, actors: [ACTOR.SYSTEM], to: null },
  { from: STATUS.NO_SHOW, event: EVENT.SWEEP_ELAPSED, actors: [ACTOR.SYSTEM], to: null },

  /**
   * Money events never move `status` — but they are only legal once the
   * session has reached a terminal state.
   *
   * Refunding a session that is still `scheduled` or `active` is
   * contradictory: it would leave a live, joinable booking whose payment is
   * being reversed, which invariant I2 forbids. In practice every real caller
   * already cancels first and then refunds (cancelSession does both;
   * adminRefundSession sets status='cancelled'), so this restriction matches
   * how the flows actually run — it just makes the ordering mandatory instead
   * of conventional.
   *
   * The exhaustive table test found this: `scheduled/paid --REFUND_INITIATED->`
   * produced a post-image violating I2.
   */
  ...TERMINAL_STATUSES.flatMap((from) =>
    [EVENT.REFUND_INITIATED, EVENT.REFUND_SUCCEEDED, EVENT.REFUND_FAILED, EVENT.REFUND_OBSERVED]
      .map((event) => ({ from, event, actors: ANY, to: null }))),

  // A capture that lands after the booking was already resolved.
  ...TERMINAL_STATUSES.map((from) => ({ from, event: EVENT.LATE_CAPTURE, actors: [ACTOR.RAZORPAY], to: null }))
];

/**
 * paymentStatus transitions.
 *
 * The structural rule: `paid -> refunded` directly is ILLEGAL. Every refund
 * must pass through `refund_pending`, which acts as the mutual-exclusion claim
 * that makes a refund exactly-once. That single rule is what stops the
 * fabricated-refund and double-refund classes.
 */
const PAYMENT_TABLE = [
  { from: PAYMENT.PENDING, event: EVENT.PAYMENT_VERIFIED, actors: [ACTOR.SYSTEM, ACTOR.RAZORPAY], to: PAYMENT.PAID },
  { from: PAYMENT.PENDING, event: EVENT.PAYMENT_FAILED, actors: [ACTOR.SYSTEM, ACTOR.RAZORPAY], to: PAYMENT.FAILED },
  { from: PAYMENT.PENDING, event: EVENT.CHECKOUT_EXPIRED, actors: [ACTOR.SYSTEM], to: PAYMENT.FAILED },
  /**
   * Cancelling a checkout that was never completed. This used to fall into
   * cancelSession's final `else` and write `refunded` with a non-zero
   * refundAmount against a null paymentId.
   */
  { from: PAYMENT.PENDING, event: EVENT.CANCEL, actors: ANY, to: PAYMENT.FAILED },

  { from: PAYMENT.PAID, event: EVENT.REFUND_INITIATED, actors: ANY, to: PAYMENT.REFUND_PENDING },
  { from: PAYMENT.PAID, event: EVENT.REFUND_OBSERVED, actors: [ACTOR.RAZORPAY], to: PAYMENT.REFUNDED },
  { from: PAYMENT.REFUND_PENDING, event: EVENT.REFUND_SUCCEEDED, actors: [ACTOR.SYSTEM, ACTOR.RAZORPAY], to: PAYMENT.REFUNDED },
  { from: PAYMENT.REFUND_PENDING, event: EVENT.REFUND_FAILED, actors: [ACTOR.SYSTEM], to: PAYMENT.REFUND_FAILED },
  { from: PAYMENT.REFUND_PENDING, event: EVENT.REFUND_OBSERVED, actors: [ACTOR.RAZORPAY], to: PAYMENT.REFUNDED },
  // A retry claims the refund again, with a fresh key.
  { from: PAYMENT.REFUND_FAILED, event: EVENT.REFUND_INITIATED, actors: [ACTOR.ADMIN, ACTOR.SYSTEM], to: PAYMENT.REFUND_PENDING },

  { from: PAYMENT.FAILED, event: EVENT.LATE_CAPTURE, actors: [ACTOR.RAZORPAY], to: PAYMENT.REFUND_PENDING },

  // ── idempotent repeats / money-irrelevant events ──
  { from: PAYMENT.REFUNDED, event: EVENT.REFUND_OBSERVED, actors: ANY, to: null },
  { from: PAYMENT.REFUNDED, event: EVENT.REFUND_SUCCEEDED, actors: ANY, to: null },
  { from: PAYMENT.REFUNDED, event: EVENT.REFUND_INITIATED, actors: ANY, to: null },
  { from: PAYMENT.REFUND_PENDING, event: EVENT.REFUND_INITIATED, actors: ANY, to: null },
  { from: PAYMENT.PAID, event: EVENT.PAYMENT_VERIFIED, actors: ANY, to: null },
  { from: PAYMENT.FAILED, event: EVENT.PAYMENT_FAILED, actors: ANY, to: null },
  { from: PAYMENT.FAILED, event: EVENT.CHECKOUT_EXPIRED, actors: ANY, to: null },
  { from: PAYMENT.FAILED, event: EVENT.CANCEL, actors: ANY, to: null },
  { from: PAYMENT.NOT_REQUIRED, event: EVENT.CANCEL, actors: ANY, to: null },
  { from: PAYMENT.NOT_REQUIRED, event: EVENT.REFUND_INITIATED, actors: ANY, to: null },

  // Scheduling events never move money.
  ...Object.values(PAYMENT).flatMap((from) =>
    [EVENT.COMPLETE, EVENT.CALL_STARTED, EVENT.SWEEP_ELAPSED, EVENT.ACCEPT_TIMEOUT]
      .map((event) => ({ from, event, actors: ANY, to: null }))),

  // Cancelling a paid session does not itself move money; the refund does.
  { from: PAYMENT.PAID, event: EVENT.CANCEL, actors: ANY, to: null },
  { from: PAYMENT.REFUND_PENDING, event: EVENT.CANCEL, actors: ANY, to: null },
  { from: PAYMENT.REFUNDED, event: EVENT.CANCEL, actors: ANY, to: null },
  { from: PAYMENT.REFUND_FAILED, event: EVENT.CANCEL, actors: ANY, to: null }
];

function findRow(table, from, event, actor) {
  return table.find((r) => r.from === from && r.event === event && r.actors.includes(actor));
}

/**
 * Cross-field invariants, checked against the POST-image before any write.
 *
 * These are what make the verified bugs unrepresentable rather than merely
 * fixed at the sites where they happened to occur.
 */
function assertInvariants(session, { strict = true } = {}) {
  const fail = (rule, detail) => {
    if (strict) throw new InvariantViolationError(rule, detail);
    return { rule, detail };
  };
  const violations = [];
  const add = (v) => { if (v) violations.push(v); };

  const { status, paymentStatus, paymentId, refundId, refundAmount = 0, price = 0 } = session;

  if ((status === STATUS.PAYMENT_PENDING) !== (paymentStatus === PAYMENT.PENDING)) {
    add(fail('I1 status=payment_pending <=> paymentStatus=pending', { status, paymentStatus }));
  }
  if (LIVE_STATUSES.includes(status) && ![PAYMENT.PAID, PAYMENT.NOT_REQUIRED].includes(paymentStatus)) {
    add(fail('I2 a live session must be paid or not_required', { status, paymentStatus }));
  }
  if (paymentStatus === PAYMENT.PAID && !paymentId) {
    add(fail('I5 paid requires a paymentId', { paymentId }));
  }
  if ([PAYMENT.REFUND_PENDING, PAYMENT.REFUNDED, PAYMENT.REFUND_FAILED].includes(paymentStatus) && !paymentId) {
    // The fabricated-refund bug, made unrepresentable.
    add(fail('I6 a refund requires a payment to refund', { paymentStatus, paymentId }));
  }
  if (paymentStatus === PAYMENT.REFUNDED && (!refundId || !(refundAmount > 0))) {
    add(fail('I7 refunded requires a refundId and a positive amount', { refundId, refundAmount }));
  }
  if (refundAmount < 0 || (price > 0 && refundAmount > price)) {
    add(fail('I8 0 <= refundAmount <= price', { refundAmount, price }));
  }
  if (paymentStatus === PAYMENT.NOT_REQUIRED && refundAmount > 0) {
    add(fail('I9 nothing was charged, so nothing can be refunded', { refundAmount }));
  }
  // The free-paid-booking bug, made unrepresentable — even for a code path
  // written years from now.
  if (isProduction() && paymentStatus === PAYMENT.PAID && isSyntheticPaymentId(paymentId)) {
    add(fail('I10 a synthetic payment id cannot mark a session paid in production', { paymentId }));
  }

  return violations;
}

/**
 * Plan a transition. Pure: returns what to write, or reports a no-op, or throws.
 *
 * @returns {{kind:'apply', set:Object, from:{status,paymentStatus}}
 *          |{kind:'noop', reason:string}}
 * @throws {IllegalTransitionError|AppError}
 */
function planTransition({ session, event, actor, now = new Date(), payload = {} }) {
  const fromStatus = session.status;
  const fromPayment = session.paymentStatus;

  const statusRow = findRow(STATUS_TABLE, fromStatus, event, actor);
  if (!statusRow) throw new IllegalTransitionError({ field: 'status', from: fromStatus, event, actor });

  const paymentRow = findRow(PAYMENT_TABLE, fromPayment, event, actor);
  if (!paymentRow) throw new IllegalTransitionError({ field: 'paymentStatus', from: fromPayment, event, actor });

  if (statusRow.guard) {
    const reason = statusRow.guard({ session, now, payload });
    if (reason) throw new AppError(reason, 400);
  }

  const nextStatus = typeof statusRow.to === 'function' ? statusRow.to(session) : statusRow.to;
  const nextPayment = typeof paymentRow.to === 'function' ? paymentRow.to(session) : paymentRow.to;

  const statusMoves = !!nextStatus && nextStatus !== fromStatus;
  const paymentMoves = !!nextPayment && nextPayment !== fromPayment;

  const set = {};
  if (statusMoves) set.status = nextStatus;
  if (paymentMoves) set.paymentStatus = nextPayment;

  // Payload fields are attached ONLY when the corresponding state actually
  // moves. Attaching them unconditionally made every repeat look like a real
  // change — a redelivered `refund.processed` webhook on an already-refunded
  // session would rewrite refundedAt and be reported as an applied
  // transition instead of the no-op it is.
  if (paymentMoves && nextPayment === PAYMENT.PAID && payload.paymentId) {
    set.paymentId = payload.paymentId;
  }
  if (event === EVENT.LATE_CAPTURE && paymentMoves && payload.paymentId) {
    // The capture really happened, so record which payment it was even though
    // the booking stays terminal.
    set.paymentId = payload.paymentId;
  }
  if (statusMoves && nextStatus === STATUS.CANCELLED && payload.cancelledBy) {
    set.cancelledBy = payload.cancelledBy;
  }
  if (paymentMoves && nextPayment === PAYMENT.REFUND_PENDING) {
    if (payload.refundAmount != null) set.refundAmount = payload.refundAmount;
    if (payload.refundKey) set.refundKey = payload.refundKey;
    set.refundRequestedAt = now;
  }
  if (paymentMoves && nextPayment === PAYMENT.REFUNDED) {
    if (payload.refundId) set.refundId = payload.refundId;
    if (payload.refundAmount != null) set.refundAmount = payload.refundAmount;
    set.refundedAt = payload.refundedAt || now;
  }
  if (paymentMoves && nextPayment === PAYMENT.REFUND_FAILED && payload.reason) {
    set.refundFailureReason = payload.reason;
  }
  // Nothing was ever captured, so there is nothing outstanding to refund.
  if (paymentMoves && nextPayment === PAYMENT.FAILED) {
    set.refundAmount = 0;
  }

  if (Object.keys(set).length === 0) {
    return { kind: 'noop', reason: `${event} is a no-op from ${fromStatus}/${fromPayment}` };
  }

  return { kind: 'apply', set, from: { status: fromStatus, paymentStatus: fromPayment } };
}

/** The precondition, as a Mongo filter fragment — the concurrency primitive. */
function guardFilter(plan) {
  return { status: plan.from.status, paymentStatus: plan.from.paymentStatus };
}

module.exports = {
  STATUS, PAYMENT, EVENT, ACTOR,
  LIVE_STATUSES, OPEN_STATUSES, TERMINAL_STATUSES, isTerminalStatus,
  planTransition, guardFilter, assertInvariants,
  IllegalTransitionError, InvariantViolationError,
  STATUS_TABLE, PAYMENT_TABLE
};
