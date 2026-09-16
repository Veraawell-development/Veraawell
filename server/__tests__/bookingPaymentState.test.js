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

const { mountRoutes, tokenFor } = require('./helpers/harness');

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

/**
 * The real router, so requests travel verifyToken -> authorize -> controller.
 * Mounting the controller directly behind a stubbed req.user would bypass the
 * exact middleware chain these behaviours now depend on.
 */
function buildApp() {
  return mountRoutes({ '/sessions': '../../routes/sessions' });
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

/**
 * A doctor with prices and one bookable slot three days out.
 *
 * `payoutApproved` is the bookability gate. It replaced a check for a
 * non-synthetic `razorpayAccountId`, which belonged to the removed Razorpay
 * Route split — `extraProfile` lets a case set that legacy field to prove it
 * no longer grants anything.
 */
async function seedDoctor({ payoutApproved = true, ...extraProfile } = {}) {
  const doctor = await mkUser('doctor');
  await DoctorProfile.create({
    userId: doctor._id,
    specialization: ['Anxiety'], experience: 5, qualification: ['MPhil'],
    languages: ['English'], treatsFor: ['Anxiety'], type: 'Clinical Psychologist',
    pricing: { min: 2000, max: 2000, session20: 2000 },
    payoutApproved,
    ...extraProfile
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
    const { doctor, dateStr } = await seedDoctor();

    const res = await request(buildApp())
      .post('/sessions/book').set('Authorization', `Bearer ${tokenFor(patient)}`).send(bookBody(doctor, dateStr));

    expect(res.status).toBe(502);
    // The decisive assertion is the absence of a session, not the status code:
    // the old behaviour returned 201 with a confirmed, joinable booking.
    expect(await Session.countDocuments({})).toBe(0);
  });

  test('a doctor whose payouts are not approved cannot be booked, rather than booked for free', async () => {
    const patient = await mkUser('patient');
    const { doctor, dateStr } = await seedDoctor({ payoutApproved: false });

    const res = await request(buildApp())
      .post('/sessions/book').set('Authorization', `Bearer ${tokenFor(patient)}`).send(bookBody(doctor, dateStr));

    expect(res.status).toBe(409);
    // Refused before the gateway is touched: no order, no money, no session.
    expect(mockOrdersCreate).not.toHaveBeenCalled();
    expect(await Session.countDocuments({})).toBe(0);
  });

  test('payoutApproved defaults to false, so a profile that never went through approval is refused', async () => {
    // The schema default is the fail-closed half of the gate. A doctor created
    // by any path that does not explicitly approve them is unbookable.
    const patient = await mkUser('patient');
    const doctor = await mkUser('doctor');
    await DoctorProfile.create({
      userId: doctor._id,
      specialization: ['Anxiety'], experience: 5, qualification: ['MPhil'],
      languages: ['English'], treatsFor: ['Anxiety'], type: 'Clinical Psychologist',
      pricing: { min: 2000, max: 2000, session20: 2000 }
      // payoutApproved deliberately not set
    });
    const dateStr = new Date(Date.now() + 3 * 864e5).toISOString().split('T')[0];
    await DoctorAvailability.create({
      doctorId: doctor._id, availabilityType: 'same_slots',
      defaultSlots: ['10:00 AM'], activeDates: [dateStr]
    });

    const res = await request(buildApp())
      .post('/sessions/book').set('Authorization', `Bearer ${tokenFor(patient)}`).send(bookBody(doctor, dateStr));

    expect(res.status).toBe(409);
    expect(await Session.countDocuments({})).toBe(0);
  });

  test('a leftover razorpayAccountId no longer makes a doctor bookable on its own', async () => {
    // Every live doctor carries one of these from the Route era, including
    // fabricated `acc_mock_` ids that approveOnboarding wrote on failure.
    // Bookability must now come from payoutApproved and nothing else, or the
    // migration would silently re-enable doctors nobody can pay.
    const patient = await mkUser('patient');
    const { doctor, dateStr } = await seedDoctor({
      payoutApproved: false,
      razorpayAccountId: 'acc_live_looksTotallyReal',
      payoutSetupCompleted: true,
      razorpayOnboardingStatus: 'active'
    });

    const res = await request(buildApp())
      .post('/sessions/book').set('Authorization', `Bearer ${tokenFor(patient)}`).send(bookBody(doctor, dateStr));

    expect(res.status).toBe(409);
    expect(await Session.countDocuments({})).toBe(0);
  });

  test('a successful order yields payment_pending, never paid', async () => {
    mockOrdersCreate.mockResolvedValue({ id: 'order_realone' });
    const patient = await mkUser('patient');
    const { doctor, dateStr } = await seedDoctor();

    const res = await request(buildApp())
      .post('/sessions/book').set('Authorization', `Bearer ${tokenFor(patient)}`).send(bookBody(doctor, dateStr));

    expect(res.status).toBe(201);
    const session = await Session.findOne({});
    expect(session.paymentStatus).toBe('pending');
    expect(session.status).toBe('payment_pending');
    expect(session.paymentId).toBeNull();
    expect(session.razorpayOrderId).toBe('order_realone');

    // No Route split: the whole amount goes to the platform account and the
    // doctor's share is settled by the weekly payout run, not by the gateway.
    const orderPayload = mockOrdersCreate.mock.calls[0][0];
    expect(orderPayload).not.toHaveProperty('transfers');
    expect(orderPayload.amount).toBe(2000 * 100);
  });

  test('no code path produces a synthetic mock_payment_ id on a priced booking', async () => {
    mockOrdersCreate.mockResolvedValue({ id: 'order_realone' });
    const patient = await mkUser('patient');
    const { doctor, dateStr } = await seedDoctor();
    await request(buildApp())
      .post('/sessions/book').set('Authorization', `Bearer ${tokenFor(patient)}`).send(bookBody(doctor, dateStr));

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

    const res = await request(buildApp())
      .post(`/sessions/${session._id}/cancel`).set('Authorization', `Bearer ${tokenFor(patient)}`).send({});

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

    await request(buildApp())
      .post(`/sessions/${session._id}/cancel`).set('Authorization', `Bearer ${tokenFor(patient)}`).send({});

    const after = await Session.findById(session._id);
    expect(after.paymentStatus).toBe('not_required');
    expect(after.refundAmount).toBe(0);
    expect(mockRefund).not.toHaveBeenCalled();
  });
});
