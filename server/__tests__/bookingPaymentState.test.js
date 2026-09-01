/**
 * A booking that owes money must never be created as already paid.
 *
 * Regression cover for two verified defects:
 *
 *  1. FREE PAID BOOKINGS. bookSession/bookImmediate wrapped Razorpay order
 *     creation in a try/catch that only logged a warning, then fell through to
 *     `paymentStatus: 'paid'` with a fabricated `mock_payment_<ts>` id. Three
 *     inputs reached that fall-through: a doctor with no razorpayAccountId, a
 *     doctor with a fake `acc_mock_...` id (which approveOnboarding writes on
 *     any SDK error), and a gateway outage. Reproduced against the running
 *     server: HTTP 201, price=2000, paymentStatus=paid, ₹0 collected.
 *
 *  2. FABRICATED REFUNDS. Cancelling a session that was still
 *     `payment_pending` fell into cancelSession's final `else` and wrote
 *     `paymentStatus: 'refunded'` with a non-zero refundAmount against
 *     `paymentId: null` — a refund of money never collected, which then feeds
 *     revenue analytics and the admin refund tooling. Reproduced:
 *     refundAmount=1500 on a never-paid session.
 */

process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'dummy_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'dummy_webhook';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const request = require('supertest');

// Razorpay is mocked so we can drive order creation to succeed or fail on
// demand, and assert it is never bypassed.
const mockOrdersCreate = jest.fn();
const mockRefund = jest.fn().mockResolvedValue({ id: 'rfnd_test', status: 'processed' });
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: mockOrdersCreate },
  payments: { refund: mockRefund, fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));

jest.mock('../services/email.service', () => ({
  sendBookingConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendDoctorNewBookingEmail: jest.fn().mockResolvedValue(undefined),
  sendCancellationEmail: jest.fn().mockResolvedValue(undefined),
  sendDoctorSessionSummaryEmail: jest.fn().mockResolvedValue(undefined)
}));

const { errorHandler } = require('../middleware/error.middleware');

let mongod;
let Session, User, DoctorProfile, DoctorAvailability, PlatformSettings, sessionController;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  Session = require('../models/session');
  User = require('../models/user');
  DoctorProfile = require('../models/doctorProfile');
  DoctorAvailability = require('../models/doctorAvailability');
  PlatformSettings = require('../models/platformSettings');
  sessionController = require('../controllers/session.controller');
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all([
    Session.deleteMany({}), User.deleteMany({}),
    DoctorProfile.deleteMany({}), DoctorAvailability.deleteMany({})
  ]);
  mockOrdersCreate.mockReset();
  mockRefund.mockClear();
});

/** Simulates verifyToken having already run. */
function buildApp(userId, role) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { _id: userId, role }; next(); });
  app.post('/sessions/book', sessionController.bookSession);
  app.post('/sessions/:sessionId/cancel', sessionController.cancelSession);
  app.use(errorHandler);
  return app;
}

let seq = 0;
async function mkUser(role) {
  seq += 1;
  return User.create({
    firstName: role === 'doctor' ? 'Doc' : 'Pat',
    lastName: 'Test',
    email: `${role}${seq}@test.com`,
    username: `${role}${seq}_test`,
    password: 'password123',
    role,
    approvalStatus: 'approved'
  });
}

/** A doctor with prices and one bookable slot three days out. */
async function seedDoctor({ razorpayAccountId }) {
  const doctor = await mkUser('doctor');
  await DoctorProfile.create({
    userId: doctor._id,
    specialization: ['Anxiety'], experience: 5, qualification: ['MPhil'],
    languages: ['English'], treatsFor: ['Anxiety'], type: 'Clinical Psychologist',
    pricing: { min: 2000, max: 2000, session20: 2000 },
    razorpayAccountId
  });
  const dateStr = new Date(Date.now() + 3 * 864e5).toISOString().split('T')[0];
  await DoctorAvailability.create({
    doctorId: doctor._id, availabilityType: 'same_slots',
    defaultSlots: ['10:00 AM'], activeDates: [dateStr]
  });
  return { doctor, dateStr };
}

function bookBody(doctor, dateStr) {
  return {
    doctorId: doctor._id.toString(), sessionDate: dateStr, sessionTime: '10:00 AM',
    price: 2000, mode: 'video', duration: 20
  };
}

describe('a booking that owes money is never created as paid', () => {
  test('gateway failure rejects the booking instead of creating a free paid session', async () => {
    mockOrdersCreate.mockRejectedValue(new Error('Razorpay is down'));
    const patient = await mkUser('patient');
    const { doctor, dateStr } = await seedDoctor({ razorpayAccountId: 'acc_REAL_LOOKING' });

    const res = await request(buildApp(patient._id, 'patient'))
      .post('/sessions/book').send(bookBody(doctor, dateStr));

    expect(res.status).toBe(502);
    // The decisive assertion is the absence of a session, not the status code:
    // the old behaviour returned 201 with a confirmed, joinable booking.
    expect(await Session.countDocuments({})).toBe(0);
  });

  test('a doctor with no payout account cannot be booked, rather than booked for free', async () => {
    const patient = await mkUser('patient');
    const { doctor, dateStr } = await seedDoctor({ razorpayAccountId: null });

    const res = await request(buildApp(patient._id, 'patient'))
      .post('/sessions/book').send(bookBody(doctor, dateStr));

    expect(res.status).toBe(409);
    expect(mockOrdersCreate).not.toHaveBeenCalled();
    expect(await Session.countDocuments({})).toBe(0);
  });

  test('a fabricated acc_mock_ payout account is treated as no account', async () => {
    const patient = await mkUser('patient');
    const { doctor, dateStr } = await seedDoctor({ razorpayAccountId: 'acc_mock_deadbeef' });

    const res = await request(buildApp(patient._id, 'patient'))
      .post('/sessions/book').send(bookBody(doctor, dateStr));

    expect(res.status).toBe(409);
    expect(await Session.countDocuments({})).toBe(0);
  });

  test('a successful order yields payment_pending, never paid', async () => {
    mockOrdersCreate.mockResolvedValue({ id: 'order_realone' });
    const patient = await mkUser('patient');
    const { doctor, dateStr } = await seedDoctor({ razorpayAccountId: 'acc_REAL_LOOKING' });

    const res = await request(buildApp(patient._id, 'patient'))
      .post('/sessions/book').send(bookBody(doctor, dateStr));

    expect(res.status).toBe(201);
    const session = await Session.findOne({});
    expect(session.paymentStatus).toBe('pending');
    expect(session.status).toBe('payment_pending');
    expect(session.paymentId).toBeNull();
    expect(session.razorpayOrderId).toBe('order_realone');
  });

  test('no code path produces a synthetic mock_payment_ id on a priced booking', async () => {
    mockOrdersCreate.mockResolvedValue({ id: 'order_realone' });
    const patient = await mkUser('patient');
    const { doctor, dateStr } = await seedDoctor({ razorpayAccountId: 'acc_REAL_LOOKING' });
    await request(buildApp(patient._id, 'patient'))
      .post('/sessions/book').send(bookBody(doctor, dateStr));

    const paid = await Session.find({ paymentStatus: 'paid' });
    expect(paid).toHaveLength(0);
    const synthetic = await Session.find({ paymentId: /^(mock_|immediate_)/ });
    expect(synthetic).toHaveLength(0);
  });
});

describe('cancelling a session that was never paid does not fabricate a refund', () => {
  test('a payment_pending session becomes failed with refundAmount 0', async () => {
    const patient = await mkUser('patient');
    const doctor = await mkUser('doctor');
    const session = await Session.create({
      patientId: patient._id, doctorId: doctor._id,
      sessionDate: new Date(Date.now() + 5 * 864e5), sessionTime: '10:00 AM',
      duration: 60, price: 1500,
      status: 'payment_pending', paymentStatus: 'pending',
      razorpayOrderId: 'order_abandoned', paymentId: null
    });

    const res = await request(buildApp(patient._id, 'patient'))
      .post(`/sessions/${session._id}/cancel`).send({});

    expect(res.status).toBe(200);
    const after = await Session.findById(session._id);
    expect(after.status).toBe('cancelled');
    expect(after.paymentStatus).toBe('failed');   // was: 'refunded'
    expect(after.refundAmount).toBe(0);           // was: 1500
    expect(mockRefund).not.toHaveBeenCalled();    // no gateway call for money never taken
  });

  test('a not_required session stays not_required and is never marked paid', async () => {
    const patient = await mkUser('patient');
    const doctor = await mkUser('doctor');
    const session = await Session.create({
      patientId: patient._id, doctorId: doctor._id,
      sessionDate: new Date(Date.now() + 5 * 864e5), sessionTime: '10:00 AM',
      duration: 60, price: 0,
      status: 'scheduled', paymentStatus: 'not_required', paymentId: null
    });

    await request(buildApp(patient._id, 'patient'))
      .post(`/sessions/${session._id}/cancel`).send({});

    const after = await Session.findById(session._id);
    expect(after.paymentStatus).toBe('not_required');
    expect(after.refundAmount).toBe(0);
    expect(mockRefund).not.toHaveBeenCalled();
  });
});
