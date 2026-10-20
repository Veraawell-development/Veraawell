/**
 * The instant-request lifecycle: ringing the doctor, recovering a ring that
 * was never delivered, and expiring one nobody answered.
 *
 * WHAT WENT WRONG
 *
 * A patient booked an instant session, paid, and landed in the video room.
 * Nothing happened on the doctor's side. Ten minutes later the session was
 * cancelled, the patient refunded, and the doctor given a cancellation strike
 * for a request they were never shown.
 *
 * The wiring was all present — payment.controller emitted `session:booked` to
 * the doctor's /data room, and the client had a modal listening for exactly
 * that. It failed for four independent reasons, and this suite pins each one:
 *
 *   1. The ring was a single socket event with no persistence and no replay.
 *      Emitted into an empty room it was simply gone. Covered by the backfill
 *      endpoint tests below.
 *   2. acceptanceStatus was a parallel state machine that joining the call did
 *      not touch, so the sweep cancelled sessions that were actively in
 *      progress. That is the 'a call in progress is never swept' test, and it
 *      is the one that was costing real money mid-conversation.
 *   3. The popup counted down from 60s while the sweep waited 10 minutes from
 *      createdAt. Both now read one absolute acceptanceDeadline.
 *   4. Every auto-cancel counted against the doctor, including the ones where
 *      the ring was never delivered.
 */

require('../support/env');

const http = require('http');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const { startServer, stopServer } = require('../support/server');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

const mockRefund = jest.fn().mockResolvedValue({ id: 'rfnd_instant', status: 'processed' });
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: mockRefund, fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));
jest.mock('isomorphic-dompurify', () => ({ sanitize: (v) => v }));

let app, server, f;
let Session, DoctorProfile;
let sweepStuckUnacceptedSessions;
let doctorToken, otherDoctorToken, patientToken;

// A second, bare socket.io server for the call tests: joining the call
// (call:join) is what marks acceptance, and it can only be driven over a socket.
let httpServer, io, port;
const sockets = [];

const INSTANT = {
  sessionType: 'immediate',
  status: 'active',
  paymentStatus: 'paid',
  acceptanceStatus: 'pending',
  duration: 20,
  price: 800
};

async function instantRequest(over = {}) {
  return Session.create({
    patientId: f.patientA._id,
    doctorId: f.doctorA._id,
    startsAt: new Date(),
    paymentId: `pay_${Math.random().toString(16).slice(2)}`,
    acceptanceDeadline: new Date(Date.now() + 2 * 60 * 1000),
    ...INSTANT,
    ...over
  });
}

async function csrfPair() {
  const res = await request(server).get('/api/csrf-token');
  return { csrf: res.body.csrfToken, cookie: res.headers['set-cookie'] };
}

async function call(method, path, token, body) {
  const { csrf, cookie } = await csrfPair();
  let req = request(server)[method](path).set('Cookie', cookie).set('X-CSRF-Token', csrf);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return body === undefined ? req.send() : req.send(body);
}

const joinCall = (socket, id) => socket.timeout(8000).emitWithAck('call:join', { sessionId: String(id), protocol: 2, instanceId: `t-${Math.random()}` });

function connectSocket(token, namespace = '') {
  return new Promise((resolve, reject) => {
    const s = ioClient(`http://localhost:${port}${namespace}`, {
      auth: { token, callProtocol: 2 }, transports: ['websocket'], reconnection: false
    });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(new Error(`connect_error: ${e.message}`)));
    setTimeout(() => reject(new Error('connect timeout')), 10000);
  });
}

function waitFor(socket, events, ms = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${events.join('|')}`)), ms);
    for (const ev of events) {
      socket.once(ev, (payload) => { clearTimeout(timer); resolve({ event: ev, payload }); });
    }
  });
}

beforeAll(async () => {
  await connectDb('instant-booking');
  app = require('../../app');
  server = await startServer(app);
  Session = require('../../models/session');
  DoctorProfile = require('../../models/doctorProfile');
  ({ sweepStuckUnacceptedSessions } = require('../../controllers/session.controller'));

  f = await require('../support/seed').seedAll();

  const { getJWTSecret } = require('../../config/auth');
  const sign = (u) => jwt.sign({ userId: String(u._id), role: u.role, username: u.username }, getJWTSecret(), { expiresIn: '1h' });
  doctorToken = sign(f.doctorA);
  otherDoctorToken = sign(f.doctorB);
  patientToken = sign(f.patientA);

  httpServer = http.createServer();
  io = new Server(httpServer, { cors: { origin: '*' } });
  require('../../socket').initializeSockets(io);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
}, 180000);

afterAll(async () => {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await stopServer(server);
  await disconnectDb();
});

afterEach(async () => {
  while (sockets.length) {
    const s = sockets.pop();
    try { s.close(); } catch (_) { /* already closed */ }
  }
  const callService = require('../../services/call/callService');
  await callService._settled();
  callService._reset();
  await Session.deleteMany({});
  await DoctorProfile.updateMany({}, { $set: { cancellationCount: 0, cancellationWarningIssued: false } });
  mockRefund.mockClear();
  require('../../services/cache.service').flush();
});

/* ───────────── the backfill: a dropped ring is recoverable ──────────────── */

describe('GET /api/sessions/instant-requests', () => {
  test('returns a paid instant request still waiting on this doctor', async () => {
    // The whole point: the doctor can ASK what is waiting, instead of having
    // to have been listening at the exact moment payment verified.
    const s = await instantRequest();

    const res = await call('get', '/api/sessions/instant-requests', doctorToken);
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
    expect(String(res.body.sessions[0]._id)).toBe(String(s._id));
    expect(res.body.sessions[0].acceptanceDeadline).toBeTruthy();
  });

  test('fetching it counts as delivery', async () => {
    // The doctor is now holding the request, so ignoring it is a real missed
    // call and should count against them.
    const s = await instantRequest();
    expect(s.ringDeliveredAt).toBeNull();

    await call('get', '/api/sessions/instant-requests', doctorToken);

    expect((await Session.findById(s._id)).ringDeliveredAt).toBeInstanceOf(Date);
  });

  test('a second fetch does not overwrite the original delivery time', async () => {
    const s = await instantRequest();
    await call('get', '/api/sessions/instant-requests', doctorToken);
    const first = (await Session.findById(s._id)).ringDeliveredAt;

    await call('get', '/api/sessions/instant-requests', doctorToken);

    expect((await Session.findById(s._id)).ringDeliveredAt.getTime()).toBe(first.getTime());
  });

  test('another doctor cannot see it', async () => {
    await instantRequest();
    const res = await call('get', '/api/sessions/instant-requests', otherDoctorToken);
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(0);
  });

  test('a patient cannot reach the endpoint at all', async () => {
    await instantRequest();
    const res = await call('get', '/api/sessions/instant-requests', patientToken);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('an expired request is not offered', async () => {
    // Otherwise the doctor is asked to answer a call the patient has already
    // been refunded for.
    await instantRequest({ acceptanceDeadline: new Date(Date.now() - 1000) });
    const res = await call('get', '/api/sessions/instant-requests', doctorToken);
    expect(res.body.sessions).toHaveLength(0);
  });

  test('an already-accepted request is not offered again', async () => {
    await instantRequest({ acceptanceStatus: 'accepted', acceptanceDeadline: null });
    const res = await call('get', '/api/sessions/instant-requests', doctorToken);
    expect(res.body.sessions).toHaveLength(0);
  });

  test('an unpaid instant request is not offered', async () => {
    await instantRequest({ paymentStatus: 'pending', status: 'payment_pending' });
    const res = await call('get', '/api/sessions/instant-requests', doctorToken);
    expect(res.body.sessions).toHaveLength(0);
  });

  test('a scheduled session is never treated as an instant request', async () => {
    await instantRequest({ sessionType: 'regular', status: 'scheduled' });
    const res = await call('get', '/api/sessions/instant-requests', doctorToken);
    expect(res.body.sessions).toHaveLength(0);
  });

  test('a cancelled request is not offered', async () => {
    await instantRequest({ status: 'cancelled' });
    const res = await call('get', '/api/sessions/instant-requests', doctorToken);
    expect(res.body.sessions).toHaveLength(0);
  });
});

/* ──────────────────── joining the call IS accepting ────────────────────── */

describe('the doctor joining the call', () => {
  test('marks the instant session accepted', async () => {
    // Previously only the Accept button did this, so a doctor who opened the
    // call link directly stayed 'pending' — and the sweep then cancelled the
    // conversation they were in the middle of having.
    const s = await instantRequest();

    const doctor = await connectSocket(doctorToken);
    expect((await joinCall(doctor, s._id)).ok).toBe(true);
    await require('../../services/call/callService')._settled();

    const after = await Session.findById(s._id);
    expect(after.acceptanceStatus).toBe('accepted');
    expect(after.acceptanceDeadline).toBeNull();
    expect(after.doctorJoined).toBe(true);
  });

  test('the patient joining does NOT mark it accepted', async () => {
    // Only the doctor can accept. A patient sitting in the room waiting is
    // the very situation the timeout exists to end.
    const s = await instantRequest();

    const patient = await connectSocket(patientToken);
    const ack = await joinCall(patient, s._id);
    expect(ack.ok).toBe(true);
    expect(ack.pendingAccept).toBe(true);
    await require('../../services/call/callService')._settled();

    const after = await Session.findById(s._id);
    expect(after.acceptanceStatus).toBe('pending');
    expect(after.patientJoined).toBe(true);
  });

  test('joining does not resurrect a payment state that changed underneath it', async () => {
    // The first engine's join used to full-document save() a snapshot read
    // before its awaits, so a refund landing in between was silently reverted
    // by someone merely joining.
    const s = await instantRequest();

    const doctor = await connectSocket(doctorToken);
    await Session.updateOne({ _id: s._id }, {
      $set: { paymentStatus: 'refunded', refundId: 'rfnd_race', refundAmount: 800 }
    });
    // The call is gated on payment, so this join is refused — the assertion
    // that matters is that the refund is still recorded afterwards.
    expect((await joinCall(doctor, s._id)).ok).toBe(false);

    expect((await Session.findById(s._id)).paymentStatus).toBe('refunded');
  });
});

/* ─────────────── the "Patient Waiting" banner stops lying ──────────────── */

describe('GET /api/sessions/delayed', () => {
  const delayed = (over = {}) => instantRequest({
    acceptanceStatus: 'delayed',
    delayedUntil: new Date(Date.now() + 5 * 60 * 1000),
    acceptanceDeadline: null,
    ...over
  });

  test('lists a patient who really is still waiting', async () => {
    const s = await delayed();
    const res = await call('get', '/api/sessions/delayed', doctorToken);
    expect(res.status).toBe(200);
    expect(res.body.sessions.map((x) => String(x._id))).toContain(String(s._id));
  });

  test('a session the doctor already joined is NOT still waiting', async () => {
    // The reported bug: the banner came back after the call had happened and
    // invited the doctor to rejoin a finished conversation. Only 'cancelled'
    // and 'completed' were excluded, and a call that ended without being
    // formally completed is neither.
    await delayed({ doctorJoined: true });
    const res = await call('get', '/api/sessions/delayed', doctorToken);
    expect(res.body.sessions).toHaveLength(0);
  });

  test('a call in progress is NOT still waiting', async () => {
    await delayed({ callStatus: 'in-progress' });
    const res = await call('get', '/api/sessions/delayed', doctorToken);
    expect(res.body.sessions).toHaveLength(0);
  });

  test('a completed session is NOT still waiting', async () => {
    await delayed({ status: 'completed' });
    const res = await call('get', '/api/sessions/delayed', doctorToken);
    expect(res.body.sessions).toHaveLength(0);
  });

  test('joining clears a DELAYED session, not just a pending one', async () => {
    // "Join Now" on the banner navigates straight to the room without calling
    // /accept, so matching only acceptanceStatus 'pending' left these delayed
    // forever — which is what made the banner permanent.
    const s = await delayed();

    const doctor = await connectSocket(doctorToken);
    expect((await joinCall(doctor, s._id)).ok).toBe(true);
    await require('../../services/call/callService')._settled();

    expect((await Session.findById(s._id)).acceptanceStatus).toBe('accepted');

    const res = await call('get', '/api/sessions/delayed', doctorToken);
    expect(res.body.sessions).toHaveLength(0);
  });
});

/* ─────────────────────────── the expiry sweep ──────────────────────────── */

describe('the unanswered-request sweep', () => {
  test('a call in progress is NEVER swept', async () => {
    // The regression that matters most. An immediate session runs 20 minutes;
    // the old sweep cancelled and refunded it 10 minutes in if nobody had
    // pressed Accept, mid-conversation.
    const s = await instantRequest({
      acceptanceDeadline: new Date(Date.now() - 60 * 1000),
      callStatus: 'in-progress',
      doctorJoined: true
    });
    // Aged past the OLD ten-minute createdAt rule too, so this test fails
    // against the previous sweep rather than passing because the session
    // happened to be young.
    await Session.collection.updateOne(
      { _id: s._id },
      { $set: { createdAt: new Date(Date.now() - 30 * 60 * 1000) } }
    );

    await sweepStuckUnacceptedSessions(null);

    expect((await Session.findById(s._id)).status).toBe('active');
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('a doctor who has joined is never swept, even before the call registers', async () => {
    const s = await instantRequest({
      acceptanceDeadline: new Date(Date.now() - 60 * 1000),
      doctorJoined: true
    });
    await Session.collection.updateOne(
      { _id: s._id },
      { $set: { createdAt: new Date(Date.now() - 30 * 60 * 1000) } }
    );

    await sweepStuckUnacceptedSessions(null);

    expect((await Session.findById(s._id)).status).toBe('active');
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('an expired, genuinely unanswered request is cancelled and refunded', async () => {
    const s = await instantRequest({
      acceptanceDeadline: new Date(Date.now() - 60 * 1000),
      ringDeliveredAt: new Date()
    });

    const swept = await sweepStuckUnacceptedSessions(null);

    expect(swept).toBe(1);
    const after = await Session.findById(s._id);
    expect(after.status).toBe('cancelled');
    expect(after.paymentStatus).toBe('refunded');
    expect(mockRefund).toHaveBeenCalledTimes(1);
  });

  test('a request still inside its window is left alone', async () => {
    const s = await instantRequest({ acceptanceDeadline: new Date(Date.now() + 60 * 1000) });

    await sweepStuckUnacceptedSessions(null);

    expect((await Session.findById(s._id)).status).toBe('active');
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('a row predating acceptanceDeadline still expires on its age', async () => {
    // Sessions already in flight when this shipped carry no deadline. They
    // must still resolve rather than sit unanswered forever.
    const s = await instantRequest({ acceptanceDeadline: null });
    await Session.collection.updateOne(
      { _id: s._id },
      { $set: { createdAt: new Date(Date.now() - 30 * 60 * 1000) } }
    );

    await sweepStuckUnacceptedSessions(null);

    expect((await Session.findById(s._id)).status).toBe('cancelled');
  });

  test('two sweeps over the same request refund once', async () => {
    await instantRequest({
      acceptanceDeadline: new Date(Date.now() - 60 * 1000),
      ringDeliveredAt: new Date()
    });

    await sweepStuckUnacceptedSessions(null);
    await sweepStuckUnacceptedSessions(null);

    expect(mockRefund).toHaveBeenCalledTimes(1);
  });
});

/* ───────────────── a strike only for a ring that arrived ────────────────── */

describe('who gets blamed for an unanswered request', () => {
  const countFor = async (userId) => (await DoctorProfile.findOne({ userId })).cancellationCount || 0;

  test('a doctor who was rung and did not answer takes the strike', async () => {
    await instantRequest({
      acceptanceDeadline: new Date(Date.now() - 60 * 1000),
      ringDeliveredAt: new Date()
    });

    await sweepStuckUnacceptedSessions(null);

    expect(await countFor(f.doctorA._id)).toBe(1);
  });

  test('a doctor the ring never reached does NOT', async () => {
    // The commonest way to collect a strike used to be a dropped socket: the
    // event was emitted into an empty room, the doctor saw nothing, and three
    // of those raised a warning on their account.
    await instantRequest({
      acceptanceDeadline: new Date(Date.now() - 60 * 1000),
      ringDeliveredAt: null
    });

    await sweepStuckUnacceptedSessions(null);

    expect(await countFor(f.doctorA._id)).toBe(0);
  });

  test('the patient is still refunded either way', async () => {
    // Fairness to the doctor must not come out of the patient's pocket.
    const s = await instantRequest({
      acceptanceDeadline: new Date(Date.now() - 60 * 1000),
      ringDeliveredAt: null
    });

    await sweepStuckUnacceptedSessions(null);

    const after = await Session.findById(s._id);
    expect(after.status).toBe('cancelled');
    expect(after.paymentStatus).toBe('refunded');
    expect(mockRefund).toHaveBeenCalledTimes(1);
  });
});

describe('accept and delay answer only a request that is still waiting', () => {
  test('accepting a request the sweep already cancelled is refused, and nothing is revived', async () => {
    // acceptSession was a read-modify-save with no state check; for a
    // regular session it even wrote status 'scheduled'. An accept that raced
    // the expiry sweep brought a cancelled, refunded session back to life.
    const s = await instantRequest({
      status: 'cancelled', paymentStatus: 'refunded', refundId: 'rfnd_x', refundAmount: 800,
      cancelledBy: 'system'
    });
    const res = await call('post', `/api/sessions/${s._id}/accept`, doctorToken, {});
    expect(res.status).toBe(409);

    const after = await Session.findById(s._id);
    expect(after.status).toBe('cancelled');
    expect(after.acceptanceStatus).toBe('pending');
  });

  test('accepting restarts the session clock from the answer, not the request', async () => {
    const s = await instantRequest({ startsAt: new Date(Date.now() - 90 * 1000) });
    const before = Date.now();
    const res = await call('post', `/api/sessions/${s._id}/accept`, doctorToken, {});
    expect(res.status).toBe(200);

    const after = await Session.findById(s._id);
    expect(after.acceptanceStatus).toBe('accepted');
    expect(after.acceptanceDeadline).toBeNull();
    expect(after.startsAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(after.endsAt.getTime() - after.startsAt.getTime()).toBe(20 * 60 * 1000);
  });

  test('accept is refused for a session that is not an instant request', async () => {
    const s = await instantRequest({ sessionType: 'regular', status: 'scheduled', startsAt: new Date(Date.now() + 864e5) });
    const res = await call('post', `/api/sessions/${s._id}/accept`, doctorToken, {});
    expect(res.status).toBe(400);
    expect((await Session.findById(s._id)).status).toBe('scheduled');
  });

  test('a delay moves the deadline, so a delayed request still expires', async () => {
    const s = await instantRequest();
    const res = await call('post', `/api/sessions/${s._id}/delay`, doctorToken, { delayMinutes: 5 });
    expect(res.status).toBe(200);

    const after = await Session.findById(s._id);
    expect(after.acceptanceStatus).toBe('delayed');
    const { DELAY_GRACE_MINUTES } = require('../../config/time');
    expect(after.acceptanceDeadline.getTime() - after.delayedUntil.getTime()).toBe(DELAY_GRACE_MINUTES * 60 * 1000);
    // Answering with a delay proves the ring arrived.
    expect(after.ringDeliveredAt).toBeInstanceOf(Date);
  });

  test('a delay is capped, whatever the client asks for', async () => {
    const s = await instantRequest();
    await call('post', `/api/sessions/${s._id}/delay`, doctorToken, { delayMinutes: 600 });
    const { MAX_DELAY_MINUTES } = require('../../config/time');
    expect((await Session.findById(s._id)).delayMinutes).toBe(MAX_DELAY_MINUTES);
  });

  test('the patient can withdraw before the deadline, without the doctor taking a strike', async () => {
    const s = await instantRequest({ ringDeliveredAt: new Date() });
    const before = (await DoctorProfile.findOne({ userId: f.doctorA._id })).cancellationCount || 0;

    const res = await call('post', `/api/sessions/${s._id}/missed`, patientToken, {});
    expect(res.status).toBe(200);

    const after = await Session.findById(s._id);
    expect(after.status).toBe('cancelled');
    expect(after.cancelledBy).toBe('patient');
    expect(after.paymentStatus).toBe('refunded');
    expect((await DoctorProfile.findOne({ userId: f.doctorA._id })).cancellationCount || 0).toBe(before);
  });

  test('the patient cannot withdraw once the doctor has accepted', async () => {
    const s = await instantRequest({ acceptanceStatus: 'accepted', acceptanceDeadline: null });
    const res = await call('post', `/api/sessions/${s._id}/missed`, patientToken, {});
    expect(res.status).toBe(409);
    expect((await Session.findById(s._id)).status).toBe('active');
  });
});
