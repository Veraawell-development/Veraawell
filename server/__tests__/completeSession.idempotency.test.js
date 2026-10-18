/**
 * Regression test: completeSession must not be able to "complete" a session
 * that has already been cancelled — and, since leaving stopped ending
 * sessions, must not complete a live one either. Without this guard, a stale/replayed
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

  // Now try to complete the already-cancelled session. POST /complete no
  // longer completes anything (leaving never ends a session — see
  // controllers/session.controller.js completeSession); apps still open from
  // before that change keep calling it, so it answers success and changes
  // nothing.
  const completeRes = await request(app).post(`/sessions/${session._id}/complete`).set('Authorization', auth);
  expect(completeRes.status).toBe(200);
  expect(completeRes.body.session.status).toBe('cancelled');

  const afterComplete = await Session.findById(session._id);
  expect(afterComplete.status).toBe('cancelled'); // unchanged — NOT flipped to 'completed'
});

test('a party calling /complete on a started, live session leaves it live', async () => {
  const patient = await User.create({ firstName: 'Pat', email: 'pat4@test.com', username: 'pat_test4', password: 'password123', role: 'patient' });
  const doctor = await User.create({ firstName: 'Doc', email: 'doc4@test.com', username: 'doc_test4', password: 'password123', role: 'doctor', approvalStatus: 'approved' });
  const session = await Session.create({
    patientId: patient._id,
    doctorId: doctor._id,
    startsAt: new Date(Date.now() - 5 * 60 * 1000),
    duration: 20,
    price: 1000,
    status: 'scheduled',
    paymentStatus: 'paid',
    paymentId: 'pay_realpaymentid789',
    doctorJoined: true,
    patientJoined: true
  });
  const app = buildApp();

  for (const who of [patient, doctor]) {
    // eslint-disable-next-line no-await-in-loop
    const res = await request(app).post(`/sessions/${session._id}/complete`).set('Authorization', `Bearer ${tokenFor(who)}`);
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe('scheduled');
  }
  expect((await Session.findById(session._id)).status).toBe('scheduled');
});

test('a stranger still cannot call /complete', async () => {
  const patient = await User.create({ firstName: 'Pat', email: 'pat5@test.com', username: 'pat_test5', password: 'password123', role: 'patient' });
  const doctor = await User.create({ firstName: 'Doc', email: 'doc5@test.com', username: 'doc_test5', password: 'password123', role: 'doctor' });
  const stranger = await User.create({ firstName: 'Str', email: 'str5@test.com', username: 'str_test5', password: 'password123', role: 'patient' });
  const session = await Session.create({
    patientId: patient._id, doctorId: doctor._id,
    startsAt: new Date(Date.now() - 5 * 60 * 1000), duration: 20, price: 1000,
    status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_realpaymentid790'
  });
  const res = await request(buildApp()).post(`/sessions/${session._id}/complete`).set('Authorization', `Bearer ${tokenFor(stranger)}`);
  expect(res.status).toBe(403);
});
