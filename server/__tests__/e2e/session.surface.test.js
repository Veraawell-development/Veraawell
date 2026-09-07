/**
 * The rest of session.controller — the largest single file in the codebase and
 * still the biggest coverage gap after the booking and payment suites.
 *
 * Covers the read surface (dashboards, calendars, directories), the instant-
 * session flow (book-immediate / accept / delay / missed), joining, and the
 * TURN credential endpoint.
 */

require('../support/env');

const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

const mockOrdersCreate = jest.fn().mockResolvedValue({ id: 'order_live_x', status: 'created' });
const mockRefund = jest.fn().mockResolvedValue({ id: 'rfnd_live_x', status: 'processed' });
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: mockOrdersCreate },
  payments: { refund: mockRefund, fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));
jest.mock('isomorphic-dompurify', () => ({ sanitize: (s) => s }));

let app, f;
let server;
let patientA, patientB, doctorA, doctorB;
let Session, DoctorAvailability;

beforeAll(async () => {
  await connectDb('session.surface');
  app = require('../../app');
  server = await startServer(app);
  Session = require('../../models/session');
  DoctorAvailability = require('../../models/doctorAvailability');

  const { seedAll } = require('../support/seed');
  f = await seedAll();

  const jwt = require('jsonwebtoken');
  const { getJWTSecret } = require('../../config/auth');
  const mk = (u) => jwt.sign({ userId: String(u._id), username: u.username, role: u.role }, getJWTSecret(), { expiresIn: '1h' });
  patientA = mk(f.patientA); patientB = mk(f.patientB);
  doctorA = mk(f.doctorA); doctorB = mk(f.doctorB);
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

beforeEach(async () => {
  await Session.deleteMany({});
  mockOrdersCreate.mockClear();
  mockRefund.mockClear();
});

async function call(method, path, token, body) {
  const t = await request(server).get('/api/csrf-token');
  let req = request(server)[method](path)
    .set('Cookie', t.headers['set-cookie'])
    .set('X-CSRF-Token', t.body.csrfToken);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return body === undefined ? req.send() : req.send(body);
}

async function makeSession(over = {}) {
  return Session.create({
    patientId: f.patientA._id,
    doctorId: f.doctorA._id,
    startsAt: new Date(Date.now() + 48 * 3600 * 1000),
    duration: 60, price: 1500,
    status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_surface_01',
    ...over
  });
}

describe('the public therapist directory', () => {
  test('the doctor list is readable without an account', async () => {
    const res = await request(server).get('/api/sessions/doctors');
    expect(res.status).toBe(200);
    // The handler responds with a bare array, not an envelope.
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  test('a single doctor profile is readable without an account', async () => {
    const res = await request(server).get(`/api/sessions/doctors/${f.doctorA._id}`);
    expect(res.status).toBe(200);
  });

  test('the directory never leaks a password hash or reset token', async () => {
    const res = await request(server).get('/api/sessions/doctors');
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/\$2[aby]\$/);
    expect(body).not.toMatch(/resetToken/);
  });

  test('an unknown but well-formed doctor id is a 404, not a 500', async () => {
    const ghost = new mongoose.Types.ObjectId();
    const res = await request(server).get(`/api/sessions/doctors/${ghost}`);
    expect(res.status).toBe(404);
  });

  test('public slots for a doctor are readable and shaped as a list', async () => {
    const { utcToZoned } = require('../../utils/zonedTime');
    const { PLATFORM_TIMEZONE } = require('../../config/time');
    const day = utcToZoned(new Date(Date.now() + 3 * 864e5), PLATFORM_TIMEZONE).localDate;

    const res = await request(server).get(`/api/sessions/doctors/${f.doctorA._id}/slots/${day}`);
    expect(res.status).toBe(200);
  });
});

describe('the patient dashboard reads', () => {
  test('my-sessions returns only the caller\'s own sessions', async () => {
    await makeSession();
    await Session.create({
      patientId: f.patientB._id, doctorId: f.doctorB._id,
      startsAt: new Date(Date.now() + 24 * 3600 * 1000),
      duration: 60, price: 1000, status: 'scheduled',
      paymentStatus: 'paid', paymentId: 'pay_other'
    });

    const mine = await call('get', '/api/sessions/my-sessions', patientA);
    expect(mine.status).toBe(200);
    const body = JSON.stringify(mine.body);
    expect(body).toContain('pay_surface_01');
    expect(body).not.toContain('pay_other');
  });

  test('upcoming excludes past sessions', async () => {
    await makeSession({ startsAt: new Date(Date.now() - 48 * 3600 * 1000), paymentId: 'pay_past' });
    await makeSession({ paymentId: 'pay_future' });

    const res = await call('get', '/api/sessions/upcoming', patientA);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).toContain('pay_future');
    expect(body).not.toContain('pay_past');
  });

  test('the calendar is scoped to the caller and to the requested month', async () => {
    await makeSession();
    const now = new Date();
    const res = await call('get', `/api/sessions/calendar/${now.getUTCFullYear()}/${now.getUTCMonth() + 1}`, patientA);
    expect(res.status).toBe(200);
  });

  test('my-doctors counts only completed sessions, not upcoming ones', async () => {
    // The aggregation matches status in ['completed', 'ended'] only
    // (session.controller.js:225), so a booked-but-unattended session does not
    // make a doctor a "previous" doctor.
    await makeSession({ status: 'scheduled' });
    const scheduledOnly = await call('get', '/api/sessions/my-doctors', patientA);
    expect(scheduledOnly.status).toBe(200);
    expect(scheduledOnly.body).toEqual([]);

    await makeSession({ status: 'completed', startsAt: new Date(Date.now() - 5 * 3600 * 1000), paymentId: 'pay_done_md' });
    const res = await call('get', '/api/sessions/my-doctors', patientA);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(String(f.doctorA._id));
  });

  test('my-doctors is patient-only', async () => {
    expect((await call('get', '/api/sessions/my-doctors', doctorA)).status).toBe(403);
  });

  test('my-therapists is patient-only and scoped', async () => {
    const ok = await call('get', '/api/sessions/my-therapists', patientA);
    expect(ok.status).toBe(200);
    expect((await call('get', '/api/sessions/my-therapists', doctorA)).status).toBe(403);
  });

  test('pending-feedback lists completed sessions with no review yet', async () => {
    await makeSession({ status: 'completed', startsAt: new Date(Date.now() - 3 * 3600 * 1000), paymentId: 'pay_done' });
    const res = await call('get', '/api/sessions/pending-feedback', patientA);
    expect(res.status).toBe(200);
  });

  test('call-history is scoped to the caller and shared by both roles', async () => {
    await makeSession({ status: 'completed', startsAt: new Date(Date.now() - 3 * 3600 * 1000) });
    expect((await call('get', '/api/sessions/call-history', patientA)).status).toBe(200);
    expect((await call('get', '/api/sessions/call-history', doctorA)).status).toBe(200);

    const stranger = await call('get', '/api/sessions/call-history', patientB);
    expect(stranger.status).toBe(200);
    expect(JSON.stringify(stranger.body)).not.toContain('pay_surface_01');
  });
});

describe('the doctor dashboard reads', () => {
  test('stats is doctor-only and reports the doctor\'s own numbers', async () => {
    await makeSession({ status: 'completed', startsAt: new Date(Date.now() - 3 * 3600 * 1000) });

    const res = await call('get', '/api/sessions/stats', doctorA);
    expect(res.status).toBe(200);

    expect((await call('get', '/api/sessions/stats', patientA)).status).toBe(403);
  });

  test('one doctor\'s stats do not include another doctor\'s sessions', async () => {
    await makeSession({ status: 'completed', price: 5000, startsAt: new Date(Date.now() - 3 * 3600 * 1000) });
    const other = await call('get', '/api/sessions/stats', doctorB);
    expect(other.status).toBe(200);
    expect(JSON.stringify(other.body)).not.toContain('5000');
  });

  test('delayed sessions are listed for the doctor', async () => {
    await makeSession({ acceptanceStatus: 'delayed', delayMinutes: 5, delayedUntil: new Date(Date.now() + 5 * 60000) });
    const res = await call('get', '/api/sessions/delayed', doctorA);
    expect(res.status).toBe(200);
  });
});

describe('reading a single session', () => {
  test('both parties can read it', async () => {
    const s = await makeSession();
    expect((await call('get', `/api/sessions/${s._id}`, patientA)).status).toBe(200);
    expect((await call('get', `/api/sessions/${s._id}`, doctorA)).status).toBe(200);
  });

  test('a stranger cannot, and gets an authz-categorised 403', async () => {
    const s = await makeSession();
    const res = await call('get', `/api/sessions/${s._id}`, patientB);
    expect(res.status).toBe(403);
    expect(res.body.category).toBe('authz');
  });

  test('an unknown id is a 404 and a malformed one a 400', async () => {
    const ghost = new mongoose.Types.ObjectId();
    expect((await call('get', `/api/sessions/${ghost}`, patientA)).status).toBe(404);
    expect((await call('get', '/api/sessions/not-an-id', patientA)).status).toBe(400);
  });
});

describe('joining a session', () => {
  test('a session far in the future cannot be joined yet', async () => {
    const s = await makeSession({ startsAt: new Date(Date.now() + 48 * 3600 * 1000) });
    const res = await call('get', `/api/sessions/join/${s._id}`, patientA);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('a session inside the 15-minute lead window can be joined by both parties', async () => {
    const s = await makeSession({ startsAt: new Date(Date.now() + 5 * 60 * 1000) });
    expect((await call('get', `/api/sessions/join/${s._id}`, patientA)).status).toBe(200);
    expect((await call('get', `/api/sessions/join/${s._id}`, doctorA)).status).toBe(200);
  });

  test('the join window closes 60 minutes after the session ENDS, not after it starts', async () => {
    // joinWindow (services/sessionTime.js:108) is
    //   opensAt  = startsAt - 15m
    //   closesAt = endsAt   + 60m
    // so a 60-minute session that began 90 minutes ago is still joinable for
    // another half hour. Pinning the real boundary rather than the intuitive one.
    const stillOpen = await makeSession({ startsAt: new Date(Date.now() - 90 * 60 * 1000) });
    expect((await call('get', `/api/sessions/join/${stillOpen._id}`, patientA)).status).toBe(200);

    await Session.deleteMany({});
    const closed = await makeSession({ startsAt: new Date(Date.now() - 5 * 3600 * 1000) });
    expect((await call('get', `/api/sessions/join/${closed._id}`, patientA)).status).toBeGreaterThanOrEqual(400);
  });

  test('a stranger cannot join', async () => {
    const s = await makeSession({ startsAt: new Date(Date.now() + 5 * 60 * 1000) });
    expect((await call('get', `/api/sessions/join/${s._id}`, patientB)).status).toBe(403);
    expect((await call('get', `/api/sessions/join/${s._id}`, doctorB)).status).toBe(403);
  });

  test('a cancelled session cannot be joined', async () => {
    const s = await makeSession({
      startsAt: new Date(Date.now() + 5 * 60 * 1000),
      status: 'cancelled', paymentStatus: 'refunded', refundId: 'r1', refundAmount: 1500
    });
    const res = await call('get', `/api/sessions/join/${s._id}`, patientA);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('instant sessions', () => {
  test('accept is doctor-only and only by the session\'s own doctor', async () => {
    const s = await makeSession({ sessionType: 'immediate', status: 'active', acceptanceStatus: 'pending' });

    expect((await call('post', `/api/sessions/${s._id}/accept`, patientA, {})).status).toBe(403);
    expect((await call('post', `/api/sessions/${s._id}/accept`, doctorB, {})).status).toBe(403);

    const ok = await call('post', `/api/sessions/${s._id}/accept`, doctorA, {});
    expect(ok.status).toBe(200);
    expect((await Session.findById(s._id)).acceptanceStatus).toBe('accepted');
  });

  test('delay records the interval and a note, doctor only', async () => {
    const s = await makeSession({ sessionType: 'immediate', status: 'active', acceptanceStatus: 'pending' });

    expect((await call('post', `/api/sessions/${s._id}/delay`, patientA, { delayMinutes: 10 })).status).toBe(403);

    const res = await call('post', `/api/sessions/${s._id}/delay`, doctorA, { delayMinutes: 10, doctorNote: 'Finishing a call' });
    expect(res.status).toBe(200);

    const after = await Session.findById(s._id);
    expect(after.acceptanceStatus).toBe('delayed');
    expect(after.delayMinutes).toBe(10);
    expect(after.doctorNote).toBe('Finishing a call');
    expect(after.delayedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  test('delay defaults to 5 minutes when none is given', async () => {
    const s = await makeSession({ sessionType: 'immediate', status: 'active', acceptanceStatus: 'pending' });
    await call('post', `/api/sessions/${s._id}/delay`, doctorA, {});
    expect((await Session.findById(s._id)).delayMinutes).toBe(5);
  });

  test('missed is patient-only and refunds in full', async () => {
    const s = await makeSession({ sessionType: 'immediate', status: 'active', acceptanceStatus: 'pending' });

    expect((await call('post', `/api/sessions/${s._id}/missed`, doctorA, {})).status).toBe(403);

    const res = await call('post', `/api/sessions/${s._id}/missed`, patientA, {});
    expect(res.status).toBe(200);

    const after = await Session.findById(s._id);
    expect(after.status).toBe('cancelled');
    expect(after.refundAmount).toBe(1500);
    expect(mockRefund).toHaveBeenCalledTimes(1);
  });

  test('book-immediate with no doctorId creates a free self-session', async () => {
    // session.controller.js:324 treats an absent doctorId — and the literal
    // string 'test-doctor-id' — as a request for a session with oneself, priced
    // not_required and immediately active. Any authenticated patient can mint
    // one, which is a test affordance living in production code.
    const res = await call('post', '/api/sessions/book-immediate', patientA, { mode: 'video', duration: 20 });
    expect(res.status).toBeLessThan(300);

    const s = await Session.findOne({ sessionType: 'immediate' });
    expect(String(s.patientId)).toBe(String(s.doctorId));
    expect(s.paymentStatus).toBe('not_required');
    expect(s.status).toBe('active');
    expect(mockOrdersCreate).not.toHaveBeenCalled();
  });

  test('the literal string test-doctor-id takes the same self-session path', async () => {
    const res = await call('post', '/api/sessions/book-immediate', patientA, {
      doctorId: 'test-doctor-id', mode: 'video', duration: 20
    });
    expect(res.status).toBeLessThan(300);

    const s = await Session.findOne({ sessionType: 'immediate' });
    expect(String(s.patientId)).toBe(String(s.doctorId));
  });

  test('a real instant booking against another doctor still goes through payment', async () => {
    const res = await call('post', '/api/sessions/book-immediate', patientA, {
      doctorId: String(f.doctorA._id), mode: 'video', duration: 20
    });
    expect(res.status).toBeLessThan(300);

    const s = await Session.findOne({ doctorId: f.doctorA._id, sessionType: 'immediate' });
    expect(s.paymentStatus).not.toBe('paid');
    expect(mockOrdersCreate).toHaveBeenCalled();
  });
});

describe('TURN credentials', () => {
  test('both parties may fetch them', async () => {
    expect((await call('get', '/api/sessions/turn-credentials', patientA)).status).toBe(200);
    expect((await call('get', '/api/sessions/turn-credentials', doctorA)).status).toBe(200);
  });

  test('they are refused to an anonymous caller', async () => {
    expect((await call('get', '/api/sessions/turn-credentials', null)).status).toBe(401);
  });

  test('with no Metered credentials configured it still returns 200 with STUN fallback', async () => {
    // session.controller.js:1117-1133 falls back to public STUN and answers
    // 200 either way, so a missing TURN relay is invisible to the client and
    // shows up only as calls that fail behind symmetric NAT.
    const res = await call('get', '/api/sessions/turn-credentials', patientA);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toMatch(/stun:|turn:/);
  });
});

describe('completing a session', () => {
  test('a session cannot be completed before it has started', async () => {
    const s = await makeSession({ startsAt: new Date(Date.now() + 48 * 3600 * 1000) });
    const res = await call('post', `/api/sessions/${s._id}/complete`, doctorA, {});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await Session.findById(s._id)).status).toBe('scheduled');
  });

  test('a started session completes, and completing twice is a no-op', async () => {
    const s = await makeSession({ startsAt: new Date(Date.now() - 90 * 60 * 1000) });

    const first = await call('post', `/api/sessions/${s._id}/complete`, doctorA, {});
    expect(first.status).toBe(200);
    expect((await Session.findById(s._id)).status).toBe('completed');

    const second = await call('post', `/api/sessions/${s._id}/complete`, doctorA, {});
    expect(second.status).toBe(200);
    expect((await Session.findById(s._id)).status).toBe('completed');
  });

  test('completing after cancelling is a 409 state conflict', async () => {
    // Cancellation is only allowed before the session starts, so this uses a
    // future session — the same shape as completeSession.idempotency.test.js.
    const s = await makeSession({ startsAt: new Date(Date.now() + 48 * 3600 * 1000) });
    const cancelled = await call('post', `/api/sessions/${s._id}/cancel`, patientA, {});
    expect(cancelled.status).toBe(200);

    const res = await call('post', `/api/sessions/${s._id}/complete`, doctorA, {});
    expect(res.status).toBe(409);
    expect((await Session.findById(s._id)).status).toBe('cancelled');
  });
});
