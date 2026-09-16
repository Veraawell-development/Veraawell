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
  stuckSessions: '* * * * *',
  paymentCleanup: '*/30 * * * *',
  clawbacks: '0 * * * *'
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

describe('all five jobs are actually registered', () => {
  test('the expected cron expressions are mockScheduled', () => {
    expect(mockScheduled.has(CRON.statusSweep)).toBe(true);
    expect(mockScheduled.has(CRON.notifications)).toBe(true);
    expect(mockScheduled.has(CRON.stuckSessions)).toBe(true);
    expect(mockScheduled.has(CRON.paymentCleanup)).toBe(true);
    // Reconciles payout clawbacks. Load-bearing rather than a backstop while
    // three of the four refund paths still bypass applyTransition and so
    // never fire the inline hook.
    expect(mockScheduled.has(CRON.clawbacks)).toBe(true);
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
    // Nobody was stood up, so nothing is refunded.
    expect(mockRefund).not.toHaveBeenCalled();
    expect((await Session.findById(s._id)).paymentStatus).toBe('paid');
  });

  test('a session where only the doctor joined is still a no-show', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: past(2), duration: 60, price: 1000,
      status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_sweep_03',
      doctorJoined: true, patientJoined: false
    });

    await runJob(CRON.statusSweep);
    const after = await Session.findById(s._id);
    expect(after.status).toBe('no-show');
    // The patient did not attend, so this is THEIR no-show: no refund, and
    // the doctor still earns it. Exact mirror of the auto-refund case below —
    // without this assertion the two are indistinguishable.
    expect(mockRefund).not.toHaveBeenCalled();
    expect(after.paymentStatus).toBe('paid');
  });

  test('a doctor no-show refunds the patient in full, automatically', async () => {
    // RefundPolicyPage.tsx promises exactly this. Before, it was true only for
    // INSTANT sessions (sweepStuckUnacceptedSessions); a patient who waited
    // through a normally-booked session got the no-show status and no money.
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: past(2), duration: 60, price: 1500,
      status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_noshow_real',
      doctorJoined: false, patientJoined: true
    });

    await runJob(CRON.statusSweep);

    const after = await Session.findById(s._id);
    expect(after.status).toBe('no-show');
    expect(after.paymentStatus).toBe('refunded');
    expect(after.refundAmount).toBe(1500);
    expect(after.refundId).toBeTruthy();

    // The gateway was asked for the full amount, in paise, exactly once.
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund.mock.calls[0][0]).toBe('pay_noshow_real');
    expect(mockRefund.mock.calls[0][1].amount).toBe(1500 * 100);
  });

  test('a doctor no-show on a free session refunds nothing and calls no gateway', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: past(2), duration: 60, price: 0,
      status: 'scheduled', paymentStatus: 'not_required', paymentId: null,
      doctorJoined: false, patientJoined: true
    });

    await runJob(CRON.statusSweep);

    const after = await Session.findById(s._id);
    expect(after.status).toBe('no-show');
    expect(after.paymentStatus).toBe('not_required');
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('a doctor no-show whose payment id is synthetic is not sent to the gateway', async () => {
    // Invariant I6: a refund needs a real payment behind it. Asking Razorpay
    // to reverse a fabricated id would 400, and recording it as refunded
    // would invent money movement that never happened.
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: past(2), duration: 60, price: 900,
      status: 'scheduled', paymentStatus: 'paid', paymentId: 'mock_payment_1234',
      doctorJoined: false, patientJoined: true
    });

    await runJob(CRON.statusSweep);

    const after = await Session.findById(s._id);
    expect(after.status).toBe('no-show');
    expect(after.paymentStatus).toBe('paid');
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('a gateway failure leaves the refund in the admin retry queue, not lost', async () => {
    mockRefund.mockRejectedValueOnce(new Error('Razorpay unavailable'));
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: past(2), duration: 60, price: 1200,
      status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_noshow_fails',
      doctorJoined: false, patientJoined: true
    });

    await runJob(CRON.statusSweep);

    const after = await Session.findById(s._id);
    expect(after.status).toBe('no-show');
    // refund_failed, not stuck in refund_pending and not silently 'paid' —
    // this is the state getFailedRefunds surfaces and retryRefund acts on.
    expect(after.paymentStatus).toBe('refund_failed');
    expect(after.refundId).toBeFalsy();
  });

  test('a second sweep does not refund an already-refunded no-show', async () => {
    // The sweep runs every five minutes. The claim transition is what makes a
    // repeat harmless: the second pass cannot re-enter paid -> refund_pending.
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: past(2), duration: 60, price: 700,
      status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_noshow_twice',
      doctorJoined: false, patientJoined: true
    });

    await runJob(CRON.statusSweep);
    await runJob(CRON.statusSweep);

    expect(mockRefund).toHaveBeenCalledTimes(1);
    const after = await Session.findById(s._id);
    expect(after.paymentStatus).toBe('refunded');
    expect(after.refundAmount).toBe(700);
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

  test('both cleanup paths expire a checkout at the same age', async () => {
    // This test used to pin a three-way disagreement as the expected
    // behaviour: getDoctorSlots expired a checkout at 15 minutes, this job at
    // 30, and CHECKOUT_TTL_MINUTES — the constant documented as "one number,
    // one owner" — was read by neither. A 20-minute-old checkout was
    // simultaneously dead to anyone loading the slot list and alive to the
    // scheduler, so whether a slot came back depended on which ran first.
    //
    // Both now read the constant, so there is a single expiry age.
    const { CHECKOUT_TTL_MINUTES } = require('../../config/time');

    const makeAbandoned = async (ageMinutes, orderId) => {
      const s = await Session.create({
        patientId: f.patientA._id, doctorId: f.doctorA._id,
        startsAt: new Date(Date.now() + 3 * 864e5), duration: 60, price: 1000,
        status: 'payment_pending', paymentStatus: 'pending',
        razorpayOrderId: orderId, paymentId: null
      });
      await Session.collection.updateOne(
        { _id: s._id },
        { $set: { createdAt: new Date(Date.now() - ageMinutes * 60 * 1000) } }
      );
      return s;
    };

    const younger = await makeAbandoned(CHECKOUT_TTL_MINUTES - 1, 'order_ttl_young');
    const older = await makeAbandoned(CHECKOUT_TTL_MINUTES + 1, 'order_ttl_old');

    await runJob(CRON.paymentCleanup);

    // Just inside the window: the patient can still complete checkout.
    expect((await Session.findById(younger._id)).paymentStatus).toBe('pending');
    // Past it: released, so the slot goes back on sale.
    expect((await Session.findById(older._id)).paymentStatus).toBe('failed');
    expect((await Session.findById(older._id)).status).toBe('cancelled');
  });

  test('the two cleanup paths read the same constant, not their own literals', async () => {
    // The disagreement above was invisible because each path hardcoded its own
    // number. Grepping for a literal minute-count in either is how a future
    // edit reintroduces it.
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..', '..');

    const controller = fs.readFileSync(path.join(root, 'controllers', 'session.controller.js'), 'utf8');
    const scheduler = fs.readFileSync(path.join(root, 'services', 'scheduler.js'), 'utf8');

    expect(controller).toContain('CHECKOUT_TTL_MINUTES');
    expect(scheduler).toContain('CHECKOUT_TTL_MINUTES');
    expect(controller).not.toContain('15 * 60 * 1000');
    expect(scheduler).not.toContain('30 * 60 * 1000');
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

describe('stuck unaccepted instant sessions (every minute)', () => {
  test('a paid instant session the doctor never accepted is cancelled and refunded', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() - 20 * 60 * 1000),
      duration: 20, price: 800,
      status: 'active', paymentStatus: 'paid', paymentId: 'pay_stuck_01',
      sessionType: 'immediate', acceptanceStatus: 'pending',
      // The deadline is now what expires a request, not its age. Stamped at
      // payment so a slow checkout does not eat the doctor's window.
      acceptanceDeadline: new Date(Date.now() - 60 * 1000),
      ringDeliveredAt: new Date()
    });

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
      sessionType: 'immediate', acceptanceStatus: 'pending',
      acceptanceDeadline: new Date(Date.now() + 2 * 60 * 1000)
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
      sessionType: 'immediate', acceptanceStatus: 'accepted',
      acceptanceDeadline: null
    });

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
