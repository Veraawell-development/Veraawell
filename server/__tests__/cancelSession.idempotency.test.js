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

const { errorHandler } = require('../middleware/error.middleware');

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

function buildApp(userId, role) {
  const app = express();
  app.use(express.json());
  // Simulates verifyToken having already run and attached req.user
  app.use((req, res, next) => {
    req.user = { _id: userId, role };
    next();
  });
  app.post('/sessions/:sessionId/cancel', sessionController.cancelSession);
  app.use(errorHandler);
  return app;
}

async function createPaidSession({ patientId, doctorId, hoursFromNow }) {
  const sessionDate = new Date();
  sessionDate.setHours(sessionDate.getHours() + hoursFromNow, 0, 0, 0);
  const timeStr = `${(sessionDate.getHours() % 12 || 12)}:${String(sessionDate.getMinutes()).padStart(2, '0')} ${sessionDate.getHours() >= 12 ? 'PM' : 'AM'}`;

  return Session.create({
    patientId,
    doctorId,
    sessionDate,
    sessionTime: timeStr,
    duration: 60,
    price: 1000,
    status: 'scheduled',
    paymentStatus: 'paid',
    paymentId: 'pay_realpaymentid123' // not mock_/immediate_ prefixed -> isRealPayment === true
  });
}

describe('cancelSession idempotency', () => {
  test('a second cancel request on an already-cancelled session is a no-op — does not re-issue a refund or flip paymentStatus back', async () => {
    const patient = await User.create({ firstName: 'Pat', email: 'pat@test.com', username: 'pat_test', password: 'x', role: 'patient' });
    const doctor = await User.create({ firstName: 'Doc', email: 'doc@test.com', username: 'doc_test', password: 'x', role: 'doctor' });

    // 10 hours out -> lands in the 4-24h / 50% refund tier
    const session = await createPaidSession({ patientId: patient._id, doctorId: doctor._id, hoursFromNow: 10 });

    const app = buildApp(patient._id.toString(), 'patient');

    // First call: real cancellation + refund
    const first = await request(app).post(`/sessions/${session._id}/cancel`);
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.refundAmount).toBe(500);
    expect(mockRefund).toHaveBeenCalledTimes(1);

    const afterFirst = await Session.findById(session._id);
    expect(afterFirst.status).toBe('cancelled');
    expect(afterFirst.paymentStatus).toBe('refunded');
    expect(afterFirst.refundAmount).toBe(500);

    // Second call on the same session: must be a no-op, not a second refund
    // attempt, and must NOT change paymentStatus/refundAmount.
    const second = await request(app).post(`/sessions/${session._id}/cancel`);
    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);
    expect(mockRefund).toHaveBeenCalledTimes(1); // still just once, not twice

    const afterSecond = await Session.findById(session._id);
    expect(afterSecond.status).toBe('cancelled');
    expect(afterSecond.paymentStatus).toBe('refunded'); // NOT flipped back to 'paid'
    expect(afterSecond.refundAmount).toBe(500); // unchanged
  });

  test('cancelling an already-completed session is rejected, not silently allowed', async () => {
    const patient = await User.create({ firstName: 'Pat', email: 'pat2@test.com', username: 'pat_test2', password: 'x', role: 'patient' });
    const doctor = await User.create({ firstName: 'Doc', email: 'doc2@test.com', username: 'doc_test2', password: 'x', role: 'doctor' });
    const session = await createPaidSession({ patientId: patient._id, doctorId: doctor._id, hoursFromNow: 10 });
    session.status = 'completed';
    await session.save();

    const app = buildApp(patient._id.toString(), 'patient');
    const res = await request(app).post(`/sessions/${session._id}/cancel`);

    expect(res.status).toBe(400);
    expect(mockRefund).not.toHaveBeenCalled();
    const unchanged = await Session.findById(session._id);
    expect(unchanged.status).toBe('completed');
  });
});
