/**
 * The session lifecycle transition table.
 *
 * The headline test is the exhaustive one: every (status x paymentStatus x
 * event x actor) tuple must either produce a plan whose post-image satisfies
 * every invariant, produce an explicit no-op, or throw. Nothing may quietly
 * produce an illegal state. That converts "illegal states are unreachable"
 * from a claim in a comment into a property the build checks.
 *
 * It is affordable because the module is pure — no database, no network.
 */

const {
  STATUS, PAYMENT, EVENT, ACTOR,
  planTransition, assertInvariants, guardFilter,
  IllegalTransitionError
} = require('../services/sessionState');

const NOW = new Date('2026-03-14T02:00:00.000Z');

/** A session in a given state, with fields consistent enough to isolate the table. */
function make(status, paymentStatus, extra = {}) {
  return {
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    status,
    paymentStatus,
    sessionType: 'regular',
    price: 1000,
    refundAmount: 0,
    duration: 60,
    // Well before NOW, so the "cannot complete early" guard is satisfied by
    // default and individual tests can opt into the future case.
    startsAt: new Date(NOW.getTime() - 2 * 3600 * 1000),
    endsAt: new Date(NOW.getTime() - 1 * 3600 * 1000),
    paymentId: [PAYMENT.PAID, PAYMENT.REFUND_PENDING, PAYMENT.REFUNDED, PAYMENT.REFUND_FAILED].includes(paymentStatus)
      ? 'pay_realone' : null,
    refundId: paymentStatus === PAYMENT.REFUNDED ? 'rfnd_1' : null,
    ...extra
  };
}

describe('exhaustive: no tuple produces an illegal state', () => {
  const statuses = Object.values(STATUS);
  const payments = Object.values(PAYMENT);
  const events = Object.values(EVENT);
  const actors = Object.values(ACTOR);

  test(`${statuses.length} x ${payments.length} x ${events.length} x ${actors.length} tuples`, () => {
    let applied = 0;
    let noops = 0;
    let rejected = 0;
    let skippedIllegalStart = 0;
    const badPostImages = [];

    for (const status of statuses) {
      for (const paymentStatus of payments) {
        // Only 20 of the 42 (status x paymentStatus) pairs are themselves
        // legal. Starting from an already-illegal pre-image would prove
        // nothing — the property being checked is that no event takes a LEGAL
        // state to an illegal one. (Repairing the pre-existing illegal rows in
        // the database is what migrations/normalizeSessionStates.js is for.)
        if (assertInvariants(make(status, paymentStatus), { strict: false }).length > 0) {
          skippedIllegalStart += 1;
          continue;
        }
        for (const event of events) {
          for (const actor of actors) {
            const session = make(status, paymentStatus);
            let plan;
            try {
              plan = planTransition({ session, event, actor, now: NOW, payload: {} });
            } catch (err) {
              rejected += 1;
              continue;
            }

            if (plan.kind === 'noop') { noops += 1; continue; }
            applied += 1;

            // Every applied plan's post-image must satisfy the invariants.
            // Payload-dependent fields are supplied here the way the real
            // callers supply them, so this checks the table rather than the
            // callers' diligence.
            const post = { ...session, ...plan.set };
            if (post.paymentStatus === PAYMENT.REFUNDED) {
              post.refundId = post.refundId || 'rfnd_x';
              post.refundAmount = post.refundAmount || 500;
            }
            if (post.paymentStatus === PAYMENT.PAID) post.paymentId = post.paymentId || 'pay_x';
            if ([PAYMENT.REFUND_PENDING, PAYMENT.REFUND_FAILED].includes(post.paymentStatus)) {
              post.paymentId = post.paymentId || 'pay_x';
            }

            const violations = assertInvariants(post, { strict: false });
            if (violations.length > 0) {
              badPostImages.push({ status, paymentStatus, event, actor, violations: violations.map((v) => v.rule) });
            }
          }
        }
      }
    }

    expect(badPostImages).toEqual([]);
    // Sanity: the table must actually do something, or this passes vacuously.
    expect(applied).toBeGreaterThan(20);
    expect(rejected).toBeGreaterThan(100);
    expect(skippedIllegalStart).toBeGreaterThan(0);
  });
});

describe('the verified bugs are now unrepresentable', () => {
  test('a free "paid" booking violates I10 in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const { assertInvariants: prodAssert, PAYMENT: P } = require('../services/sessionState');
    try {
      expect(() => prodAssert({
        status: 'scheduled', paymentStatus: P.PAID,
        paymentId: 'mock_payment_1788288566376', price: 2000, refundAmount: 0
      })).toThrow(/I10/);
    } finally {
      process.env.NODE_ENV = prev;
      jest.resetModules();
    }
  });

  test('a refund with no payment behind it violates I6', () => {
    expect(() => assertInvariants({
      status: STATUS.CANCELLED, paymentStatus: PAYMENT.REFUNDED,
      paymentId: null, refundId: 'r1', refundAmount: 1500, price: 1500
    })).toThrow(/I6/);
  });

  test('cancelling a never-paid session yields failed with no refund, not refunded', () => {
    const session = make(STATUS.PAYMENT_PENDING, PAYMENT.PENDING, { price: 1500 });
    const plan = planTransition({ session, event: EVENT.CANCEL, actor: ACTOR.PATIENT, now: NOW });
    expect(plan.kind).toBe('apply');
    expect(plan.set.status).toBe(STATUS.CANCELLED);
    expect(plan.set.paymentStatus).toBe(PAYMENT.FAILED);   // was: 'refunded'
    expect(plan.set.refundAmount).toBe(0);                 // was: 1500
  });

  test('a session cannot be completed before it starts', () => {
    const future = make(STATUS.SCHEDULED, PAYMENT.PAID, {
      startsAt: new Date(NOW.getTime() + 7 * 24 * 3600 * 1000),
      endsAt: new Date(NOW.getTime() + 7 * 24 * 3600 * 1000 + 3600 * 1000)
    });
    expect(() => planTransition({ session: future, event: EVENT.COMPLETE, actor: ACTOR.DOCTOR, now: NOW }))
      .toThrow(/cannot be completed before its scheduled start/);
  });

  test('...but can be completed once it has started', () => {
    const started = make(STATUS.SCHEDULED, PAYMENT.PAID);
    const plan = planTransition({ session: started, event: EVENT.COMPLETE, actor: ACTOR.DOCTOR, now: NOW });
    expect(plan.set.status).toBe(STATUS.COMPLETED);
  });

  test('paid -> refunded directly is illegal; it must claim refund_pending first', () => {
    const paid = make(STATUS.CANCELLED, PAYMENT.PAID);
    // There is no event that takes paid straight to refunded.
    const plan = planTransition({ session: paid, event: EVENT.REFUND_INITIATED, actor: ACTOR.ADMIN, now: NOW });
    expect(plan.set.paymentStatus).toBe(PAYMENT.REFUND_PENDING);

    const claimed = make(STATUS.CANCELLED, PAYMENT.REFUND_PENDING);
    const settled = planTransition({
      session: claimed, event: EVENT.REFUND_SUCCEEDED, actor: ACTOR.SYSTEM, now: NOW,
      payload: { refundId: 'rfnd_1', refundAmount: 500 }
    });
    expect(settled.set.paymentStatus).toBe(PAYMENT.REFUNDED);
  });
});

describe('idempotency — the behaviour the existing tests assert', () => {
  test('cancelling an already-cancelled session is an accepted no-op', () => {
    const s = make(STATUS.CANCELLED, PAYMENT.REFUNDED);
    const plan = planTransition({ session: s, event: EVENT.CANCEL, actor: ACTOR.PATIENT, now: NOW });
    expect(plan.kind).toBe('noop');
  });

  test('completing an already-completed session is an accepted no-op', () => {
    const s = make(STATUS.COMPLETED, PAYMENT.PAID);
    const plan = planTransition({ session: s, event: EVENT.COMPLETE, actor: ACTOR.DOCTOR, now: NOW });
    expect(plan.kind).toBe('noop');
  });

  test('cancelling a completed session is rejected, not silently allowed', () => {
    const s = make(STATUS.COMPLETED, PAYMENT.PAID);
    expect(() => planTransition({ session: s, event: EVENT.CANCEL, actor: ACTOR.PATIENT, now: NOW }))
      .toThrow(IllegalTransitionError);
  });

  test('completing a cancelled session is rejected', () => {
    const s = make(STATUS.CANCELLED, PAYMENT.REFUNDED);
    expect(() => planTransition({ session: s, event: EVENT.COMPLETE, actor: ACTOR.DOCTOR, now: NOW }))
      .toThrow(IllegalTransitionError);
  });

  test('a redelivered refund webhook on an already-refunded session is a no-op', () => {
    const s = make(STATUS.CANCELLED, PAYMENT.REFUNDED);
    const plan = planTransition({ session: s, event: EVENT.REFUND_OBSERVED, actor: ACTOR.RAZORPAY, now: NOW });
    expect(plan.kind).toBe('noop');
  });
});

describe('late capture', () => {
  test('a capture after the checkout expired refunds rather than resurrecting the booking', () => {
    // The slot has already been released and may have been rebooked, so the
    // session must not come back to life — but the money was really taken.
    const s = make(STATUS.CANCELLED, PAYMENT.FAILED, { paymentId: null });
    const plan = planTransition({
      session: s, event: EVENT.LATE_CAPTURE, actor: ACTOR.RAZORPAY, now: NOW,
      payload: { paymentId: 'pay_late', refundAmount: 1000 }
    });
    expect(plan.set.paymentStatus).toBe(PAYMENT.REFUND_PENDING);
    expect(plan.set.status).toBeUndefined();   // stays cancelled
    expect(plan.set.paymentId).toBe('pay_late');
  });

  test('PAYMENT_VERIFIED on a terminal session is rejected outright', () => {
    const s = make(STATUS.CANCELLED, PAYMENT.FAILED);
    expect(() => planTransition({ session: s, event: EVENT.PAYMENT_VERIFIED, actor: ACTOR.RAZORPAY, now: NOW }))
      .toThrow(IllegalTransitionError);
  });
});

describe('guardFilter is the concurrency primitive', () => {
  test('it pins the exact pre-state the plan was computed from', () => {
    const s = make(STATUS.SCHEDULED, PAYMENT.PAID);
    const plan = planTransition({ session: s, event: EVENT.COMPLETE, actor: ACTOR.DOCTOR, now: NOW });
    expect(guardFilter(plan)).toEqual({ status: STATUS.SCHEDULED, paymentStatus: PAYMENT.PAID });
  });
});
