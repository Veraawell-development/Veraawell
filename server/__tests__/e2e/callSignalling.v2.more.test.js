/**
 * Call signalling v2, the rest: refusals at the door, an instant request
 * accepted by joining, camera/mic state and the media heartbeat, the
 * patient's check-in, leaving on purpose, the end moving, and a server
 * shutdown mid-call. Same harness as callSignalling.v2.test.js.
 */

require('../support/env');

process.env.CALL_GRACE_MS = '700';
process.env.CALL_QUIET_MS = '700';

const http = require('http');
const { connectDb, disconnectDb } = require('../support/db');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const jwt = require('jsonwebtoken');

jest.setTimeout(60000);

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: jest.fn().mockResolvedValue({ id: 'r', status: 'processed' }), fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));

const ORIGIN = 'http://localhost:5173';
let httpServer, io, port, f, Session, callService, getJWTSecret;
const sockets = [];

beforeAll(async () => {
  await connectDb('call.v2b');
  Session = require('../../models/session');
  callService = require('../../services/call/callService');
  ({ getJWTSecret } = require('../../config/auth'));
  f = await require('../support/seed').seedAll();
  httpServer = http.createServer();
  io = new Server(httpServer, require('../../config/socket').buildIoOptions({ allowedOrigins: [ORIGIN] }));
  require('../../socket').initializeSockets(io);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
}, 180000);

afterAll(async () => {
  callService._reset();
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await disconnectDb();
});

afterEach(async () => {
  while (sockets.length) {
    const s = sockets.pop();
    try { s.close(); } catch (_) { /* closed */ }
  }
  await callService._settled();
  callService._reset();
  require('../../services/cache.service').flush();
});

const tokenFor = (u) => jwt.sign({ userId: String(u._id), role: u.role, username: u.username }, getJWTSecret(), { expiresIn: '1h' });

function connect(user, { origin } = {}) {
  return new Promise((resolve, reject) => {
    const s = ioClient(`http://localhost:${port}`, {
      auth: { token: tokenFor(user), callProtocol: 2 },
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: origin ? { origin } : undefined
    });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(new Error(`connect_error: ${e.message}`)));
    setTimeout(() => reject(new Error('connect timeout')), 10000);
  });
}

const ask = (s, event, payload) => s.timeout(8000).emitWithAck(event, payload);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitFor(socket, event, match = () => true, ms = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    const handler = (payload) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

async function paidSession(over = {}) {
  return Session.create({
    patientId: f.patientA._id, doctorId: f.doctorA._id,
    startsAt: new Date(Date.now() + 5 * 60 * 1000), duration: 20, price: 800,
    status: 'scheduled', paymentStatus: 'paid', paymentId: `pay_v2_${Date.now()}_${Math.random()}`,
    ...over
  });
}

const joinMsg = (s, instanceId) => ({ sessionId: String(s._id), protocol: 2, instanceId, client: { browser: 'jest', os: 'node' } });

async function bothIn(session) {
  const patient = await connect(f.patientA);
  const doctor = await connect(f.doctorA);
  const p = await ask(patient, 'call:join', joinMsg(session, 'p-tab-1'));
  const peerJoined = waitFor(patient, 'call:peer', (m) => m.role === 'doctor' && m.connection === 'connected');
  const d = await ask(doctor, 'call:join', joinMsg(session, 'd-tab-1'));
  await peerJoined;
  return { patient, doctor, p, d };
}


describe('refused at the door, with a reason the screen can show', () => {
  test('unpaid, cancelled and not-yet-open sessions', async () => {
    const patient = await connect(f.patientA);
    const unpaid = await paidSession({ paymentStatus: 'pending', status: 'payment_pending', paymentId: null });
    const cancelled = await paidSession({ status: 'cancelled' });
    const later = await paidSession({ startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000) });
    const r1 = await ask(patient, 'call:join', joinMsg(unpaid, 'p1'));
    const r2 = await ask(patient, 'call:join', joinMsg(cancelled, 'p1'));
    const r3 = await ask(patient, 'call:join', joinMsg(later, 'p1'));
    expect([r1.ok, r2.ok, r3.ok]).toEqual([false, false, false]);
    // The policy may refuse an unpaid session before the service sees it;
    // either way it is a clear refusal, not a join.
    expect(['NOT_PAID', 'FORBIDDEN', 'NOT_JOINABLE']).toContain(r1.code);
    expect(['CLOSED', 'FORBIDDEN', 'NOT_JOINABLE']).toContain(r2.code);
    expect(r3.code).toBe('NOT_YET');
    expect(r3.retryable).toBe(true);
    expect(callService.hasRoom(String(later._id))).toBe(false);
  });
});

describe('an instant request', () => {
  test("the doctor joining accepts it, and the waiting patient's clock starts", async () => {
    const s = await paidSession({ sessionType: 'immediate', status: 'active', acceptanceStatus: 'pending', startsAt: new Date(), acceptanceDeadline: new Date(Date.now() + 2 * 60 * 1000) });
    const patient = await connect(f.patientA);
    const p = await ask(patient, 'call:join', joinMsg(s, 'p1'));
    expect(p.ok).toBe(true);
    expect(p.pendingAccept).toBe(true);
    const doctor = await connect(f.doctorA);
    const sync = waitFor(patient, 'timer-sync', (m) => !!m.endsAt);
    const d = await ask(doctor, 'call:join', joinMsg(s, 'd1'));
    expect(d.ok).toBe(true);
    expect(d.pendingAccept).toBe(false);
    const t = await sync;
    const remaining = new Date(t.endsAt).getTime() - Date.now();
    expect(remaining).toBeGreaterThan(18 * 60 * 1000);
    expect((await Session.findById(s._id).lean()).acceptanceStatus).toBe('accepted');
  });

  test('a withdrawn request cannot be joined', async () => {
    const s = await paidSession({ sessionType: 'immediate', status: 'active', acceptanceStatus: 'pending', startsAt: new Date() });
    await Session.updateOne({ _id: s._id }, { $set: { acceptanceStatus: 'expired' } }).catch(() => {});
    const doctor = await connect(f.doctorA);
    const d = await ask(doctor, 'call:join', joinMsg(s, 'd1'));
    expect(d.ok).toBe(false);
  });
});

describe('in the call', () => {
  test('camera/mic switches reach the other person; the media heartbeat is accepted', async () => {
    const s = await paidSession();
    const { patient, doctor } = await bothIn(s);
    const media = waitFor(doctor, 'call:media');
    expect((await ask(patient, 'call:media-state', { sessionId: String(s._id), audio: false, video: true })).ok).toBe(true);
    expect(await media).toMatchObject({ audio: false, video: true });
    const health = await ask(patient, 'call:media-health', { sessionId: String(s._id), audioFlowing: true, videoFlowing: true, candidateType: 'relay', rtt: 120, loss: 1, iceState: 'connected' });
    expect(health.ok).toBe(true);
    const snap = callService.snapshot(String(s._id));
    expect(snap.parties.find((x) => x.role === 'patient').health).toMatchObject({ candidateType: 'relay', rtt: 120 });
  });

  test("the patient's check-in reaches the therapist; a doctor can't send one", async () => {
    const s = await paidSession();
    const { patient, doctor } = await bothIn(s);
    const got = waitFor(doctor, 'call:prep-data');
    expect((await ask(patient, 'call:prep-data', { sessionId: String(s._id), tags: ['Anxious', 'Sleep'] })).ok).toBe(true);
    expect((await got).tags).toEqual(['Anxious', 'Sleep']);
    const refused = await ask(doctor, 'call:prep-data', { sessionId: String(s._id), tags: ['x'] });
    expect(refused.ok).toBe(false);
  });

  test('events before joining are refused', async () => {
    const s = await paidSession();
    const patient = await connect(f.patientA);
    const r = await ask(patient, 'call:media-state', { sessionId: String(s._id), audio: true, video: true });
    expect(r.ok).toBe(false);
  });

  test('leaving on purpose: the other person is told at once, the stay closes, the room pauses when empty', async () => {
    const s = await paidSession();
    const { patient, doctor } = await bothIn(s);
    const left = waitFor(patient, 'call:peer-left');
    expect((await ask(doctor, 'call:leave', { sessionId: String(s._id), reason: 'user' })).ok).toBe(true);
    expect(await left).toMatchObject({ role: 'doctor', reason: 'left' });
    expect(callService.isPresent(String(s._id), 'doctor')).toBe(false);
    expect(callService.isPresent(String(s._id), 'patient')).toBe(true);
    await callService._settled();
    let after = await Session.findById(s._id).lean();
    expect(after.attendance.find((a) => a.role === 'doctor').leftAt).toBeTruthy();

    expect((await ask(patient, 'call:leave', { sessionId: String(s._id) })).ok).toBe(true);
    await callService._settled();
    await sleep(100);
    await callService._settled();
    expect(callService.hasRoom(String(s._id))).toBe(false);
    after = await Session.findById(s._id).lean();
    expect(after.callStatus).toBe('paused');
    // A second leave is refused (no longer in the call) and changes nothing.
    expect((await ask(patient, 'call:leave', { sessionId: String(s._id) })).ok).toBe(false);
    expect(callService.hasRoom(String(s._id))).toBe(false);
  });

  test('leaving a moment after joining still closes the stay (the join is not written after the leave)', async () => {
    const s = await paidSession();
    const patient = await connect(f.patientA);
    await ask(patient, 'call:join', joinMsg(s, 'p1'));
    await ask(patient, 'call:leave', { sessionId: String(s._id) });
    await callService._settled();
    const after = await Session.findById(s._id).lean();
    expect(after.attendance).toHaveLength(1);
    expect(after.attendance[0].leftAt).toBeTruthy();
  });

  test('the end moving (a late doctor) is pushed to both at once', async () => {
    const s = await paidSession();
    const { patient } = await bothIn(s);
    const later = new Date(Date.now() + 40 * 60 * 1000);
    const sync = waitFor(patient, 'timer-sync', (m) => new Date(m.endsAt).getTime() === later.getTime());
    callService.setTiming(String(s._id), { endsAt: later });
    expect((await sync).remainingSeconds).toBeGreaterThan(39 * 60);
    callService.setTiming('000000000000000000000000', { endsAt: later }); // no room: nothing
  });
});

describe('our server shutting down mid-call', () => {
  test('both are told it is restarting, when each was last heard from is saved, and new joins wait', async () => {
    const s = await paidSession();
    const { patient, doctor } = await bothIn(s);
    const a = waitFor(patient, 'call:server-restarting');
    const b = waitFor(doctor, 'call:server-restarting');
    await callService.prepareShutdown();
    expect((await a).reconnectAfterMs).toBeGreaterThanOrEqual(1000);
    await b;
    const after = await Session.findById(s._id).lean();
    expect(after.callPresence.patientLastSeenAt).toBeTruthy();
    expect(after.callPresence.doctorLastSeenAt).toBeTruthy();
    const other = await paidSession();
    const late = await connect(f.patientA);
    const r = await ask(late, 'call:join', joinMsg(other, 'p9'));
    expect(r).toMatchObject({ ok: false, code: 'SERVER_RESTARTING', retryable: true });
  });
});

describe('the clock, from the old engine\'s tests', () => {
  test('a doctor joining late moves the end for both, at once', async () => {
    const startsAt = new Date(Date.now() - 5 * 60 * 1000);
    const s = await paidSession({ startsAt });
    const patient = await connect(f.patientA);
    await ask(patient, 'call:join', joinMsg(s, 'p1'));
    const doctor = await connect(f.doctorA);
    const moved = waitFor(patient, 'timer-sync', (m) => new Date(m.endsAt) > new Date(startsAt.getTime() + 20 * 60 * 1000), 8000);
    const joinedAt = Date.now();
    await ask(doctor, 'call:join', joinMsg(s, 'd1'));
    const m = await moved;
    // About the doctor's join + 20 minutes: the patient keeps their full time.
    expect(Math.abs(new Date(m.endsAt).getTime() - (joinedAt + 20 * 60 * 1000))).toBeLessThan(5000);
  });

  test('time up with only one person there completes nothing (the sweep decides)', async () => {
    const startsAt = new Date(Date.now() - 20 * 60 * 1000 + 2000);
    const s = await paidSession({ startsAt });
    const patient = await connect(f.patientA);
    const up = waitFor(patient, 'session-time-up', () => true, 8000);
    await ask(patient, 'call:join', joinMsg(s, 'p1'));
    await up;
    expect((await Session.findById(s._id).lean()).status).toBe('scheduled');
  });

  test('a refusal never closes the socket (the page keeps its connection)', async () => {
    const s = await paidSession();
    const stranger = await connect(f.patientB);
    const r = await ask(stranger, 'call:join', joinMsg(s, 'x'));
    expect(r.ok).toBe(false);
    await sleep(200);
    expect(stranger.connected).toBe(true);
  });
});

describe('abuse', () => {
  test('a socket flooding the server is refused, then cut off', async () => {
    const s = await paidSession();
    const { patient } = await bothIn(s);
    const gone = new Promise((resolve) => patient.on('disconnect', resolve));
    const msg = { sessionId: String(s._id), audioFlowing: true, videoFlowing: true };
    // The heartbeat allows 3 at once, then one every 5 s.
    for (let i = 0; i < 30; i++) patient.emit('call:media-health', msg);
    await expect(Promise.race([gone, sleep(5000).then(() => 'still connected')])).resolves.not.toBe('still connected');
  });

  test('every event must declare how it is authorized (a programming error, caught at startup)', () => {
    const { createGuardedRegistrar } = require('../../authz/socket');
    const fake = { data: {}, on() {} };
    const { on } = createGuardedRegistrar(fake);
    expect(() => on('x', {}, () => {})).toThrow(/must declare a mode/);
    expect(() => on('y', { mode: 'policy' }, () => {})).toThrow(/declares no action/);
  });
});

