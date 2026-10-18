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
 * both parties can still join and relay WebRTC signaling end to end.
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

describe('a non-participant cannot act on a call', () => {
  test('call-ended from a stranger does not complete the session', async () => {
    const { stranger, session } = await seed();
    const socket = await connect(tokenFor(stranger));

    const denied = once(socket, 'authz:denied');
    socket.emit('call-ended', { sessionId: String(session._id), endedBy: 'attacker' });
    const d = await denied;

    expect(d).not.toBeNull();
    expect(d.code).toBe('AUTHZ_NOT_PARTICIPANT');
    // Must not contain the substrings that make the client's data-socket give
    // up reconnecting permanently, or make VideoCallRoom redirect to /auth.
    expect(d.message).not.toMatch(/Authentication|No token/);

    const after = await Session.findById(session._id);
    expect(after.status).toBe('scheduled');       // was: 'completed'
    expect(after.callStatus).toBe('in-progress'); // call not torn down

    socket.close();
  });

  test('signaling is rejected for a socket that never joined the room', async () => {
    const { stranger, session } = await seed();
    const socket = await connect(tokenFor(stranger));

    const denied = once(socket, 'authz:denied');
    socket.emit('ice-candidate', { sessionId: String(session._id), candidate: { candidate: 'malicious' } });
    const d = await denied;

    expect(d).not.toBeNull();
    expect(d.code).toBe('AUTHZ_NOT_IN_ROOM');
    socket.close();
  });

  test('a stranger cannot join the room at all', async () => {
    const { stranger, session } = await seed();
    const socket = await connect(tokenFor(stranger));

    const denied = once(socket, 'authz:denied');
    socket.emit('join-room', { sessionId: String(session._id) });
    const d = await denied;

    expect(d).not.toBeNull();
    expect(d.code).toBe('AUTHZ_NOT_PARTICIPANT');
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

/** Both parties join the room and wait for the join to land. */
async function joinBoth(patient, doctor, sid) {
  const pSock = await connect(tokenFor(patient));
  const dSock = await connect(tokenFor(doctor));

  const pJoined = once(pSock, 'room-joined');
  pSock.emit('join-room', { sessionId: sid });
  expect(await pJoined).not.toBeNull();

  const dJoined = once(dSock, 'room-joined');
  dSock.emit('join-room', { sessionId: sid });
  expect(await dJoined).not.toBeNull();

  return { pSock, dSock };
}

describe('ending a call is bound by the same completion rule as HTTP', () => {
  test('a participant ending the call BEFORE the scheduled start does not complete it', async () => {
    // call-ended used to write status 'completed' with no time check, so a
    // doctor could complete a booking hours or days out just by joining the
    // room and emitting this — which blocked the patient's refund (a
    // completed session cannot be cancelled) and made it count toward the
    // doctor's payout. POST /:id/complete already refused this; the socket
    // path now goes through the same transition guard.
    // Ten minutes out: inside the 15-minute join window, before the start.
    const { patient, doctor, session } = await seed({ hoursFromNow: 10 / 60 });
    const sid = String(session._id);
    const { pSock, dSock } = await joinBoth(patient, doctor, sid);

    dSock.emit('call-ended', { sessionId: sid, endedBy: 'doctor', userName: 'Doc' });
    await new Promise((r) => setTimeout(r, 800));

    const after = await Session.findById(sid);
    expect(after.status).toBe('scheduled');
    expect(after.paymentStatus).toBe('paid');

    pSock.close();
    dSock.close();
  });
});

describe('the real call still works', () => {
  test('both parties join, signaling is relayed, and the doctor leaving does not end the session', async () => {
    // Started 15 minutes ago: the session is under way.
    const { patient, doctor, session } = await seed({ hoursFromNow: -0.25 });
    const sid = String(session._id);

    const pSock = await connect(tokenFor(patient));
    const dSock = await connect(tokenFor(doctor));

    const pJoined = once(pSock, 'room-joined');
    pSock.emit('join-room', { sessionId: sid });
    expect(await pJoined).not.toBeNull();

    const dJoined = once(dSock, 'room-joined');
    dSock.emit('join-room', { sessionId: sid });
    expect(await dJoined).not.toBeNull();

    // mode:'joined' path — the cheap membership check, not a DB read
    const gotOffer = once(pSock, 'offer');
    dSock.emit('offer', { sessionId: sid, offer: { type: 'offer', sdp: 'REAL' } });
    const offer = await gotOffer;
    expect(offer && offer.offer && offer.offer.sdp).toBe('REAL');

    const gotIce = once(pSock, 'ice-candidate');
    dSock.emit('ice-candidate', { sessionId: sid, candidate: { candidate: 'host' } });
    expect(await gotIce).not.toBeNull();

    // call-ended used to complete the session on one person's say-so, and
    // was relayed so the other side's app completed it too. Now it is only
    // a departure: the patient hears the doctor left, nothing ends.
    const patientSeesLeave = once(pSock, 'user-left');
    const relayed = once(pSock, 'call-ended', 800);
    dSock.emit('call-ended', { sessionId: sid, endedBy: 'doctor', userName: 'Doc' });
    expect(await patientSeesLeave).toMatchObject({ role: 'doctor' });
    expect(await relayed).toBeNull();
    const after = await Session.findById(sid);
    expect(after.status).toBe('scheduled');

    pSock.close();
    dSock.close();
  });
});

describe('only a live session, inside its window, can be joined', () => {
  test('a cancelled session cannot be opened from its URL', async () => {
    const { patient, session } = await seed({ hoursFromNow: -0.25 });
    await Session.updateOne({ _id: session._id }, { $set: { status: 'cancelled', cancelledBy: 'patient' } });

    const sock = await connect(tokenFor(patient));
    const err = once(sock, 'error');
    const joined = once(sock, 'room-joined', 1500);
    sock.emit('join-room', { sessionId: String(session._id) });
    expect((await err).message).toMatch(/can no longer be joined/i);
    expect(await joined).toBeNull();
    sock.close();
  });

  test('a session next week cannot be joined yet', async () => {
    const { patient, session } = await seed({ hoursFromNow: 24 * 7 });
    const sock = await connect(tokenFor(patient));
    const err = once(sock, 'error');
    sock.emit('join-room', { sessionId: String(session._id) });
    expect((await err).message).toMatch(/15 minutes before/i);
    sock.close();
  });

  test('leaving a short call pauses it without touching what happened to the session meanwhile', async () => {
    // The disconnect handler used to write status 'scheduled' for any call
    // shorter than its booking, from a document read before an await — which
    // revived a session the sweep had just marked no-show.
    const { patient, doctor, session } = await seed({ hoursFromNow: -0.25 });
    const sid = String(session._id);
    const { pSock, dSock } = await joinBoth(patient, doctor, sid);

    await Session.updateOne({ _id: session._id }, { $set: { status: 'no-show' } });
    pSock.close();
    dSock.close();
    await new Promise((r) => setTimeout(r, 800));

    const after = await Session.findById(sid);
    expect(after.status).toBe('no-show');
  });
});
