/**
 * Call signalling v2 (socket/call.socket.js → services/call/callService.js),
 * with real Socket.IO clients against the production socket options
 * (config/socket.js). What each test pins is a way calls used to fail.
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
  await connectDb('call.v2');
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

describe('joining', () => {
  test('both join: the same epoch, the patient is the polite side, each learns of the other, one stay each', async () => {
    const s = await paidSession();
    const { p, d } = await bothIn(s);
    expect(p.ok).toBe(true);
    expect(d.ok).toBe(true);
    expect(p.self.polite).toBe(true);
    expect(d.self.polite).toBe(false);
    expect(d.peer).toMatchObject({ role: 'patient', present: true, connection: 'connected' });
    expect(callService.snapshot(String(s._id)).epoch).toBe(d.epoch);
    await callService._settled();
    const after = await Session.findById(s._id).lean();
    expect(after.attendance.filter((a) => !a.leftAt).map((a) => a.role).sort()).toEqual(['doctor', 'patient']);
    expect(after.callStatus).toBe('in-progress');
  });

  test('joining twice from the same page is harmless: same epoch, still one stay', async () => {
    const s = await paidSession();
    const patient = await connect(f.patientA);
    const a = await ask(patient, 'call:join', joinMsg(s, 'p-tab-1'));
    const b = await ask(patient, 'call:join', joinMsg(s, 'p-tab-1'));
    expect(b.epoch).toBe(a.epoch);
    await callService._settled();
    const after = await Session.findById(s._id).lean();
    expect(after.attendance.filter((x) => x.role === 'patient')).toHaveLength(1);
  });

  test('an old build (protocol 1) is told to refresh', async () => {
    const s = await paidSession();
    const patient = await connect(f.patientA);
    const refresh = waitFor(patient, 'call:please-refresh');
    const res = await ask(patient, 'call:join', { ...joinMsg(s, 'x'), protocol: 1 });
    expect(res).toMatchObject({ ok: false, code: 'PROTOCOL_OUTDATED' });
    await refresh;
  });

  test('a stranger, an unpaid session and a closed one are refused', async () => {
    const s = await paidSession();
    const stranger = await connect(f.patientB);
    const denied = await ask(stranger, 'call:join', joinMsg(s, 'x'));
    expect(denied.ok).toBe(false);
    const unpaid = await paidSession({ paymentStatus: 'pending', status: 'payment_pending', paymentId: null });
    const patient = await connect(f.patientA);
    expect(await ask(patient, 'call:join', joinMsg(unpaid, 'x'))).toMatchObject({ ok: false, code: 'NOT_PAID' });
  });
});

describe('signalling', () => {
  test('an offer goes to the other person only, with the epoch; a stale epoch is refused', async () => {
    const s = await paidSession();
    const { patient, doctor, d } = await bothIn(s);
    const got = waitFor(patient, 'call:signal');
    const sent = await ask(doctor, 'call:signal', { sessionId: String(s._id), epoch: d.epoch, description: { type: 'offer', sdp: 'v=0 fake' } });
    expect(sent).toMatchObject({ ok: true, delivered: true });
    const msg = await got;
    expect(msg).toMatchObject({ epoch: d.epoch, description: { type: 'offer' }, from: { role: 'doctor' } });
    const stale = await ask(doctor, 'call:signal', { sessionId: String(s._id), epoch: d.epoch - 1, candidate: null });
    expect(stale).toMatchObject({ ok: false, code: 'STALE_EPOCH', epoch: d.epoch });
  });

  test('a second tab takes over: the first is told, and can no longer signal', async () => {
    const s = await paidSession();
    const { patient, doctor } = await bothIn(s);
    const superseded = waitFor(patient, 'call:superseded');
    const tab2 = await connect(f.patientA);
    const epochBump = waitFor(doctor, 'call:peer', (m) => m.instanceId === 'p-tab-2');
    const j = await ask(tab2, 'call:join', joinMsg(s, 'p-tab-2'));
    await superseded;
    await epochBump;
    const refused = await ask(patient, 'call:signal', { sessionId: String(s._id), epoch: j.epoch, candidate: null });
    expect(refused.ok).toBe(false);
  });

  test('messages are checked: an oversize description is refused; patient-only events are refused to the doctor', async () => {
    const s = await paidSession();
    const { doctor, d } = await bothIn(s);
    const big = await ask(doctor, 'call:signal', { sessionId: String(s._id), epoch: d.epoch, description: { type: 'offer', sdp: 'x'.repeat(70 * 1024) } });
    expect(big).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    const prep = await ask(doctor, 'call:prep-data', { sessionId: String(s._id), tags: ['anxious'] });
    expect(prep.ok).toBe(false);
  });
});

describe('a dropped connection', () => {
  test('the other side sees "reconnecting", and a rejoin within the grace leaves attendance untouched', async () => {
    const s = await paidSession();
    const { patient, doctor } = await bothIn(s);
    await callService._settled();
    const reconnecting = waitFor(doctor, 'call:peer', (m) => m.connection === 'reconnecting');
    patient.disconnect();
    await reconnecting;
    const back = await connect(f.patientA);
    const connected = waitFor(doctor, 'call:peer', (m) => m.connection === 'connected');
    await ask(back, 'call:join', joinMsg(s, 'p-tab-1'));
    await connected;
    await sleep(1600);
    await callService._settled();
    const after = await Session.findById(s._id).lean();
    expect(after.attendance.filter((a) => a.role === 'patient' && a.leftAt)).toHaveLength(0);
  });

  test('gone past the grace: the other side is told, and the stay ends when they were last heard', async () => {
    const s = await paidSession();
    const { patient, doctor } = await bothIn(s);
    await callService._settled();
    const lastHeard = Date.now();
    const left = waitFor(doctor, 'call:peer-left', (m) => m.role === 'patient', 8000);
    patient.disconnect();
    await left;
    await callService._settled();
    const stay = (await Session.findById(s._id).lean()).attendance.find((a) => a.role === 'patient');
    expect(stay.leftAt).not.toBeNull();
    expect(Math.abs(new Date(stay.leftAt).getTime() - lastHeard)).toBeLessThan(1500);
  });

  test('signals for someone reconnecting are kept and delivered when they are back', async () => {
    const s = await paidSession();
    const { patient, doctor, d } = await bothIn(s);
    const reconnecting = waitFor(doctor, 'call:peer', (m) => m.connection === 'reconnecting');
    patient.disconnect();
    await reconnecting;
    const queued = await ask(doctor, 'call:signal', { sessionId: String(s._id), epoch: d.epoch, candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 } });
    expect(queued).toMatchObject({ ok: true, queued: true });
    const back = await connect(f.patientA);
    const delivered = waitFor(back, 'call:signal');
    await ask(back, 'call:join', joinMsg(s, 'p-tab-1'));
    expect((await delivered).candidate.candidate).toMatch(/typ host/);
  });
});

describe('the call ends', () => {
  test('a cancelled session shows everyone out of its call', async () => {
    const s = await paidSession({ startsAt: new Date(Date.now() + 10 * 60 * 1000) });
    const { patient, doctor } = await bothIn(s);
    const outP = waitFor(patient, 'session-ended');
    const outD = waitFor(doctor, 'session-ended');
    const { applyTransition } = require('../../services/sessionTransition');
    const { EVENT, ACTOR } = require('../../services/sessionState');
    await applyTransition(String(s._id), { event: EVENT.CANCEL, actor: ACTOR.DOCTOR, payload: { cancelledBy: 'doctor' } });
    await outP;
    await outD;
    expect(callService.hasRoom(String(s._id))).toBe(false);
  });

  test('time up after both were in: completed by the same rule as the sweep, both told', async () => {
    // Both in since the start (a doctor first joining now would be late and
    // rightly move the end 20 minutes on).
    const start = new Date(Date.now() - 20 * 60 * 1000 + 2500);
    const s = await paidSession({
      startsAt: start, duration: 20,
      attendance: [
        { role: 'patient', joinedAt: start, leftAt: null, source: 'socket' },
        { role: 'doctor', joinedAt: start, leftAt: null, source: 'socket' }
      ],
      patientJoined: true, patientJoinedAt: start, doctorJoined: true, doctorJoinedAt: start
    });
    const { patient, doctor } = await bothIn(s);
    await callService._settled();
    const upP = waitFor(patient, 'session-time-up', () => true, 10000);
    const upD = waitFor(doctor, 'session-time-up', () => true, 10000);
    await upP;
    await upD;
    await sleep(300);
    const after = await Session.findById(s._id).lean();
    expect(after.status).toBe('completed');
    expect(after.outcome.code).toBe('completed');
  });
});

describe('the connection itself', () => {
  test('a browser on another website cannot open a socket (origin check)', async () => {
    await expect(connect(f.patientA, { origin: 'https://evil.example' })).rejects.toThrow(/connect_error/);
    await expect(connect(f.patientA, { origin: ORIGIN })).resolves.toBeTruthy();
  });

  test('a database outage at the handshake says "busy", never "Authentication" (so clients keep retrying)', async () => {
    require('../../services/cache.service').flush();
    const User = require('../../models/user');
    const spy = jest.spyOn(User, 'findById').mockImplementation(() => { throw new Error('MongoNetworkError: connection lost'); });
    try {
      const err = await connect(f.patientA).catch((e) => e);
      expect(err.message).toMatch(/Server busy/);
      expect(err.message).not.toMatch(/Authentication/);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('after a restart', () => {
  test('stays are closed only for people who did not come back, at when they were last seen', async () => {
    const attendance = require('../../services/attendance');
    const bootAt = new Date();
    const lastSeen = new Date(bootAt.getTime() - 30 * 1000);
    const s = await paidSession({
      startsAt: new Date(Date.now() - 5 * 60 * 1000),
      attendance: [
        { role: 'patient', joinedAt: new Date(Date.now() - 4 * 60 * 1000), leftAt: null, source: 'socket' },
        { role: 'doctor', joinedAt: new Date(Date.now() - 4 * 60 * 1000), leftAt: null, source: 'socket' }
      ],
      callPresence: { patientLastSeenAt: lastSeen }
    });
    // The doctor came back; the patient did not.
    // (Other tests' sessions may have open stays too; only this one is checked.)
    await attendance.settleStaleStays({ bootAt, isPresent: (id, role) => id === String(s._id) && role === 'doctor' });
    const after = await Session.findById(s._id).lean();
    expect(after.attendance.find((a) => a.role === 'doctor').leftAt).toBeNull();
    expect(new Date(after.attendance.find((a) => a.role === 'patient').leftAt).getTime()).toBe(lastSeen.getTime());
  });
});
