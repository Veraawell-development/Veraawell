/**
 * The shared refund path: claim, call the gateway, record the outcome.
 *
 * The ordering is the safety property. `refund_pending` is a mutual-exclusion
 * claim written by a compare-and-set, so only the caller that wins it may
 * reach Razorpay. Anything that calls the gateway without holding the claim —
 * or that records an outcome it never obtained — can refund twice or invent a
 * refund that never happened, and both have happened in this codebase before.
 *
 * Also covers a bug this work uncovered in `applyTransition` itself: a
 * Mongoose ObjectId has a self-referential `_id`, so the "document or id?"
 * test took the document branch for a bare ObjectId and used the id AS the
 * session. It survived because the single existing caller passed a document.
 */

require('../support/env');

const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

const mockRefund = jest.fn();
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: mockRefund, fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));

let Session, refundSession, ACTOR, applyTransition, EVENT;
let patientId, doctorId;

/** A paid, terminal session — the only shape a refund is legal from. */
async function paidSession(overrides = {}) {
  return Session.create({
    patientId, doctorId,
    startsAt: new Date(Date.now() - 2 * 3600 * 1000),
    duration: 60, price: 1000,
    status: 'completed', paymentStatus: 'paid', paymentId: 'pay_real_abc123',
    doctorJoined: true, patientJoined: true,
    ...overrides
  });
}

beforeAll(async () => {
  await connectDb('session-refund');
  Session = require('../../models/session');
  ({ refundSession } = require('../../services/sessionRefund'));
  ({ applyTransition } = require('../../services/sessionTransition'));
  ({ ACTOR, EVENT } = require('../../services/sessionState'));
  patientId = new mongoose.Types.ObjectId();
  doctorId = new mongoose.Types.ObjectId();
});

afterAll(async () => { await disconnectDb(); });

beforeEach(async () => {
  await Session.deleteMany({});
  mockRefund.mockReset();
  mockRefund.mockResolvedValue({ id: 'rfnd_ok', status: 'processed' });
});

describe('the happy path', () => {
  test('claims, calls the gateway once, and records the outcome', async () => {
    const s = await paidSession();
    const result = await refundSession(s, { actor: ACTOR.PATIENT, amount: 1000, reason: 'Cancelled' });

    expect(result.refunded).toBe(true);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund.mock.calls[0][0]).toBe('pay_real_abc123');
    expect(mockRefund.mock.calls[0][1].amount).toBe(100000); // paise

    const after = await Session.findById(s._id);
    expect(after.paymentStatus).toBe('refunded');
    expect(after.refundId).toBe('rfnd_ok');
    expect(after.refundAmount).toBe(1000);
    expect(after.refundedAt).toBeInstanceOf(Date);
  });

  test('a partial refund is recorded at the amount actually sent', async () => {
    const s = await paidSession({ price: 2000 });
    await refundSession(s, { actor: ACTOR.ADMIN, amount: 800 });

    expect(mockRefund.mock.calls[0][1].amount).toBe(80000);
    const after = await Session.findById(s._id);
    expect(after.refundAmount).toBe(800);
  });
});

describe('any actor may ask, but only the system may record the outcome', () => {
  test('a patient-initiated refund completes, despite the patient not being allowed to record success', async () => {
    // The transition table lets ANY actor initiate but restricts
    // REFUND_SUCCEEDED to system/razorpay and REFUND_FAILED to system. A
    // call site that passed its own actor through to step 3 would throw
    // IllegalTransitionError after the money had already moved — the worst
    // possible place to fail. refundSession switches to SYSTEM internally.
    const s = await paidSession();
    const result = await refundSession(s, { actor: ACTOR.PATIENT, amount: 1000 });

    expect(result.refunded).toBe(true);
    expect((await Session.findById(s._id)).paymentStatus).toBe('refunded');
  });

  test('recording success as the patient directly is rejected — the rule being relied on', async () => {
    const s = await paidSession();
    await applyTransition(s, { event: EVENT.REFUND_INITIATED, actor: ACTOR.PATIENT, payload: { refundAmount: 1000 } });

    await expect(applyTransition(s._id, {
      event: EVENT.REFUND_SUCCEEDED,
      actor: ACTOR.PATIENT,
      payload: { refundId: 'rfnd_x', refundAmount: 1000 }
    })).rejects.toThrow(/Cannot REFUND_SUCCEEDED/);
  });
});

describe('the gateway is never called without a claim', () => {
  test('a session that was never paid is skipped', async () => {
    const s = await paidSession({ paymentStatus: 'not_required', paymentId: null, price: 0 });
    const result = await refundSession(s, { actor: ACTOR.SYSTEM, amount: 0 });

    expect(result.refunded).toBe(false);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('a synthetic payment id is skipped — invariant I6 needs a real payment', async () => {
    const s = await paidSession({ paymentId: 'mock_payment_1700000000' });
    const result = await refundSession(s, { actor: ACTOR.SYSTEM, amount: 1000 });

    expect(result.refunded).toBe(false);
    expect(result.skipped).toBe('no-real-payment');
    expect(mockRefund).not.toHaveBeenCalled();
    expect((await Session.findById(s._id)).paymentStatus).toBe('paid');
  });

  test('an already-refunded session is skipped', async () => {
    const s = await paidSession();
    await refundSession(s, { actor: ACTOR.SYSTEM, amount: 1000 });
    mockRefund.mockClear();

    const again = await refundSession(await Session.findById(s._id), { actor: ACTOR.SYSTEM, amount: 1000 });
    expect(again.refunded).toBe(false);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('two concurrent refunds of the same session reach the gateway once', async () => {
    // The claim is a compare-and-set, so only one caller can hold it. This is
    // the property that makes a duplicate request safe rather than expensive.
    const s = await paidSession();
    const [a, b] = await Promise.all([
      refundSession(await Session.findById(s._id), { actor: ACTOR.PATIENT, amount: 1000 }),
      refundSession(await Session.findById(s._id), { actor: ACTOR.ADMIN, amount: 1000 })
    ]);

    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect([a.refunded, b.refunded].filter(Boolean)).toHaveLength(1);
    expect((await Session.findById(s._id)).paymentStatus).toBe('refunded');
  });
});

describe('a gateway failure is recorded, not swallowed', () => {
  test('the session lands in refund_failed with no refundId', async () => {
    mockRefund.mockRejectedValueOnce(new Error('Razorpay 500'));
    const s = await paidSession();

    const result = await refundSession(s, { actor: ACTOR.SYSTEM, amount: 1000 });

    expect(result.refunded).toBe(false);
    expect(result.failed).toBe(true);
    const after = await Session.findById(s._id);
    expect(after.paymentStatus).toBe('refund_failed');
    expect(after.refundId).toBeFalsy();
    // Not left as 'paid': the admin queue must be able to find it.
    expect(after.paymentStatus).not.toBe('paid');
  });

  test('a failed refund can be retried and then succeeds', async () => {
    mockRefund.mockRejectedValueOnce(new Error('transient'));
    const s = await paidSession();
    await refundSession(s, { actor: ACTOR.SYSTEM, amount: 1000 });

    mockRefund.mockResolvedValueOnce({ id: 'rfnd_retry', status: 'processed' });
    const retry = await refundSession(await Session.findById(s._id), { actor: ACTOR.ADMIN, amount: 1000 });

    expect(retry.refunded).toBe(true);
    const after = await Session.findById(s._id);
    expect(after.paymentStatus).toBe('refunded');
    expect(after.refundId).toBe('rfnd_retry');
  });
});

describe('applyTransition accepts an id as well as a document', () => {
  test('a bare ObjectId is treated as an id, not as the session', async () => {
    // A Mongoose ObjectId has a self-referential `_id`, so the old
    // `sessionOrId._id ? doc : id` test took the DOCUMENT branch and used the
    // ObjectId as the session — every field read undefined and the failure
    // surfaced as 'Cannot REFUND_SUCCEEDED a session whose status is
    // "undefined"', nowhere near the cause. It stayed hidden because the one
    // existing caller passed a document.
    const s = await paidSession();

    const result = await applyTransition(s._id, {
      event: EVENT.REFUND_INITIATED,
      actor: ACTOR.SYSTEM,
      payload: { refundAmount: 500 }
    });

    expect(result.changed).toBe(true);
    expect(result.session.paymentStatus).toBe('refund_pending');
  });

  test('a string id works too', async () => {
    const s = await paidSession();
    const result = await applyTransition(String(s._id), {
      event: EVENT.REFUND_INITIATED,
      actor: ACTOR.SYSTEM,
      payload: { refundAmount: 500 }
    });
    expect(result.changed).toBe(true);
  });

  test('a document still works', async () => {
    const s = await paidSession();
    const result = await applyTransition(s, {
      event: EVENT.REFUND_INITIATED,
      actor: ACTOR.SYSTEM,
      payload: { refundAmount: 500 }
    });
    expect(result.changed).toBe(true);
  });

  test('an unknown id is a NotFoundError, not a silent no-op', async () => {
    await expect(applyTransition(new mongoose.Types.ObjectId(), {
      event: EVENT.REFUND_INITIATED, actor: ACTOR.SYSTEM, payload: { refundAmount: 1 }
    })).rejects.toThrow(/not found/i);
  });
});
