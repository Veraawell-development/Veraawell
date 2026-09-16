/**
 * The realtime layer across all three namespaces.
 *
 * authz.socket.test.js covers denials on a handful of video events. This
 * completes the matrix: the /chat namespace (four guarded events, none
 * previously tested), the /data fan-out that every dashboard depends on, the
 * handshake's 30-second actor cache, and the full WebRTC signalling sequence.
 *
 * The denial-message rule matters more than it looks: the client bails out of
 * reconnecting permanently when a message matches /Authentication|No token/
 * (useDataSocket.ts:66-70), so an authorization denial that borrows that
 * wording takes the user's realtime updates down until they reload.
 */

require('../support/env');

const http = require('http');
const mongoose = require('mongoose');
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


let httpServer, io, port, f;
let Session, User, Conversation, Message;
let getJWTSecret;

const sockets = [];

beforeAll(async () => {
  await connectDb('socket.matrix');

  Session = require('../../models/session');
  User = require('../../models/user');
  Conversation = require('../../models/conversation');
  Message = require('../../models/message');
  ({ getJWTSecret } = require('../../config/auth'));

  f = await require('../support/seed').seedAll();

  httpServer = http.createServer();
  io = new Server(httpServer, { cors: { origin: '*' } });
  require('../../socket').initializeSockets(io);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
}, 180000);

afterAll(async () => {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await disconnectDb();
});

afterEach(() => {
  while (sockets.length) {
    const s = sockets.pop();
    try { s.close(); } catch (_) { /* already closed */ }
  }
  require('../../services/cache.service').flush();
});

const tokenFor = (u) => jwt.sign(
  { userId: String(u._id), role: u.role, username: u.username },
  getJWTSecret(), { expiresIn: '1h' }
);

function connect(token, namespace = '') {
  return new Promise((resolve, reject) => {
    const s = ioClient(`http://localhost:${port}${namespace}`, {
      auth: token ? { token } : {}, transports: ['websocket'], reconnection: false
    });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(new Error(`connect_error: ${e.message}`)));
    setTimeout(() => reject(new Error('connect timeout')), 10000);
  });
}

/** Wait for the first of several events, or time out. */
function waitFor(socket, events, ms = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${events.join('|')}`)), ms);
    for (const ev of events) {
      socket.once(ev, (payload) => { clearTimeout(timer); resolve({ event: ev, payload }); });
    }
  });
}

async function paidSession(over = {}) {
  return Session.create({
    patientId: f.patientA._id, doctorId: f.doctorA._id,
    startsAt: new Date(Date.now() + 5 * 60 * 1000),
    duration: 60, price: 1500,
    status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_sock_01',
    ...over
  });
}

describe('the handshake', () => {
  test('a valid user token connects on all three namespaces', async () => {
    const t = tokenFor(f.patientA);
    for (const ns of ['', '/chat', '/data']) {
      const s = await connect(t, ns);
      expect(s.connected).toBe(true);
    }
  });

  test('no token is refused', async () => {
    await expect(connect(null)).rejects.toThrow(/connect_error/);
  });

  test('a malformed token is refused', async () => {
    await expect(connect('not.a.jwt')).rejects.toThrow(/connect_error/);
  });

  test('a token signed with the ADMIN realm secret cannot open a socket', async () => {
    // authMiddleware verifies with getJWTSecret() only — the admin realm has no
    // socket surface at all.
    const { getAdminJWTSecret } = require('../../config/auth');
    const adminTok = jwt.sign(
      { userId: String(f.superAdmin._id), role: 'super_admin' },
      getAdminJWTSecret(), { expiresIn: '1h' }
    );
    await expect(connect(adminTok)).rejects.toThrow(/connect_error/);
  });

  test('a token for a deleted user is refused', async () => {
    const ghost = await User.create({
      firstName: 'Ghost', lastName: 'User',
      email: `ghost.${Date.now()}@test.local`, username: `ghost.${Date.now()}`,
      password: 'password123', role: 'patient', approvalStatus: 'approved'
    });
    const t = tokenFor(ghost);
    await User.deleteOne({ _id: ghost._id });
    require('../../services/cache.service').flush();

    await expect(connect(t)).rejects.toThrow(/connect_error/);
  });

  test('a suspended account cannot complete the handshake', async () => {
    const susp = await User.create({
      firstName: 'Susp', lastName: 'User',
      email: `susp.${Date.now()}@test.local`, username: `susp.${Date.now()}`,
      password: 'password123', role: 'patient', approvalStatus: 'approved', status: 'suspended'
    });
    await expect(connect(tokenFor(susp))).rejects.toThrow(/connect_error/);
    await User.deleteOne({ _id: susp._id });
  });
});

describe('the /chat namespace', () => {
  async function conversationBetween(a, b) {
    return Conversation.findOrCreateConversation(a._id, b._id);
  }

  test('a participant may join a conversation room', async () => {
    const conv = await conversationBetween(f.patientA, f.doctorA);
    const s = await connect(tokenFor(f.patientA), '/chat');

    let denial = null;
    s.on('authz:denied', (p) => { denial = p; });
    s.on('error', (p) => { denial = p; });

    s.emit('conversation:join', String(conv._id));
    await new Promise((r) => { setTimeout(r, 1200); });

    // What matters is the absence of a denial for a genuine participant.
    expect(denial).toBeNull();
    expect(s.connected).toBe(true);
  });

  test('a non-participant is denied, with a code and without auth wording', async () => {
    const conv = await conversationBetween(f.patientA, f.doctorA);
    const s = await connect(tokenFor(f.patientB), '/chat');

    s.emit('conversation:join', String(conv._id));
    const { payload } = await waitFor(s, ['authz:denied', 'error']);

    expect(payload.code).toBeTruthy();
    // The client permanently stops reconnecting on this wording.
    expect(String(payload.message || '')).not.toMatch(/Authentication|No token/i);
  });

  test('a message from a participant reaches the other party', async () => {
    const conv = await conversationBetween(f.patientA, f.doctorA);
    const patient = await connect(tokenFor(f.patientA), '/chat');
    const doctor = await connect(tokenFor(f.doctorA), '/chat');

    doctor.emit('conversation:join', String(conv._id));
    patient.emit('conversation:join', String(conv._id));
    await new Promise((r) => { setTimeout(r, 400); });

    const received = waitFor(doctor, ['message:receive']);
    patient.emit('message:send', { conversationId: String(conv._id), text: 'Hello from the patient' });

    const { payload } = await received;
    expect(payload.text).toBe('Hello from the patient');
    expect(await Message.countDocuments({ conversationId: conv._id })).toBe(1);
  });

  test('a non-participant cannot post into the conversation', async () => {
    const conv = await conversationBetween(f.patientA, f.doctorA);
    const intruder = await connect(tokenFor(f.patientB), '/chat');

    intruder.emit('message:send', { conversationId: String(conv._id), text: 'intrusion' });
    const { payload } = await waitFor(intruder, ['authz:denied', 'error']);

    expect(payload.code).toBeTruthy();
    await new Promise((r) => { setTimeout(r, 300); });
    expect(await Message.countDocuments({ text: 'intrusion' })).toBe(0);
  });

  test('typing indicators are guarded by the same participation rule', async () => {
    const conv = await conversationBetween(f.patientA, f.doctorA);
    const intruder = await connect(tokenFor(f.patientB), '/chat');

    intruder.emit('typing:start', { conversationId: String(conv._id) });
    const { payload } = await waitFor(intruder, ['authz:denied', 'error']);
    expect(payload.code).toBeTruthy();
  });
});

/**
 * Who receives which copy of a sent message.
 *
 * The existing test above only checks that the *other* party gets the message.
 * That left the sender's own view untested, which is where the duplicate-message
 * bug lived: chat.service.js broadcast the receiver's copy with
 * `chatNamespace.to('conversation:' + id)`, and that room includes the sender —
 * who had joined it via conversation:join. So every message a user sent came
 * back to them flagged `isSentByMe: false` and rendered as if the other person
 * had sent it, on top of the correct `isSentByMe: true` echo.
 */
describe('the /chat namespace: message fan-out', () => {
  async function conversationBetween(a, b) {
    const Conv = require('../../models/conversation');
    return Conv.create({
      participants: [
        { userId: a._id, role: a.role },
        { userId: b._id, role: b.role }
      ]
    });
  }

  /** Collect every occurrence of an event over a fixed window. */
  function collect(socket, event, ms = 1200) {
    const seen = [];
    socket.on(event, (payload) => seen.push(payload));
    return new Promise((resolve) => setTimeout(() => resolve(seen), ms));
  }

  test('the sender receives exactly one copy of their own message, flagged as theirs', async () => {
    const conv = await conversationBetween(f.patientA, f.doctorA);
    const patient = await connect(tokenFor(f.patientA), '/chat');
    const doctor = await connect(tokenFor(f.doctorA), '/chat');

    doctor.emit('conversation:join', String(conv._id));
    patient.emit('conversation:join', String(conv._id));
    await new Promise((r) => { setTimeout(r, 400); });

    const senderSaw = collect(patient, 'message:receive');
    patient.emit('message:send', { conversationId: String(conv._id), text: 'only once please' });

    const copies = await senderSaw;
    expect(copies).toHaveLength(1);
    expect(copies[0].isSentByMe).toBe(true);
    expect(copies[0].text).toBe('only once please');
  });

  test('the receiver gets one copy, flagged as not theirs', async () => {
    const conv = await conversationBetween(f.patientA, f.doctorA);
    const patient = await connect(tokenFor(f.patientA), '/chat');
    const doctor = await connect(tokenFor(f.doctorA), '/chat');

    doctor.emit('conversation:join', String(conv._id));
    patient.emit('conversation:join', String(conv._id));
    await new Promise((r) => { setTimeout(r, 400); });

    const receiverSaw = collect(doctor, 'message:receive');
    patient.emit('message:send', { conversationId: String(conv._id), text: 'for the doctor' });

    const copies = await receiverSaw;
    expect(copies).toHaveLength(1);
    expect(copies[0].isSentByMe).toBe(false);
    expect(copies[0].text).toBe('for the doctor');
  });

  test('every copy carries the conversationId it belongs to', async () => {
    // The client writes an incoming message straight into the open thread's
    // cache. Without a conversationId it cannot tell whether the message even
    // belongs to the thread on screen.
    const conv = await conversationBetween(f.patientA, f.doctorA);
    const patient = await connect(tokenFor(f.patientA), '/chat');
    const doctor = await connect(tokenFor(f.doctorA), '/chat');

    doctor.emit('conversation:join', String(conv._id));
    patient.emit('conversation:join', String(conv._id));
    await new Promise((r) => { setTimeout(r, 400); });

    const senderSaw = collect(patient, 'message:receive');
    const receiverSaw = collect(doctor, 'message:receive');
    patient.emit('message:send', { conversationId: String(conv._id), text: 'routeable' });

    const [mine, theirs] = await Promise.all([senderSaw, receiverSaw]);
    expect(String(mine[0].conversationId)).toBe(String(conv._id));
    expect(String(theirs[0].conversationId)).toBe(String(conv._id));
  });

  test("the sender's second tab also sees the message as the sender's own", async () => {
    // The fix has to exclude the sender by user, not by socket: excluding only
    // the emitting socket would leave the sender's other tabs rendering their
    // own message as incoming.
    const conv = await conversationBetween(f.patientA, f.doctorA);
    const tabOne = await connect(tokenFor(f.patientA), '/chat');
    const tabTwo = await connect(tokenFor(f.patientA), '/chat');
    const doctor = await connect(tokenFor(f.doctorA), '/chat');

    doctor.emit('conversation:join', String(conv._id));
    tabOne.emit('conversation:join', String(conv._id));
    tabTwo.emit('conversation:join', String(conv._id));
    await new Promise((r) => { setTimeout(r, 400); });

    const tabTwoSaw = collect(tabTwo, 'message:receive');
    tabOne.emit('message:send', { conversationId: String(conv._id), text: 'from tab one' });

    const copies = await tabTwoSaw;
    expect(copies).toHaveLength(1);
    expect(copies[0].isSentByMe).toBe(true);
  });

  test('the message is persisted exactly once, however many copies were emitted', async () => {
    const conv = await conversationBetween(f.patientA, f.doctorA);
    const patient = await connect(tokenFor(f.patientA), '/chat');
    patient.emit('conversation:join', String(conv._id));
    await new Promise((r) => { setTimeout(r, 300); });

    patient.emit('message:send', { conversationId: String(conv._id), text: 'stored once' });
    await new Promise((r) => { setTimeout(r, 800); });

    expect(await Message.countDocuments({ conversationId: conv._id, text: 'stored once' })).toBe(1);
  });
});

describe('the /data fan-out namespace', () => {
  test('it answers ping with pong', async () => {
    const s = await connect(tokenFor(f.patientA), '/data');
    const got = waitFor(s, ['pong']);
    s.emit('ping');
    await expect(got).resolves.toBeDefined();
  });

  test('emitToUser reaches only the addressed user', async () => {
    const SocketEmitter = require('../../utils/socketEmitter');
    const emitter = new SocketEmitter(io);
    const mine = await connect(tokenFor(f.patientA), '/data');
    const theirs = await connect(tokenFor(f.patientB), '/data');
    await new Promise((r) => { setTimeout(r, 300); });

    let leaked = false;
    theirs.on('session:booked', () => { leaked = true; });

    const got = waitFor(mine, ['session:booked']);
    emitter.emitToUser(String(f.patientA._id), 'session:booked', { sessionId: 'abc' });

    const { payload } = await got;
    expect(payload.sessionId).toBe('abc');
    await new Promise((r) => { setTimeout(r, 400); });
    expect(leaked).toBe(false);
  });

  test('emitToRole reaches every user holding that role and no one else', async () => {
    const SocketEmitter = require('../../utils/socketEmitter');
    const emitter = new SocketEmitter(io);
    const patient = await connect(tokenFor(f.patientA), '/data');
    const doctor = await connect(tokenFor(f.doctorA), '/data');
    await new Promise((r) => { setTimeout(r, 300); });

    let doctorGot = false;
    doctor.on('doctor:status-change', () => { doctorGot = true; });

    const got = waitFor(patient, ['doctor:status-change']);
    emitter.emitToRole('patient', 'doctor:status-change', { doctorId: String(f.doctorA._id), isOnline: true });

    await expect(got).resolves.toBeDefined();
    await new Promise((r) => { setTimeout(r, 400); });
    expect(doctorGot).toBe(false);
  });

  test('hasListener tells a delivered ring apart from one shouted into an empty room', async () => {
    // emitToUser is fire-and-forget, so an event sent to a doctor with no page
    // open vanished indistinguishably from one that arrived — and the doctor
    // then took a cancellation strike for an instant request they were never
    // shown. This is the check that makes those two cases separable.
    const SocketEmitter = require('../../utils/socketEmitter');
    const emitter = new SocketEmitter(io);
    const id = String(f.doctorA._id);

    // A socket's departure is asynchronous and afterEach closes without
    // awaiting, so both directions are polled rather than sampled once. A
    // bare assertion here reads the leftovers of whichever test ran last.
    const settles = async (want, ms = 3000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && emitter.hasListener(id) !== want) {
        await new Promise((r) => { setTimeout(r, 50); });
      }
      return emitter.hasListener(id);
    };

    expect(await settles(false)).toBe(false);

    const doctor = await connect(tokenFor(f.doctorA), '/data');
    expect(await settles(true)).toBe(true);

    // Someone else's connection is not this user's.
    expect(emitter.hasListener(String(f.doctorB._id))).toBe(false);

    doctor.close();
    expect(await settles(false)).toBe(false);
  });

  test('hasListener is false rather than throwing on a missing id', async () => {
    const SocketEmitter = require('../../utils/socketEmitter');
    expect(new SocketEmitter(io).hasListener(undefined)).toBe(false);
  });

  test('emitToAll reaches every connected client on the namespace', async () => {
    const SocketEmitter = require('../../utils/socketEmitter');
    const emitter = new SocketEmitter(io);
    const a = await connect(tokenFor(f.patientA), '/data');
    const b = await connect(tokenFor(f.doctorA), '/data');
    await new Promise((r) => { setTimeout(r, 300); });

    const both = Promise.all([waitFor(a, ['article:new']), waitFor(b, ['article:new'])]);
    emitter.emitToAll('article:new', { slug: 'a-new-article' });
    await expect(both).resolves.toHaveLength(2);
  });
});

describe('the video namespace: full signalling sequence', () => {
  test('both parties join, exchange offer/answer/ICE, and the doctor ends the call', async () => {
    const session = await paidSession({ paymentId: 'pay_sock_seq' });
    const id = String(session._id);

    const patient = await connect(tokenFor(f.patientA));
    const doctor = await connect(tokenFor(f.doctorA));

    const patientJoined = waitFor(patient, ['room-joined']);
    patient.emit('join-room', { sessionId: id });
    await patientJoined;

    const patientSeesPeer = waitFor(patient, ['user-joined']);
    const doctorJoined = waitFor(doctor, ['room-joined']);
    doctor.emit('join-room', { sessionId: id });
    await Promise.all([doctorJoined, patientSeesPeer]);

    // Offer -> answer -> ICE, each relayed to the other party only.
    const doctorGetsOffer = waitFor(doctor, ['offer']);
    patient.emit('offer', { sessionId: id, offer: { type: 'offer', sdp: 'v=0 fake' } });
    const offer = await doctorGetsOffer;
    expect(offer.payload.offer.sdp).toContain('v=0');

    const patientGetsAnswer = waitFor(patient, ['answer']);
    doctor.emit('answer', { sessionId: id, answer: { type: 'answer', sdp: 'v=0 reply' } });
    await expect(patientGetsAnswer).resolves.toBeDefined();

    const doctorGetsIce = waitFor(doctor, ['ice-candidate']);
    patient.emit('ice-candidate', { sessionId: id, candidate: { candidate: 'candidate:1 udp' } });
    await expect(doctorGetsIce).resolves.toBeDefined();

    const ended = waitFor(patient, ['call-ended'], 8000);
    doctor.emit('call-ended', { sessionId: id });
    await ended;

    // The relay to the peer and the status write are independent; poll rather
    // than assume an ordering the handler does not promise.
    let after;
    const deadline = Date.now() + 5000;
    do {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 100); });
      // eslint-disable-next-line no-await-in-loop
      after = await Session.findById(session._id);
    } while (after.status !== 'completed' && Date.now() < deadline);

    expect(after.status).toBe('completed');
    expect(after.callStatus).toBe('completed');
  });

  test('media-state changes relay between joined parties', async () => {
    const session = await paidSession({ paymentId: 'pay_sock_media' });
    const id = String(session._id);

    const patient = await connect(tokenFor(f.patientA));
    const doctor = await connect(tokenFor(f.doctorA));
    patient.emit('join-room', { sessionId: id });
    await waitFor(patient, ['room-joined']);
    doctor.emit('join-room', { sessionId: id });
    await waitFor(doctor, ['room-joined']);

    const got = waitFor(doctor, ['media-state-change']);
    patient.emit('media-state-change', { sessionId: id, video: false, audio: true });
    const { payload } = await got;
    expect(payload.video).toBe(false);
  });

  test('an unpaid session cannot be joined even by its own patient', async () => {
    const session = await paidSession({
      paymentId: null, paymentStatus: 'pending', status: 'payment_pending'
    });
    const patient = await connect(tokenFor(f.patientA));

    patient.emit('join-room', { sessionId: String(session._id) });
    const { payload } = await waitFor(patient, ['authz:denied', 'error']);
    expect(payload).toBeDefined();
  });

  test('a stranger cannot join, signal into, or end the room', async () => {
    const session = await paidSession({ paymentId: 'pay_sock_stranger' });
    const id = String(session._id);
    const stranger = await connect(tokenFor(f.patientB));

    for (const [event, body] of [
      ['join-room', { sessionId: id }],
      ['ice-candidate', { sessionId: id, candidate: {} }],
      ['call-ended', { sessionId: id }]
    ]) {
      stranger.emit(event, body);
      // eslint-disable-next-line no-await-in-loop
      const { payload } = await waitFor(stranger, ['authz:denied', 'error']);
      expect(payload.code).toBeTruthy();
      expect(String(payload.message || '')).not.toMatch(/Authentication|No token/i);
    }

    const after = await Session.findById(session._id);
    expect(after.status).toBe('scheduled');
  });

  test('a denial is never delivered as connect_error, so the client keeps its socket', async () => {
    const session = await paidSession({ paymentId: 'pay_sock_keepalive' });
    const stranger = await connect(tokenFor(f.patientB));

    stranger.emit('call-ended', { sessionId: String(session._id) });
    await waitFor(stranger, ['authz:denied', 'error']);

    expect(stranger.connected).toBe(true);
  });
});
