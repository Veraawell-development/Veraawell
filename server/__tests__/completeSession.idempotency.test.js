/**
 * Regression test: completeSession must not be able to "complete" a session
 * that has already been cancelled. Without this guard, a stale/replayed
 * request racing a cancellation could silently overwrite status back to
 * 'completed' with no record the session had ever been cancelled (and,
 * depending on timing, no record it had already been refunded).
 */
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
});

function buildApp(userId, role) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { _id: userId, role };
    next();
  });
  app.post('/sessions/:sessionId/cancel', sessionController.cancelSession);
  app.post('/sessions/:sessionId/complete', sessionController.completeSession);
  app.use(errorHandler);
  return app;
}

test('completing an already-cancelled session is rejected, not silently allowed', async () => {
  const patient = await User.create({ firstName: 'Pat', email: 'pat3@test.com', username: 'pat_test3', password: 'x', role: 'patient' });
  const doctor = await User.create({ firstName: 'Doc', email: 'doc3@test.com', username: 'doc_test3', password: 'x', role: 'doctor' });

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

  const app = buildApp(patient._id.toString(), 'patient');

  // Cancel it first
  const cancelRes = await request(app).post(`/sessions/${session._id}/cancel`);
  expect(cancelRes.status).toBe(200);

  const afterCancel = await Session.findById(session._id);
  expect(afterCancel.status).toBe('cancelled');

  // Now try to complete the already-cancelled session
  const completeRes = await request(app).post(`/sessions/${session._id}/complete`);
  expect(completeRes.status).toBe(400);

  const afterComplete = await Session.findById(session._id);
  expect(afterComplete.status).toBe('cancelled'); // unchanged — NOT flipped to 'completed'
});
