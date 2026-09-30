/**
 * Booking and the money paths, end to end through the real routers.
 *
 * The existing suite covers resolveBookingPaymentState's failure modes and the
 * webhook signature gate, but nothing exercises a booking from an availability
 * grid through to a captured payment, and nothing covers /api/payments/verify
 * or the slot bookkeeping that a cancellation is supposed to undo.
 *
 * Runs in LIVE payments mode with the Razorpay SDK mocked, because that is the
 * production path. PAYMENTS_MODE=stub is covered separately below, where its
 * exact synthetic-id shapes are pinned.
 */

require('../support/env');

const crypto = require('crypto');
const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

const mockOrdersCreate = jest.fn();
const mockRefund = jest.fn();
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: mockOrdersCreate },
  payments: { refund: mockRefund, fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn().mockResolvedValue({ id: 'acc_live_created' }) }
})));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));
jest.mock('isomorphic-dompurify', () => ({ sanitize: (s) => s }));

let app;
let server;
let f;
let patientToken;
let Session, DoctorAvailability, WebhookEvent, DoctorProfile;
let bookableDate;

const SLOT = '09:00 AM';

// Seeding hashes six passwords with bcrypt, which is far too slow to repeat per
// test. Users and profiles are immutable fixtures, so they are created once;
// only the collections a test actually mutates are reset between cases.
beforeAll(async () => {
  await connectDb('booking.payments');
  app = require('../../app');
  server = await startServer(app);
  Session = require('../../models/session');
  DoctorAvailability = require('../../models/doctorAvailability');
  WebhookEvent = require('../../models/webhookEvent');
  DoctorProfile = require('../../models/doctorProfile');

  const { seedAll } = require('../support/seed');
  f = await seedAll();

  const jwt = require('jsonwebtoken');
  const { getJWTSecret } = require('../../config/auth');
  patientToken = jwt.sign(
    { userId: String(f.patientA._id), username: f.patientA.username, role: 'patient' },
    getJWTSecret(), { expiresIn: '1h' }
  );

  const { utcToZoned } = require('../../utils/zonedTime');
  const { PLATFORM_TIMEZONE } = require('../../config/time');
  bookableDate = utcToZoned(new Date(Date.now() + 5 * 864e5), PLATFORM_TIMEZONE).localDate;
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

beforeEach(async () => {
  await Promise.all([
    Session.deleteMany({}),
    WebhookEvent.deleteMany({}),
    DoctorAvailability.deleteMany({})
  ]);
  // Republish a clean grid and restore the payout account a test may have
  // rewritten.
  const { makeAvailability } = require('../support/seed');
  await makeAvailability(f.doctorA._id);
  await makeAvailability(f.doctorB._id);
  // Reset the bookability gate: individual cases below turn it off.
  await DoctorProfile.updateOne(
    { userId: f.doctorA._id },
    { $set: { payoutApproved: true } }
  );

  mockOrdersCreate.mockReset();
  mockRefund.mockReset();
  mockOrdersCreate.mockResolvedValue({ id: 'order_live_abc123', status: 'created' });
  mockRefund.mockResolvedValue({ id: 'rfnd_live_abc', status: 'processed' });
}, 30000);

/** A mutating request needs the double-submit CSRF pair. */
async function csrfPair() {
  const res = await request(server).get('/api/csrf-token');
  const cookie = res.headers['set-cookie'];
  return { token: res.body.csrfToken, cookie };
}

async function book(body, token = patientToken) {
  const { token: csrf, cookie } = await csrfPair();
  return request(server)
    .post('/api/sessions/book')
    .set('Authorization', `Bearer ${token}`)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', csrf)
    .send(body);
}

const baseBooking = () => ({
  doctorId: String(f.doctorA._id),
  sessionDate: bookableDate,
  sessionTime: SLOT,
  price: 1500,
  mode: 'video',
  duration: 60
});

describe('the availability grid gates booking', () => {
  test('a published slot is offered publicly and is bookable', async () => {
    const slots = await request(server).get(`/api/availability/slots/${f.doctorA._id}/${bookableDate}`);
    expect(slots.status).toBe(200);

    const res = await book(baseBooking());
    expect(res.status).toBe(201);
  });

  test('a slot that is not in the doctor\'s calendar is refused', async () => {
    const res = await book({ ...baseBooking(), sessionTime: '11:45 PM' });
    expect(res.status).toBe(400);
    expect(await Session.countDocuments({ sessionTime: '11:45 PM' })).toBe(0);
  });

  test('a date in the past is refused before any DB work happens', async () => {
    const { utcToZoned } = require('../../utils/zonedTime');
    const { PLATFORM_TIMEZONE } = require('../../config/time');
    const past = utcToZoned(new Date(Date.now() - 3 * 864e5), PLATFORM_TIMEZONE).localDate;

    const res = await book({ ...baseBooking(), sessionDate: past });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/past/i);
  });

  test('booking the same slot twice is refused, and the slot is marked booked exactly once', async () => {
    const first = await book(baseBooking());
    expect(first.status).toBe(201);

    const second = await book(baseBooking());
    expect(second.status).toBe(400);

    const avail = await DoctorAvailability.findOne({ doctorId: f.doctorA._id }).lean();
    const booked = avail.bookedSlots.filter((s) => s.date === bookableDate);
    expect(booked).toHaveLength(1);
    expect(await Session.countDocuments({ doctorId: f.doctorA._id, sessionTime: SLOT })).toBe(1);
  });

  test('the price is taken from the doctor profile, not from the client', async () => {
    // calculateSessionPrice is server-authoritative (services/session.service.js:18).
    const res = await book({ ...baseBooking(), price: 1 });
    expect(res.status).toBe(201);

    const session = await Session.findById(res.body.session?._id || res.body.session?.id || (await Session.findOne({}))._id);
    expect(session.price).toBeGreaterThan(1);
  });
});

describe('a booking never becomes paid without a payment', () => {
  test('a successful order leaves the session payment_pending / pending with no paymentId', async () => {
    const res = await book(baseBooking());
    expect(res.status).toBe(201);

    const session = await Session.findOne({ doctorId: f.doctorA._id, sessionTime: SLOT });
    expect(session.status).toBe('payment_pending');
    expect(session.paymentStatus).toBe('pending');
    expect(session.paymentId).toBeNull();
    expect(mockOrdersCreate).toHaveBeenCalledTimes(1);
  });

  test('a gateway failure is a 502 and creates no session at all', async () => {
    mockOrdersCreate.mockRejectedValue(new Error('gateway exploded'));

    const res = await book(baseBooking());
    expect(res.status).toBe(502);
    expect(await Session.countDocuments({ sessionTime: SLOT })).toBe(0);

    // And the slot must not be left holding a phantom reservation.
    const avail = await DoctorAvailability.findOne({ doctorId: f.doctorA._id }).lean();
    expect(avail.bookedSlots.filter((s) => s.date === bookableDate)).toHaveLength(0);
  });

  test('a doctor whose payouts are not approved is refused with 409', async () => {
    await DoctorProfile.updateOne({ userId: f.doctorA._id }, { $set: { payoutApproved: false } });

    const res = await book(baseBooking());
    expect(res.status).toBe(409);
    // Refused before the gateway: no order created, no slot consumed.
    expect(mockOrdersCreate).not.toHaveBeenCalled();
    expect(await Session.countDocuments({ sessionTime: SLOT })).toBe(0);
  });

  test('a leftover Razorpay account id does not make an unapproved doctor bookable', async () => {
    // This replaces two tests that characterised the old Route gate, which
    // asked whether the doctor had a non-synthetic `razorpayAccountId`. That
    // gate had a blind spot (`acc_stub_` ids minted in stub mode passed as
    // genuine) and, worse, answered "yes" for the `acc_mock_` ids
    // approveOnboarding fabricated on failure.
    //
    // Every live profile still carries one of those ids. Bookability must come
    // from payoutApproved alone, or the migration would quietly re-enable
    // doctors the platform has no way to pay.
    await DoctorProfile.updateOne(
      { userId: f.doctorA._id },
      { $set: { payoutApproved: false, razorpayAccountId: 'acc_live_seededfixture01', payoutSetupCompleted: true } }
    );

    const res = await book(baseBooking());
    expect(res.status).toBe(409);
    expect(mockOrdersCreate).not.toHaveBeenCalled();
    expect(await Session.countDocuments({ sessionTime: SLOT })).toBe(0);
  });

  test('the order sent to the gateway carries no Route transfer', async () => {
    // The whole amount lands in the platform account; the commission split is
    // still recorded on the Session and settled by the weekly payout run.
    const res = await book(baseBooking());
    expect(res.status).toBe(201);
    expect(mockOrdersCreate).toHaveBeenCalledTimes(1);

    const payload = mockOrdersCreate.mock.calls[0][0];
    expect(payload).not.toHaveProperty('transfers');

    const session = await Session.findOne({ sessionTime: SLOT });
    expect(session.platformFee + session.doctorEarnings).toBe(session.price);
    expect(session.doctorEarnings).toBeGreaterThan(0);
  });

  test('no booking path can produce a paid session carrying a synthetic paymentId', async () => {
    const { isSyntheticPaymentId } = require('../../config/payments');
    await book(baseBooking());

    const paid = await Session.find({ paymentStatus: 'paid' }).lean();
    for (const s of paid) {
      expect(isSyntheticPaymentId(s.paymentId)).toBe(false);
    }
  });
});

describe('payment capture', () => {
  async function pendingSession() {
    const res = await book(baseBooking());
    expect(res.status).toBe(201);
    return Session.findOne({ doctorId: f.doctorA._id, sessionTime: SLOT });
  }

  test('verify with a correct HMAC marks the session paid and scheduled', async () => {
    const session = await pendingSession();
    const orderId = session.razorpayOrderId;
    const paymentId = 'pay_live_captured01';
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const { token: csrf, cookie } = await csrfPair();
    const res = await request(server)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature });

    expect(res.status).toBe(200);
    const after = await Session.findById(session._id);
    expect(after.paymentStatus).toBe('paid');
    expect(after.status).toBe('scheduled');
    expect(after.paymentId).toBe(paymentId);
  });

  test('verify with a tampered signature leaves the session untouched', async () => {
    const session = await pendingSession();
    const { token: csrf, cookie } = await csrfPair();

    const res = await request(server)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({
        razorpay_order_id: session.razorpayOrderId,
        razorpay_payment_id: 'pay_forged',
        razorpay_signature: 'f'.repeat(64)
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const after = await Session.findById(session._id);
    expect(after.paymentStatus).toBe('pending');
    expect(after.paymentId).toBeNull();
  });

  test('another patient cannot verify a payment against someone else\'s session', async () => {
    const session = await pendingSession();
    const jwt = require('jsonwebtoken');
    const { getJWTSecret } = require('../../config/auth');
    const bTok = jwt.sign(
      { userId: String(f.patientB._id), username: f.patientB.username, role: 'patient' },
      getJWTSecret(), { expiresIn: '1h' }
    );

    const paymentId = 'pay_live_hijack';
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${session.razorpayOrderId}|${paymentId}`)
      .digest('hex');

    const { token: csrf, cookie } = await csrfPair();
    const res = await request(server)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${bTok}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ razorpay_order_id: session.razorpayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const after = await Session.findById(session._id);
    expect(after.paymentStatus).toBe('pending');
  });
});

describe('the webhook', () => {
  function signed(payload) {
    const body = JSON.stringify(payload);
    return {
      body,
      sig: crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex')
    };
  }

  test('an unsigned webhook is refused and records nothing', async () => {
    const res = await request(server).post('/api/payments/webhook').send({ event: 'payment.captured' });
    expect(res.status).toBe(400);
    expect(await WebhookEvent.countDocuments({})).toBe(0);
  });

  test('a tampered payload fails the signature check', async () => {
    const { sig } = signed({ event: 'payment.captured', payload: {} });
    const res = await request(server)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sig)
      .send(JSON.stringify({ event: 'payment.captured', payload: { tampered: true } }));

    expect(res.status).toBe(400);
    expect(await WebhookEvent.countDocuments({})).toBe(0);
  });

  test('replaying the same event id captures the payment exactly once', async () => {
    const bookRes = await book(baseBooking());
    expect(bookRes.status).toBe(201);
    const session = await Session.findOne({ doctorId: f.doctorA._id, sessionTime: SLOT });

    const payload = {
      // The idempotency key is read from the BODY (payment.controller.js:276),
      // not from a header.
      id: 'evt_dedupe_001',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_hook_capture01',
            order_id: session.razorpayOrderId,
            amount: session.price * 100,
            status: 'captured'
          }
        }
      }
    };
    const { body, sig } = signed(payload);

    const send = () => request(server)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sig)
      .send(body);

    const first = await send();
    const second = await send();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // The unique index on WebhookEvent.eventId is what makes this exactly-once.
    expect(await WebhookEvent.countDocuments({ eventId: 'evt_dedupe_001' })).toBe(1);

    const after = await Session.findById(session._id);
    expect(after.paymentStatus).toBe('paid');
    expect(after.paymentId).toBe('pay_hook_capture01');
  });

  test('a webhook with no event id at all is not deduplicated', async () => {
    // The idempotency block is guarded by `if (eventId)`. A delivery carrying
    // neither the x-razorpay-event-id header nor a body-level `id` skips the
    // WebhookEvent record entirely, so retries reprocess it every time. Real
    // Razorpay deliveries always carry the header; this pins the fallback.
    const bookRes = await book(baseBooking());
    const session = await Session.findOne({ doctorId: f.doctorA._id, sessionTime: SLOT });

    const payload = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_noid_01', order_id: session.razorpayOrderId, amount: session.price * 100, status: 'captured' } } }
    };
    const { body, sig } = signed(payload);
    const send = () => request(server)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sig)
      .send(body);

    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);

    expect(await WebhookEvent.countDocuments({})).toBe(0);
    expect(bookRes.status).toBe(201);
  });

  test('a real Razorpay delivery is deduplicated by its x-razorpay-event-id header', async () => {
    // Razorpay's payload has no top-level `id` — the event id travels in a
    // header. Dedupe used to read only the body, so it never ran for a
    // genuine delivery; every redelivery was processed again.
    const bookRes = await book(baseBooking());
    expect(bookRes.status).toBe(201);
    const session = await Session.findOne({ doctorId: f.doctorA._id, sessionTime: SLOT });

    // Shaped like a real Razorpay payload: entity/event/payload, no `id`.
    const { body, sig } = signed({
      entity: 'event',
      event: 'payment.captured',
      contains: ['payment'],
      payload: { payment: { entity: { id: 'pay_hdr_01', order_id: session.razorpayOrderId, amount: session.price * 100, status: 'captured' } } },
      created_at: Math.floor(Date.now() / 1000)
    });
    const send = () => request(server)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sig)
      .set('X-Razorpay-Event-Id', 'evt_hdr_01')
      .send(body);

    const first = await send();
    const second = await send();
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('ok');
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('already_processed');

    const rows = await WebhookEvent.find({ eventId: 'evt_hdr_01' }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('done');
    expect((await Session.findById(session._id)).paymentStatus).toBe('paid');
  });

  /** A signed payment.captured delivery for `session`, with a fixed event id. */
  async function capturedDelivery(eventId, paymentId) {
    const bookRes = await book(baseBooking());
    expect(bookRes.status).toBe(201);
    const session = await Session.findOne({ doctorId: f.doctorA._id, sessionTime: SLOT });
    const { body, sig } = signed({
      id: eventId,
      event: 'payment.captured',
      payload: { payment: { entity: { id: paymentId, order_id: session.razorpayOrderId, amount: session.price * 100, status: 'captured' } } }
    });
    const send = () => request(server)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sig)
      .send(body);
    return { session, send };
  }

  test('a delivery that fails mid-processing is retried, not dropped as already processed', async () => {
    // The claim used to be written as a finished receipt BEFORE processing.
    // A failure after that point returned 500, Razorpay retried, and the
    // retry was answered "already_processed" — the captured payment was
    // never recorded and nothing would ever try again.
    const { session, send } = await capturedDelivery('evt_fail_then_retry', 'pay_hook_retry01');

    const spy = jest.spyOn(Session, 'findOne').mockRejectedValueOnce(new Error('transient DB failure'));
    let first;
    try {
      first = await send();
    } finally {
      spy.mockRestore();
    }
    expect(first.status).toBe(500);
    // The failed attempt released its claim.
    expect(await WebhookEvent.countDocuments({ eventId: 'evt_fail_then_retry' })).toBe(0);
    expect((await Session.findById(session._id)).paymentStatus).toBe('pending');

    // Razorpay's retry of the same delivery now processes it.
    const retry = await send();
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe('ok');

    const after = await Session.findById(session._id);
    expect(after.paymentStatus).toBe('paid');
    expect(after.paymentId).toBe('pay_hook_retry01');
    expect((await WebhookEvent.findOne({ eventId: 'evt_fail_then_retry' })).status).toBe('done');
  });

  test('a fresh in-flight claim is answered 409 so Razorpay retries, not 200', async () => {
    const { session, send } = await capturedDelivery('evt_in_flight', 'pay_hook_inflight01');
    await WebhookEvent.create({ eventId: 'evt_in_flight', eventType: 'payment.captured', status: 'processing', claimedAt: new Date() });

    const res = await send();
    expect(res.status).toBe(409);
    expect(res.body.status).toBe('in_progress');
    expect((await Session.findById(session._id)).paymentStatus).toBe('pending');
  });

  test('a stale claim left by an attempt that died is taken over and processed', async () => {
    // A process that crashed mid-webhook never deletes its claim. Without a
    // takeover, every retry would be answered 409 forever.
    const { session, send } = await capturedDelivery('evt_stale_claim', 'pay_hook_stale01');
    await WebhookEvent.create({
      eventId: 'evt_stale_claim', eventType: 'payment.captured',
      status: 'processing', claimedAt: new Date(Date.now() - 10 * 60 * 1000)
    });

    const res = await send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect((await Session.findById(session._id)).paymentStatus).toBe('paid');
    expect((await WebhookEvent.findOne({ eventId: 'evt_stale_claim' })).status).toBe('done');
  });

  test('a receipt written before claims existed still counts as processed', async () => {
    // Pre-existing rows have no status field. They were only ever written
    // for events that were handled, so they must keep deduplicating.
    const { session, send } = await capturedDelivery('evt_legacy_receipt', 'pay_hook_legacy01');
    await WebhookEvent.collection.insertOne({ eventId: 'evt_legacy_receipt', eventType: 'payment.captured', processedAt: new Date() });

    const res = await send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('already_processed');
    expect((await Session.findById(session._id)).paymentStatus).toBe('pending');
  });
});

describe('cancellation, refunds and slot release', () => {
  async function paidFutureSession(hoursFromNow) {
    const { utcToZoned, zonedToUtc } = require('../../utils/zonedTime');
    const { PLATFORM_TIMEZONE } = require('../../config/time');
    const when = new Date(Date.now() + hoursFromNow * 3600 * 1000);
    const { localDate, localTime } = utcToZoned(when, PLATFORM_TIMEZONE);
    return Session.create({
      patientId: f.patientA._id,
      doctorId: f.doctorA._id,
      startsAt: zonedToUtc(localDate, localTime, PLATFORM_TIMEZONE),
      duration: 60,
      price: 2000,
      status: 'scheduled',
      paymentStatus: 'paid',
      paymentId: 'pay_live_refundable01'
    });
  }

  async function cancel(sessionId, token = patientToken) {
    const { token: csrf, cookie } = await csrfPair();
    return request(server)
      .post(`/api/sessions/${sessionId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ reason: 'changed my mind' });
  }

  test('cancelling more than 24h out refunds in full', async () => {
    const s = await paidFutureSession(48);
    const res = await cancel(s._id);
    expect(res.status).toBe(200);

    const after = await Session.findById(s._id);
    expect(after.status).toBe('cancelled');
    expect(after.refundAmount).toBe(2000);
    expect(mockRefund).toHaveBeenCalledTimes(1);
  });

  test('cancelling between 4h and 24h refunds in full', async () => {
    // This window used to pay 50%. It is the most common cancellation time —
    // the evening before — and the policy page always promised 100% here.
    const s = await paidFutureSession(10);
    await cancel(s._id);
    const after = await Session.findById(s._id);
    expect(after.refundAmount).toBe(after.price);
  });

  test('cancelling under 4h refunds nothing and calls the gateway zero times', async () => {
    const s = await paidFutureSession(2);
    await cancel(s._id);
    const after = await Session.findById(s._id);
    expect(after.refundAmount ?? 0).toBe(0);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('a second cancel is a no-op: one refund, unchanged amount', async () => {
    const s = await paidFutureSession(48);
    await cancel(s._id);
    const afterFirst = await Session.findById(s._id);

    const second = await cancel(s._id);
    expect(second.status).toBe(200);

    const afterSecond = await Session.findById(s._id);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(afterSecond.refundAmount).toBe(afterFirst.refundAmount);
    expect(afterSecond.paymentStatus).toBe(afterFirst.paymentStatus);
  });

  test('a gateway refund failure lands in refund_failed, not refunded', async () => {
    mockRefund.mockRejectedValue(new Error('refund declined'));
    const s = await paidFutureSession(48);
    await cancel(s._id);

    const after = await Session.findById(s._id);
    expect(after.paymentStatus).toBe('refund_failed');
    expect(after.refundId).toBeFalsy();
  });

  test('cancelling a never-paid session fabricates no refund', async () => {
    const s = await Session.create({
      patientId: f.patientA._id,
      doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + 48 * 3600 * 1000),
      duration: 60,
      price: 2000,
      status: 'payment_pending',
      paymentStatus: 'pending',
      paymentId: null
    });

    await cancel(s._id);
    const after = await Session.findById(s._id);
    expect(after.paymentStatus).toBe('failed');
    expect(after.refundAmount ?? 0).toBe(0);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('cancelling releases the slot so it can be booked again', async () => {
    const first = await book(baseBooking());
    expect(first.status).toBe(201);
    const session = await Session.findOne({ doctorId: f.doctorA._id, sessionTime: SLOT });

    // Make it payable-and-cancellable the way a real paid booking would be.
    await Session.updateOne({ _id: session._id }, { $set: { status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_live_rel01' } });
    await cancel(session._id);

    const avail = await DoctorAvailability.findOne({ doctorId: f.doctorA._id }).lean();
    expect(avail.bookedSlots.filter((s) => s.date === bookableDate)).toHaveLength(0);

    const again = await book(baseBooking());
    expect(again.status).toBe(201);
  });
});
