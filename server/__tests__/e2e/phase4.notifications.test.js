/**
 * Phase 4: the emails and notices that follow money and reminders —
 * a checkout that expired after a failed payment, a payment that arrived too
 * late, a refund made outside the app, and reminders that are claimed before
 * they are sent and retried when sending fails.
 */
require('../support/env');

const mockRefund = jest.fn();
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn(), fetchPayments: jest.fn().mockResolvedValue({ items: [] }) },
  payments: { refund: mockRefund, fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
const mockMail = {};
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: (_t, name) => {
    if (!mockMail[name]) mockMail[name] = jest.fn().mockResolvedValue({ id: 'sink' });
    return mockMail[name];
  }
}));

const { startDb, stopDb, clearDb, makeUser, makeSession } = require('../helpers/harness');

let Session, sessionPayment, scheduler;

beforeAll(async () => {
  process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_x';
  process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'secret_x';
  await startDb('phase4.notifications');
  Session = require('../../models/session');
  sessionPayment = require('../../services/sessionPayment');
  scheduler = require('../../services/scheduler');
});
afterAll(async () => { await stopDb(); });
afterEach(async () => {
  // Cleared, not replaced: modules hold on to the functions they destructured.
  for (const fn of Object.values(mockMail)) { fn.mockReset(); fn.mockResolvedValue({ id: 'sink' }); }
  mockRefund.mockReset();
  await clearDb();
});

async function people() {
  return { patient: await makeUser('patient'), doctor: await makeUser('doctor') };
}

describe('a checkout that expires unpaid', () => {
  test('after a failed payment attempt: the patient is told (once, at expiry, not per attempt)', async () => {
    const { patient, doctor } = await people();
    const s = await makeSession({
      patient, doctor, status: 'payment_pending', paymentStatus: 'pending', paymentId: null,
      razorpayOrderId: null, lastPaymentFailureAt: new Date()
    });
    await Session.updateOne({ _id: s._id }, { $set: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } }, { timestamps: false });
    const result = await sessionPayment.expireCheckout(await Session.findById(s._id));
    expect(result.outcome).toBe('expired');
    expect(mockMail.sendPaymentFailedEmail).toHaveBeenCalledTimes(1);
    expect(mockMail.sendPaymentFailedEmail.mock.calls[0][0]).toBe(patient.email);
    expect(mockMail.sendPaymentFailedEmail.mock.calls[0][1]).toMatchObject({ amount: 1000, doctorName: expect.stringContaining('doctor') });
  });

  test('closed without a failed attempt: no email (the patient closed it themselves)', async () => {
    const { patient, doctor } = await people();
    const s = await makeSession({ patient, doctor, status: 'payment_pending', paymentStatus: 'pending', paymentId: null, razorpayOrderId: null });
    await sessionPayment.expireCheckout(await Session.findById(s._id));
    expect(require('../../services/email.service').sendPaymentFailedEmail).not.toHaveBeenCalled();
  });
});

describe('a payment that lands after its checkout expired', () => {
  /** A checkout that expired unpaid (the way the sweep does it). */
  async function expiredCheckout(patient, doctor, orderId) {
    const s = await makeSession({ patient, doctor, status: 'payment_pending', paymentStatus: 'pending', paymentId: null, razorpayOrderId: null });
    await sessionPayment.expireCheckout(await Session.findById(s._id));
    await Session.updateOne({ _id: s._id }, { $set: { razorpayOrderId: orderId } }, { timestamps: false });
    return Session.findById(s._id);
  }

  test('refunded, and the patient is told why', async () => {
    const { patient, doctor } = await people();
    const s = await expiredCheckout(patient, doctor, 'order_late');
    mockRefund.mockResolvedValue({ id: 'rfnd_late', status: 'processed' });
    const result = await sessionPayment.confirmPayment({ session: s._id, paymentId: 'pay_late_1', actor: require('../../services/sessionState').ACTOR.RAZORPAY });
    expect(result.outcome).toBe('late-capture-refunded');
    const notice = mockMail.sendNoticeEmail.mock.calls.find(([to]) => to === patient.email);
    expect(notice[1].subject).toMatch(/arrived after the booking expired/);
    expect(notice[1].paragraphs.join(' ')).toMatch(/refunded it in full/);
    expect(notice[1]).toMatchObject({ amountLabel: 'Refund', amount: 1000 });
  });

  test('a refund the gateway refuses: the notice says it is being processed', async () => {
    const { patient, doctor } = await people();
    const s = await expiredCheckout(patient, doctor, 'order_late2');
    mockRefund.mockRejectedValue(Object.assign(new Error('declined'), { error: { description: 'declined' } }));
    await sessionPayment.confirmPayment({ session: s._id, paymentId: 'pay_late_2', actor: require('../../services/sessionState').ACTOR.RAZORPAY });
    const notice = mockMail.sendNoticeEmail.mock.calls.find(([to]) => to === patient.email);
    expect(notice[1].paragraphs.join(' ')).toMatch(/taking a little longer/);
    // …and an admin is alerted.
    expect(mockMail.sendAdminAlertEmail).toHaveBeenCalledWith('A refund failed', expect.any(Array), expect.anything());
  });
});

describe('a refund made outside the app (the Razorpay dashboard)', () => {
  test('cancels the live booking and emails both people', async () => {
    const { patient, doctor } = await people();
    const s = await makeSession({ patient, doctor, paymentId: 'pay_dash_1' });
    const r = await sessionPayment.observeRefund({ id: 'rfnd_dash', payment_id: 'pay_dash_1', amount: 100000, status: 'processed' });
    expect(r.outcome).not.toBe('no-session');
    expect((await Session.findById(s._id).lean()).status).toBe('cancelled');
    const sent = mockMail.sendCancellationEmail.mock.calls;
    const toPatient = sent.find(([to]) => to === patient.email);
    const toDoctor = sent.find(([to]) => to === doctor.email);
    expect(toPatient[1]).toMatchObject({ refundState: 'issued', refundAmount: 1000, cancelledBy: 'Veraawell support' });
    expect(toDoctor[1]).toMatchObject({ refundState: 'hide' });
  });
});

describe('reminders', () => {
  async function dueIn15() {
    const { patient, doctor } = await people();
    return makeSession({ patient, doctor, hoursFromNow: 15 / 60 });
  }

  test('claimed before sending: two runs at once send each reminder once', async () => {
    const s = await dueIn15();
    await Promise.all([scheduler.runReminderSweep(), scheduler.runReminderSweep()]);
    await scheduler.runReminderSweep();
    const calls = require('../../services/email.service').sendSessionReminderEmail.mock.calls.filter(([, sess]) => String(sess._id) === String(s._id));
    expect(calls.filter(([, , type, opts]) => type === '15min' && !opts)).toHaveLength(1);
    expect(calls.filter(([, , type, opts]) => type === '15min' && opts && opts.recipient === 'doctor')).toHaveLength(1);
    const ns = (await Session.findById(s._id).lean()).notificationStatus;
    expect(ns).toMatchObject({ reminderSent: true, doctorReminderSent: true });
  });

  test('a send the provider refused is released and tried again the next minute', async () => {
    const s = await dueIn15();
    const send = require('../../services/email.service').sendSessionReminderEmail;
    send.mockResolvedValue(null); // the provider refused
    await scheduler.runReminderSweep();
    expect((await Session.findById(s._id).lean()).notificationStatus.reminderSent).toBe(false);
    send.mockResolvedValue({ id: 'ok' });
    await scheduler.runReminderSweep();
    expect((await Session.findById(s._id).lean()).notificationStatus.reminderSent).toBe(true);
  });
});

describe('booking emails', () => {
  async function populated(over) {
    const { patient, doctor } = await people();
    const s = await makeSession({ patient, doctor, doctorEarnings: 800, ...over });
    return Session.findById(s._id).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email');
  }

  test('a booked session: the patient gets the therapist, IST time, amount and dashboard; the doctor their earnings', async () => {
    const s = await populated({ hoursFromNow: 48, callMode: 'Voice Calling' });
    await sessionPayment.sendBookingEmails(s);
    const mail = require('../../services/email.service');
    const [to, details] = mail.sendBookingConfirmationEmail.mock.calls[0];
    expect(to).toBe(s.patientId.email);
    expect(details).toMatchObject({ doctorName: expect.stringMatching(/^Dr\. /), duration: 60, mode: 'Voice', price: 1000 });
    expect(details.time).toMatch(/IST$/);
    expect(mail.sendDoctorNewBookingEmail.mock.calls[0][1]).toMatchObject({ doctorEarnings: 800, type: 'Voice' });
  });

  test('an instant request: "request sent" and "answer within 2 minutes" — not "booking confirmed"', async () => {
    const s = await populated({ sessionType: 'immediate', status: 'active', acceptanceStatus: 'pending', hoursFromNow: 0 });
    await sessionPayment.sendBookingEmails(s);
    const mail = require('../../services/email.service');
    expect(mail.sendBookingConfirmationEmail).not.toHaveBeenCalled();
    const notices = mail.sendNoticeEmail.mock.calls;
    const toPatient = notices.find(([to]) => to === s.patientId.email)[1];
    const toDoctor = notices.find(([to]) => to === s.doctorId.email)[1];
    expect(toPatient.subject).toMatch(/request has been sent/);
    expect(toPatient.paragraphs.join(' ')).toMatch(/refunded in full automatically/);
    expect(toDoctor.subject).toMatch(/Instant session request/);
    expect(toDoctor.paragraphs.join(' ')).toMatch(/expires in 2 minutes/);
    expect(toDoctor.rows).toEqual([['Your earnings', '₹800']]);
  });

  test('a failing email never breaks the booking', async () => {
    const s = await populated({});
    require('../../services/email.service').sendBookingConfirmationEmail.mockRejectedValueOnce(new Error('smtp down'));
    await expect(sessionPayment.sendBookingEmails(s)).resolves.toBeUndefined();
  });
});
