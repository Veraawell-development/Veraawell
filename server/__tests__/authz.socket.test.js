/**
 * Socket.IO authorization.
 *
 * 13 of the 16 application socket events had no authorization: they took a
 * sessionId/conversationId from the client payload and acted on it. Verified
 * against a running server before the fix: an authenticated account that had
 * never joined the room emitted `call-ended` for a stranger's in-progress
 * therapy session and set it to 'completed'.
 *
 * The negative cases matter, but so does the positive one. A guard that also
 * breaks real calls is worse than the hole it closes, so this asserts that
 * both parties can still join and relay WebRTC signalling end to end
 * (call:* events, socket/call.socket.js).
 */

process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';

const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const jwt = require('jsonwebtoken');

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: jest.fn(), fetchMultipleRefund: jest.fn() },
  accounts: { create: jest.fn() }
})));
jest.mock('../services/email.service', () => new Proxy({}, { get: () => jest.fn().mockResolvedValue(undefined) }));

const { startDb, stopDb, clearDb, makeUser, makeSession } = require('./helpers/harness');
const { getJWTSecret } = require('../config/auth');

jest.setTimeout(45000);

let httpServer, io, port;
let Session;

beforeAll(async () => {
  await startDb();
  Session = require('../models/session');

  httpServer = http.createServer();
  io = new Server(httpServer, { cors: { origin: '*' } });
  require('../socket').initializeSockets(io);

  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await stopDb();
});

afterEach(async () => {
  // The handshake caches the user for a few seconds; clear it so a user
  // deleted between tests is not resurrected from cache.
  require('../services/cache.service').flush();
  require('../services/call/callService')._reset();
  await clearDb();
});

const tokenFor = (u) => jwt.sign(
  { userId: u._id.toString(), role: u.role, username: u.username },
  getJWTSecret(),
  { expiresIn: '1h' }
);

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}`, { auth: { token }, transports: ['websocket'] });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (e) => reject(new Error(`connect_error: ${e.message}`)));
    setTimeout(() => reject(new Error('connect timeout')), 8000);
  });
}

/** Resolve with the first payload for `event`, or null after `ms`. */
function once(socket, event, ms = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (data) => { clearTimeout(timer); resolve(data || {}); });
  });
}

async function seed({ hoursFromNow = 1 } = {}) {
  const patient = await makeUser('patient');
  const doctor = await makeUser('doctor');
  const stranger = await makeUser('patient');
  const session = await makeSession({ patient, doctor, hoursFromNow, callStatus: 'in-progress', callStartTime: new Date() });
  return { patient, doctor, stranger, session };
}

const ask = (socket, event, payload) => socket.timeout(8000).emitWithAck(event, payload);
const joinMsg = (sid, instanceId) => ({ sessionId: sid, protocol: 2, instanceId, client: { browser: 'jest' } });

describe('a non-participant cannot act on a call', () => {
  test('a stranger cannot join the call, and nothing about the session changes', async () => {
    const { stranger, session } = await seed();
    const socket = await connect(tokenFor(stranger));

    const denied = once(socket, 'authz:denied');
    const ack = await ask(socket, 'call:join', joinMsg(String(session._id), 'x1'));
    const d = await denied;

    expect(ack.ok).toBe(false);
    expect(d.code).toBe('AUTHZ_NOT_PARTICIPANT');
    // Must not contain the substrings that make the client's data socket give
    // up reconnecting, or the call page send the person to sign in.
    expect(d.message).not.toMatch(/Authentication|No token/);

    const after = await Session.findById(session._id);
    expect(after.status).toBe('scheduled');
    expect(after.callStatus).toBe('in-progress');
    socket.close();
  });

  test('signalling is refused for a socket that never joined the call', async () => {
    const { stranger, session } = await seed();
    const socket = await connect(tokenFor(stranger));
    const ack = await ask(socket, 'call:signal', { sessionId: String(session._id), epoch: 1, candidate: { candidate: 'malicious' } });
    expect(ack).toMatchObject({ ok: false, code: 'AUTHZ_NOT_IN_ROOM' });
    socket.close();
  });

  test("the first engine's events (an old open tab) are told to refresh and change nothing", async () => {
    const { patient, session } = await seed();
    const socket = await connect(tokenFor(patient));
    const told = once(socket, 'error');
    socket.emit('join-room', { sessionId: String(session._id) });
    expect((await told).message).toMatch(/refresh/i);
    socket.emit('call-ended', { sessionId: String(session._id) });
    await new Promise((r) => setTimeout(r, 300));
    expect((await Session.findById(session._id)).status).toBe('scheduled');
    socket.close();
  });

  test('a suspended account cannot complete the handshake', async () => {
    const suspended = await makeUser('patient', { status: 'suspended' });
    await expect(connect(tokenFor(suspended))).rejects.toThrow(/connect_error/);
  });

  // The handshake now makes the same two checks verifyToken does, from the
  // same helpers. Before, a password reset or a doctor's rejection ended
  // their HTTP access but left real-time access — chat, calls — open.
  test('a token issued before the last password change cannot complete the handshake', async () => {
    const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000 - 5000);
    const user = await makeUser('patient', { passwordChangedAt: changedAt });
    const older = jwt.sign(
      { userId: user._id.toString(), role: user.role, iat: Math.floor(changedAt.getTime() / 1000) - 60 },
      getJWTSecret(), { expiresIn: '1h' }
    );
    await expect(connect(older)).rejects.toThrow(/password changed/);

    const fresh = await connect(tokenFor(user));
    fresh.close();
  });

  test('a rejected doctor cannot complete the handshake', async () => {
    const rejected = await makeUser('doctor', { approvalStatus: 'rejected' });
    await expect(connect(tokenFor(rejected))).rejects.toThrow(/rejected/);
  });
});

/** Both parties in the call. */
async function joinBoth(patient, doctor, sid) {
  const pSock = await connect(tokenFor(patient));
  const dSock = await connect(tokenFor(doctor));
  expect((await ask(pSock, 'call:join', joinMsg(sid, 'p1'))).ok).toBe(true);
  const dAck = await ask(dSock, 'call:join', joinMsg(sid, 'd1'));
  expect(dAck.ok).toBe(true);
  return { pSock, dSock, epoch: dAck.epoch };
}

describe('the real call still works', () => {
  test('both join, signalling is relayed, and the doctor leaving does not end the session', async () => {
    // Started 15 minutes ago: the session is under way.
    const { patient, doctor, session } = await seed({ hoursFromNow: -0.25 });
    const sid = String(session._id);
    const { pSock, dSock, epoch } = await joinBoth(patient, doctor, sid);

    const gotOffer = once(pSock, 'call:signal');
    expect((await ask(dSock, 'call:signal', { sessionId: sid, epoch, description: { type: 'offer', sdp: 'REAL' } })).ok).toBe(true);
    expect((await gotOffer).description.sdp).toBe('REAL');

    const gotIce = once(pSock, 'call:signal');
    await ask(dSock, 'call:signal', { sessionId: sid, epoch, candidate: { candidate: 'host' } });
    expect((await gotIce).candidate).toMatchObject({ candidate: 'host' });

    // Leaving is only a departure: the patient hears it, nothing ends.
    const patientSeesLeave = once(pSock, 'call:peer-left');
    await ask(dSock, 'call:leave', { sessionId: sid });
    expect(await patientSeesLeave).toMatchObject({ role: 'doctor' });
    expect((await Session.findById(sid)).status).toBe('scheduled');

    pSock.close();
    dSock.close();
  });
});

describe('only a live session, inside its window, can be joined', () => {
  test('a cancelled session cannot be opened from its URL', async () => {
    const { patient, session } = await seed({ hoursFromNow: -0.25 });
    await Session.updateOne({ _id: session._id }, { $set: { status: 'cancelled', cancelledBy: 'patient' } });
    const sock = await connect(tokenFor(patient));
    const ack = await ask(sock, 'call:join', joinMsg(String(session._id), 'p1'));
    expect(ack.ok).toBe(false);
    expect(ack.message).toMatch(/can no longer be joined|cancelled/i);
    sock.close();
  });

  test('a session next week cannot be joined yet', async () => {
    const { patient, session } = await seed({ hoursFromNow: 24 * 7 });
    const sock = await connect(tokenFor(patient));
    const ack = await ask(sock, 'call:join', joinMsg(String(session._id), 'p1'));
    expect(ack).toMatchObject({ ok: false, code: 'NOT_YET' });
    expect(ack.message).toMatch(/15 minutes before/i);
    sock.close();
  });

  test('leaving a call pauses it without touching what happened to the session meanwhile', async () => {
    // The first engine wrote status 'scheduled' for any short call, from a
    // document read before an await — which revived a session the sweep had
    // just marked no-show.
    const { patient, doctor, session } = await seed({ hoursFromNow: -0.25 });
    const sid = String(session._id);
    const { pSock, dSock } = await joinBoth(patient, doctor, sid);

    await Session.updateOne({ _id: session._id }, { $set: { status: 'no-show' } });
    await ask(pSock, 'call:leave', { sessionId: sid });
    await ask(dSock, 'call:leave', { sessionId: sid });
    await require('../services/call/callService')._settled();
    await new Promise((r) => setTimeout(r, 300));

    expect((await Session.findById(sid)).status).toBe('no-show');
    pSock.close();
    dSock.close();
  });
});
