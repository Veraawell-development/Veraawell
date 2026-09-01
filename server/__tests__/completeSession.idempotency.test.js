/**
 * Regression test: completeSession must not be able to "complete" a session
 * that has already been cancelled. Without this guard, a stale/replayed
 * request racing a cancellation could silently overwrite status back to
 * 'completed' with no record the session had ever been cancelled (and,
 * depending on timing, no record it had already been refunded).
 */
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const request = require('supertest');

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    payments: { refund: jest.fn().mockResolvedValue({ id: 'rfnd_test', status: 'processed' }) },
    orders: { create: jest.fn() }
  }));
});

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

test('completing an already-cancelled session is rejected, not silently allowed', async () => {
  const patient = await User.create({ firstName: 'Pat', email: 'pat3@test.com', username: 'pat_test3', password: 'password123', role: 'patient' });
  const doctor = await User.create({ firstName: 'Doc', email: 'doc3@test.com', username: 'doc_test3', password: 'password123', role: 'doctor' });

  const sessionDate = new Date();
  sessionDate.setHours(sessionDate.getHours() + 10, 0, 0, 0);
  const timeStr = `${(sessionDate.getHours() % 12 || 12)}:${String(sessionDate.getMinutes()).padStart(2, '0')} ${sessionDate.getHours() >= 12 ? 'PM' : 'AM'}`;

  const session = await Session.create({
    patientId: patient._id,
    doctorId: doctor._id,
    sessionDate,
    sessionTime: timeStr,
    duration: 60,
    price: 1000,
    status: 'scheduled',
    paymentStatus: 'paid',
    paymentId: 'pay_realpaymentid456'
  });

  const app = buildApp();
    const auth = `Bearer ${tokenFor(patient)}`;

  // Cancel it first
  const cancelRes = await request(app).post(`/sessions/${session._id}/cancel`).set('Authorization', auth);
  expect(cancelRes.status).toBe(200);

  const afterCancel = await Session.findById(session._id);
  expect(afterCancel.status).toBe('cancelled');

  // Now try to complete the already-cancelled session
  const completeRes = await request(app).post(`/sessions/${session._id}/complete`).set('Authorization', auth);
  expect(completeRes.status).toBe(400);

  const afterComplete = await Session.findById(session._id);
  expect(afterComplete.status).toBe('cancelled'); // unchanged — NOT flipped to 'completed'
});
