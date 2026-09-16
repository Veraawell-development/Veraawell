/**
 * Regression test for the cancelSession idempotency bug: a duplicate cancel
 * request (double-click, network retry, replay) used to recompute the
 * refund tier from the CURRENT time on every call instead of short-
 * circuiting once a session was already cancelled. Concretely: call 1
 * issues a real Razorpay refund and sets paymentStatus='refunded'; without
 * a guard, a second call could later recompute a 0%-tier refund and
 * overwrite paymentStatus back to 'paid', silently disagreeing with the
 * refund that had already actually happened. This test proves the guard
 * added to cancelSession (checking session.status === 'cancelled' before
 * any refund-tier computation) closes that gap: a second call must be a
 * pure no-op — no second Razorpay call, no state change.
 */
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const request = require('supertest');

// Mock Razorpay so we can assert exactly how many times a refund was
// attempted, and so the test doesn't make a real network call.
const mockRefund = jest.fn().mockResolvedValue({ id: 'rfnd_test123', status: 'processed' });
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    payments: { refund: mockRefund },
    orders: { create: jest.fn() }
  }));
});

// Mock email sending — irrelevant to this test, and would otherwise try a
// real network call to Resend with no API key configured in the test env.
jest.mock('../services/email.service', () => ({
  sendCancellationEmail: jest.fn().mockResolvedValue(undefined),
  sendDoctorSessionSummaryEmail: jest.fn().mockResolvedValue(undefined)
}));

const { mountRoutes, tokenFor } = require('./helpers/harness');

let mongod;
let Session, User, sessionController;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  Session = require('../models/session');
  User = require('../models/user');
  sessionController = require('../controllers/session.controller');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Session.deleteMany({});
  await User.deleteMany({});
  mockRefund.mockClear();
});

/**
 * The real router, so the request travels verifyToken -> validateObjectIdParam
 * -> authorize(...) -> controller. The previous version mounted the controller
 * directly behind a stubbed req.user, which meant this test could not have
 * caught a missing authorization check on the route it exercises.
 */
function buildApp() {
  return mountRoutes({ '/sessions': '../../routes/sessions' });
}

async function createPaidSession({ patientId, doctorId, hoursFromNow }) {
  // Set the authoritative instant, not the legacy (sessionDate, sessionTime)
  // pair. Deriving backwards from those is wall-clock dependent: when
  // `now + hoursFromNow` lands on exactly 00:00 UTC, resolveStartsAt reads
  // the row as a legacy calendar date and re-interprets its time string as
  // IST, moving the session 5h30m earlier. A "10 hours out" session became
  // 3.9 hours out, crossing the 4-hour refund boundary — so this test failed
  // for about half an hour every day and passed otherwise.
  const startsAt = new Date(Date.now() + hoursFromNow * 3600 * 1000);

  return Session.create({
    patientId,
    doctorId,
    startsAt,
    duration: 60,
    price: 1000,
    status: 'scheduled',
    paymentStatus: 'paid',
    paymentId: 'pay_realpaymentid123' // not mock_/immediate_ prefixed -> isRealPayment === true
  });
}

describe('cancelSession idempotency', () => {
  test('a second cancel request on an already-cancelled session is a no-op — does not re-issue a refund or flip paymentStatus back', async () => {
    const patient = await User.create({ firstName: 'Pat', email: 'pat@test.com', username: 'pat_test', password: 'password123', role: 'patient' });
    const doctor = await User.create({ firstName: 'Doc', email: 'doc@test.com', username: 'doc_test', password: 'password123', role: 'doctor' });

    // 10 hours out -> comfortably past the 4h boundary, so a full refund
    const session = await createPaidSession({ patientId: patient._id, doctorId: doctor._id, hoursFromNow: 10 });

    const app = buildApp();
    const auth = `Bearer ${tokenFor(patient)}`;

    // First call: real cancellation + refund
    const first = await request(app).post(`/sessions/${session._id}/cancel`).set('Authorization', auth);
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.refundAmount).toBe(1000);
    expect(mockRefund).toHaveBeenCalledTimes(1);

    const afterFirst = await Session.findById(session._id);
    expect(afterFirst.status).toBe('cancelled');
    expect(afterFirst.paymentStatus).toBe('refunded');
    expect(afterFirst.refundAmount).toBe(1000);

    // Second call on the same session: must be a no-op, not a second refund
    // attempt, and must NOT change paymentStatus/refundAmount.
    const second = await request(app).post(`/sessions/${session._id}/cancel`).set('Authorization', auth);
    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);
    expect(mockRefund).toHaveBeenCalledTimes(1); // still just once, not twice

    const afterSecond = await Session.findById(session._id);
    expect(afterSecond.status).toBe('cancelled');
    expect(afterSecond.paymentStatus).toBe('refunded'); // NOT flipped back to 'paid'
    expect(afterSecond.refundAmount).toBe(1000); // unchanged
  });

  test('cancelling an already-completed session is rejected, not silently allowed', async () => {
    const patient = await User.create({ firstName: 'Pat', email: 'pat2@test.com', username: 'pat_test2', password: 'password123', role: 'patient' });
    const doctor = await User.create({ firstName: 'Doc', email: 'doc2@test.com', username: 'doc_test2', password: 'password123', role: 'doctor' });
    const session = await createPaidSession({ patientId: patient._id, doctorId: doctor._id, hoursFromNow: 10 });
    session.status = 'completed';
    await session.save();

    const app = buildApp();
    const auth = `Bearer ${tokenFor(patient)}`;
    const res = await request(app).post(`/sessions/${session._id}/cancel`).set('Authorization', auth);

    expect(res.status).toBe(400);
    expect(mockRefund).not.toHaveBeenCalled();
    const unchanged = await Session.findById(session._id);
    expect(unchanged.status).toBe('completed');
  });
});
