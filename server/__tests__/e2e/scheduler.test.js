/**
 * The four cron jobs — 0% covered before this file.
 *
 * They are the highest-risk untested code in the repository: they run
 * unattended on every successful DB connect (server.js:103-104), they send
 * email, and they cancel sessions and move money. Only runSessionStatusUpdate
 * is exported; the other three are closures created inside startScheduler, so
 * node-cron is mocked to capture each callback by its cron expression and the
 * jobs are then invoked directly. That tests the real job bodies without
 * waiting on wall-clock time.
 */

require('../support/env');

const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

/** Capture every mockScheduled callback instead of arming a real timer. */
const mockScheduled = new Map();
jest.mock('node-cron', () => ({
  schedule: (expression, fn) => {
    const list = mockScheduled.get(expression) || [];
    list.push(fn);
    mockScheduled.set(expression, list);
    return { stop: jest.fn(), start: jest.fn() };
  }
}));

const mockReminder = jest.fn().mockResolvedValue({ id: 'sink' });
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: (_t, name) => (name === 'sendSessionReminderEmail'
    ? (...a) => mockReminder(...a)
    : jest.fn().mockResolvedValue({ id: 'sink' }))
}));

const mockRefund = jest.fn().mockResolvedValue({ id: 'rfnd_sweep', status: 'processed' });
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: mockRefund, fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));

const CRON = {
  statusSweep: '*/5 * * * *',
  notifications: '* * * * *',
  stuckSessions: '*/2 * * * *',
  paymentCleanup: '*/30 * * * *'
};

let Session, DoctorAvailability, User, DoctorProfile;
let f;
let scheduler;

/** Run every callback registered against a cron expression. */
async function runJob(expression) {
  const fns = mockScheduled.get(expression) || [];
  expect(fns.length).toBeGreaterThan(0);
  for (const fn of fns) await fn();
}

beforeAll(async () => {
  await connectDb('scheduler');
  Session = require('../../models/session');
  DoctorAvailability = require('../../models/doctorAvailability');
  User = require('../../models/user');
  DoctorProfile = require('../../models/doctorProfile');

  const { seedAll } = require('../support/seed');
  f = await seedAll();

  scheduler = require('../../services/scheduler');
  // A fake io; the jobs only ever emit through it.
  scheduler.startScheduler({ of: () => ({ to: () => ({ emit: jest.fn() }) }), to: () => ({ emit: jest.fn() }) });
}, 180000);

afterAll(async () => {
  if (scheduler && scheduler.stopScheduler) scheduler.stopScheduler();
  await disconnectDb();
});

beforeEach(async () => {
  await Session.deleteMany({});
  mockReminder.mockClear();
  mockRefund.mockClear();
});

describe('all four jobs are actually registered', () => {
  test('the expected cron expressions are mockScheduled', () => {
    expect(mockScheduled.has(CRON.statusSweep)).toBe(true);
    expect(mockScheduled.has(CRON.notifications)).toBe(true);
    expect(mockScheduled.has(CRON.stuckSessions)).toBe(true);
    expect(mockScheduled.has(CRON.paymentCleanup)).toBe(true);
  });

  test('calling startScheduler twice does not double-register', () => {
    const before = Array.from(mockScheduled.values()).reduce((n, l) => n + l.length, 0);
    scheduler.startScheduler({ of: () => ({ to: () => ({ emit: jest.fn() }) }) });
    const after = Array.from(mockScheduled.values()).reduce((n, l) => n + l.length, 0);
    expect(after).toBe(before);
  });
});

describe('session status sweep (every 5 minutes)', () => {
  const past = (h) => new Date(Date.now() - h * 3600 * 1000);

  test('an ended session both parties joined becomes completed', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: past(2), duration: 60, price: 1000,
      status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_sweep_01',
      doctorJoined: true, patientJoined: true
    });

    await runJob(CRON.statusSweep);

    const after = await Session.findById(s._id);
    expect(after.status).toBe('completed');
    expect(after.callStatus).toBe('completed');
  });

  test('an ended session nobody joined becomes no-show', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: past(2), duration: 60, price: 1000,
      status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_sweep_02'
    });

    await runJob(CRON.statusSweep);
    expect((await Session.findById(s._id)).status).toBe('no-show');
  });

  test('a session where only the doctor joined is still a no-show', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: past(2), duration: 60, price: 1000,
      status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_sweep_03',
      doctorJoined: true, patientJoined: false
    });

    await runJob(CRON.statusSweep);
    expect((await Session.findById(s._id)).status).toBe('no-show');
  });

  test('a future session is left alone', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + 3 * 3600 * 1000), duration: 60, price: 1000,
      status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_sweep_04'
    });

    await runJob(CRON.statusSweep);
    expect((await Session.findById(s._id)).status).toBe('scheduled');
  });

  test('a session older than the 24h window is NOT swept', async () => {
    // The query is bounded to endsAt within the last 24 hours to avoid a full
    // collection scan. Anything that fell through earlier stays stuck forever
    // — a deliberate trade-off worth pinning, because it means an outage
    // longer than a day leaves sessions permanently in 'scheduled'.
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: past(30), duration: 60, price: 1000,
      status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_sweep_05'
    });

    await runJob(CRON.statusSweep);
    expect((await Session.findById(s._id)).status).toBe('scheduled');
  });

  test('an already-cancelled session is not resurrected', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: past(2), duration: 60, price: 1000,
      status: 'cancelled', paymentStatus: 'refunded',
      paymentId: 'pay_sweep_06', refundId: 'rfnd_x', refundAmount: 1000
    });

    await runJob(CRON.statusSweep);
    expect((await Session.findById(s._id)).status).toBe('cancelled');
  });

  test('the exported job reports how many rows it changed', async () => {
    await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: past(2), duration: 60, price: 1000,
      status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_sweep_07'
    });
    expect(await scheduler.runSessionStatusUpdate()).toBe(1);
    // Idempotent: a second pass has nothing left to do.
    expect(await scheduler.runSessionStatusUpdate()).toBe(0);
  });
});

describe('reminder notifications (every minute)', () => {
  /** A session starting `minutes` from now. */
  async function upcoming(minutes, overrides = {}) {
    return Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + minutes * 60 * 1000),
      duration: 60, price: 1000,
      status: 'scheduled', paymentStatus: 'paid', paymentId: `pay_notify_${minutes}`,
      ...overrides
    });
  }

  test('a session 15 minutes out gets exactly one reminder, then never again', async () => {
    const s = await upcoming(15);

    await runJob(CRON.notifications);
    expect(mockReminder).toHaveBeenCalledTimes(1);
    expect(mockReminder.mock.calls[0][2]).toBe('15min');
    expect((await Session.findById(s._id)).notificationStatus.reminderSent).toBe(true);

    mockReminder.mockClear();
    await runJob(CRON.notifications);
    expect(mockReminder).not.toHaveBeenCalled();
  });

  test('a session 2 minutes out gets the starting-soon mail', async () => {
    await upcoming(2);
    await runJob(CRON.notifications);
    expect(mockReminder).toHaveBeenCalledTimes(1);
    expect(mockReminder.mock.calls[0][2]).toBe('start');
  });

  test('a session 7 minutes late alerts only when the patient has not joined', async () => {
    await upcoming(-7, { patientJoined: true });
    await runJob(CRON.notifications);
    expect(mockReminder).not.toHaveBeenCalled();

    await Session.deleteMany({});
    await upcoming(-7, { patientJoined: false });
    await runJob(CRON.notifications);
    expect(mockReminder).toHaveBeenCalledTimes(1);
    expect(mockReminder.mock.calls[0][2]).toBe('late');
  });

  test('a session outside every window is not mailed', async () => {
    await upcoming(45);
    await runJob(CRON.notifications);
    expect(mockReminder).not.toHaveBeenCalled();
  });

  test('a cancelled session is never mailed', async () => {
    await upcoming(15, { status: 'cancelled' });
    await runJob(CRON.notifications);
    expect(mockReminder).not.toHaveBeenCalled();
  });

  test('a session whose patient has no email is skipped without throwing', async () => {
    const ghost = new mongoose.Types.ObjectId();
    await Session.create({
      patientId: ghost, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + 15 * 60 * 1000),
      duration: 60, price: 1000, status: 'scheduled',
      paymentStatus: 'paid', paymentId: 'pay_ghost'
    });

    await expect(runJob(CRON.notifications)).resolves.not.toThrow();
    expect(mockReminder).not.toHaveBeenCalled();
  });

  test('an email failure does not abort the sweep or kill the job', async () => {
    mockReminder.mockRejectedValueOnce(new Error('resend is down'));
    await upcoming(15);
    await expect(runJob(CRON.notifications)).resolves.not.toThrow();
    // And the job still runs next tick.
    await expect(runJob(CRON.notifications)).resolves.not.toThrow();
  });
});

describe('expired payment cleanup (every 30 minutes)', () => {
  test('a checkout abandoned over 30 minutes ago is failed and its slot released', async () => {
    const { utcToZoned, zonedToUtc } = require('../../utils/zonedTime');
    const { PLATFORM_TIMEZONE } = require('../../config/time');
    // bookSlot only matches a slot the grid actually publishes, so use one of
    // the seeded defaultSlots rather than an arbitrary time of day.
    const localDate = utcToZoned(new Date(Date.now() + 3 * 864e5), PLATFORM_TIMEZONE).localDate;
    const localTime = '09:00';
    const when = zonedToUtc(localDate, localTime, PLATFORM_TIMEZONE);

    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: when, duration: 60, price: 1000,
      status: 'payment_pending', paymentStatus: 'pending',
      razorpayOrderId: 'order_abandoned_01', paymentId: null
    });
    // createdAt is set by the timestamp plugin; age it past the threshold.
    await Session.collection.updateOne(
      { _id: s._id },
      { $set: { createdAt: new Date(Date.now() - 45 * 60 * 1000) } }
    );

    const avail = await DoctorAvailability.findOne({ doctorId: f.doctorA._id });
    await avail.bookSlot(localDate, localTime, s._id);
    expect((await DoctorAvailability.findOne({ doctorId: f.doctorA._id })).bookedSlots.length).toBeGreaterThan(0);

    await runJob(CRON.paymentCleanup);

    const after = await Session.findById(s._id);
    expect(after.paymentStatus).toBe('failed');
    expect(after.status).toBe('cancelled');

    const availAfter = await DoctorAvailability.findOne({ doctorId: f.doctorA._id });
    expect(availAfter.bookedSlots.filter((b) => String(b.sessionId) === String(s._id))).toHaveLength(0);
  });

  test('a checkout 20 minutes old survives the 30-minute job — but the request-path cleanup uses 15', async () => {
    // Three different answers to one question:
    //   getDoctorSlots  -> 15 minutes (session.controller.js:276)
    //   this job        -> 30 minutes
    //   CHECKOUT_TTL_MINUTES = 20 (config/time.js:40) -> used by neither.
    // A 20-minute-old checkout is therefore already dead to anyone loading the
    // slot list, but still 'pending' to the scheduler.
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + 3 * 864e5), duration: 60, price: 1000,
      status: 'payment_pending', paymentStatus: 'pending',
      razorpayOrderId: 'order_abandoned_02', paymentId: null
    });
    await Session.collection.updateOne(
      { _id: s._id },
      { $set: { createdAt: new Date(Date.now() - 20 * 60 * 1000) } }
    );

    await runJob(CRON.paymentCleanup);
    expect((await Session.findById(s._id)).paymentStatus).toBe('pending');

    const { CHECKOUT_TTL_MINUTES } = require('../../config/time');
    expect(CHECKOUT_TTL_MINUTES).toBe(20);
  });

  test('a session with no Razorpay order is not touched', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + 3 * 864e5), duration: 60, price: 0,
      status: 'scheduled', paymentStatus: 'not_required', razorpayOrderId: null
    });
    await Session.collection.updateOne(
      { _id: s._id },
      { $set: { createdAt: new Date(Date.now() - 90 * 60 * 1000) } }
    );

    await runJob(CRON.paymentCleanup);
    expect((await Session.findById(s._id)).paymentStatus).toBe('not_required');
  });

  test('an already-paid session is never swept, however old', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + 3 * 864e5), duration: 60, price: 1000,
      status: 'scheduled', paymentStatus: 'paid',
      razorpayOrderId: 'order_paid_01', paymentId: 'pay_real_01'
    });
    await Session.collection.updateOne(
      { _id: s._id },
      { $set: { createdAt: new Date(Date.now() - 120 * 60 * 1000) } }
    );

    await runJob(CRON.paymentCleanup);
    expect((await Session.findById(s._id)).paymentStatus).toBe('paid');
  });
});

describe('stuck unaccepted instant sessions (every 2 minutes)', () => {
  test('a paid instant session the doctor never accepted is cancelled and refunded', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() - 20 * 60 * 1000),
      duration: 20, price: 800,
      status: 'active', paymentStatus: 'paid', paymentId: 'pay_stuck_01',
      sessionType: 'immediate', acceptanceStatus: 'pending'
    });
    await Session.collection.updateOne(
      { _id: s._id },
      { $set: { createdAt: new Date(Date.now() - 20 * 60 * 1000) } }
    );

    await runJob(CRON.stuckSessions);

    const after = await Session.findById(s._id);
    expect(after.status).toBe('cancelled');
    expect(mockRefund).toHaveBeenCalledTimes(1);
  });

  test('a recently created instant session is left alone', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(), duration: 20, price: 800,
      status: 'active', paymentStatus: 'paid', paymentId: 'pay_stuck_02',
      sessionType: 'immediate', acceptanceStatus: 'pending'
    });

    await runJob(CRON.stuckSessions);
    expect((await Session.findById(s._id)).status).toBe('active');
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('an accepted instant session is not swept', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() - 20 * 60 * 1000),
      duration: 20, price: 800,
      status: 'active', paymentStatus: 'paid', paymentId: 'pay_stuck_03',
      sessionType: 'immediate', acceptanceStatus: 'accepted'
    });
    await Session.collection.updateOne(
      { _id: s._id },
      { $set: { createdAt: new Date(Date.now() - 20 * 60 * 1000) } }
    );

    await runJob(CRON.stuckSessions);
    expect((await Session.findById(s._id)).status).toBe('active');
    expect(mockRefund).not.toHaveBeenCalled();
  });
});

describe('resilience', () => {
  test('stopScheduler is safe to call and leaves the module reusable', () => {
    expect(() => scheduler.stopScheduler()).not.toThrow();
  });
});
