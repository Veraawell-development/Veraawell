/**
 * Chat, as Phase 4 made it: every send acknowledged (or refused with a
 * reason), stored once however often it is retried, rate-limited, paged by
 * cursor, read only on purpose, one conversation per pair, only between
 * people allowed to talk (paid session in the last 30 days, both accounts
 * active), and a deleted account's thread kept for the other person.
 * Real Socket.IO clients on the /chat namespace, plus the REST routes.
 */

require('../support/env');

const http = require('http');
const request = require('supertest');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const { startDb, stopDb, clearDb, mountRoutes, tokenFor, makeUser, makeSession } = require('../helpers/harness');

jest.setTimeout(60000);
jest.mock('../../services/email.service', () => new Proxy({}, { get: () => jest.fn().mockResolvedValue({ id: 'sink' }) }));

let app, httpServer, io, port, Conversation, Message, User;
const sockets = [];

beforeAll(async () => {
  await startDb('chat.v2');
  Conversation = require('../../models/conversation');
  Message = require('../../models/message');
  User = require('../../models/user');
  await Promise.all([Conversation.syncIndexes(), Message.syncIndexes()]);
  app = mountRoutes({ '/api/chat': '../../routes/chat' });
  httpServer = http.createServer();
  io = new Server(httpServer, { cors: { origin: '*' } });
  require('../../socket').initializeSockets(io);
  app.set('io', io);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await stopDb();
});

afterEach(async () => {
  while (sockets.length) { try { sockets.pop().close(); } catch (_) { /* closed */ } }
  require('../../services/cache.service').flush();
  await clearDb();
});

function connect(user) {
  return new Promise((resolve, reject) => {
    const s = ioClient(`http://localhost:${port}/chat`, { auth: { token: tokenFor(user) }, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(new Error(e.message)));
  });
}
const ask = (s, ev, p) => s.timeout(6000).emitWithAck(ev, p);
const api = (method, path, user, body) => {
  const r = request(app)[method](path).set('Authorization', `Bearer ${tokenFor(user)}`);
  return body ? r.send(body) : r;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A patient and doctor with a paid session coming up, and their conversation. */
async function pair({ hoursFromNow = 24, session = {} } = {}) {
  const patient = await makeUser('patient');
  const doctor = await makeUser('doctor');
  if (session !== null) await makeSession({ patient, doctor, hoursFromNow, ...session });
  const conv = await Conversation.findOrCreateConversation(patient._id, doctor._id);
  return { patient, doctor, conv, id: String(conv._id) };
}

describe('sending', () => {
  test('acknowledged with the stored message; the other person gets it once, unread', async () => {
    const { patient, doctor, id } = await pair();
    const p = await connect(patient);
    const d = await connect(doctor);
    await ask(d, 'conversation:join', { conversationId: id });
    const got = new Promise((resolve) => d.on('message:receive', resolve));
    const ack = await ask(p, 'message:send', { conversationId: id, text: '  Hello doctor  ', clientMsgId: 'c-1' });
    expect(ack).toMatchObject({ ok: true, duplicate: false, message: { text: 'Hello doctor', clientMsgId: 'c-1', conversationId: id, isSentByMe: true } });
    expect(new Date(ack.message.createdAt).getTime()).toBeGreaterThan(0);
    expect(await got).toMatchObject({ text: 'Hello doctor', isSentByMe: false, conversationId: id });
    expect((await api('get', '/api/chat/unread-count', doctor)).body.unreadCount).toBe(1);
  });

  test('a retry with the same clientMsgId is stored once (socket, then HTTP fallback, then both at once)', async () => {
    const { patient, id } = await pair();
    const p = await connect(patient);
    const first = await ask(p, 'message:send', { conversationId: id, text: 'once', clientMsgId: 'dup-1' });
    const second = await ask(p, 'message:send', { conversationId: id, text: 'once', clientMsgId: 'dup-1' });
    expect(second).toMatchObject({ ok: true, duplicate: true });
    expect(String(second.message._id)).toBe(String(first.message._id));
    const viaHttp = await api('post', '/api/chat/message', patient, { conversationId: id, text: 'once', clientMsgId: 'dup-1' });
    expect(viaHttp.body).toMatchObject({ success: true, duplicate: true });
    await Promise.all([
      ask(p, 'message:send', { conversationId: id, text: 'race', clientMsgId: 'race-1' }),
      api('post', '/api/chat/message', patient, { conversationId: id, text: 'race', clientMsgId: 'race-1' })
    ]);
    expect(await Message.countDocuments({ conversationId: id })).toBe(2);
  });

  test('refusals come back with a code and a reason, and store nothing', async () => {
    const { patient, id } = await pair();
    const p = await connect(patient);
    expect(await ask(p, 'message:send', { conversationId: id, text: 'x'.repeat(5001) })).toMatchObject({ ok: false, code: 'MESSAGE_TOO_LONG' });
    expect(await ask(p, 'message:send', { conversationId: id, text: '   ' })).toMatchObject({ ok: false, code: 'INVALID_MESSAGE' });
    expect(await ask(p, 'message:send', { conversationId: id, text: 12 })).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    expect(await ask(p, 'message:send', { conversationId: 'nope', text: 'hi' })).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    expect(await Message.countDocuments({ conversationId: id })).toBe(0);
  });

  test('a stranger cannot send into someone else\'s conversation', async () => {
    const { id } = await pair();
    const stranger = await connect(await makeUser('patient'));
    expect(await ask(stranger, 'message:send', { conversationId: id, text: 'hi' })).toMatchObject({ ok: false, code: 'AUTHZ_NOT_PARTICIPANT' });
  });

  test('flooding is refused, then the socket is cut off', async () => {
    const { patient, id } = await pair();
    const p = await connect(patient);
    const results = await Promise.all(Array.from({ length: 14 }, (_, i) => ask(p, 'message:send', { conversationId: id, text: `m${i}`, clientMsgId: `f${i}` }).catch(() => ({ ok: false, code: 'TIMEOUT' }))));
    expect(results.filter((r) => r.ok).length).toBeLessThanOrEqual(9);
    expect(results.some((r) => r.code === 'RATE_LIMITED')).toBe(true);
    const gone = new Promise((resolve) => p.on('disconnect', resolve));
    for (let i = 0; i < 40; i++) p.emit('message:send', { conversationId: id, text: 'spam', clientMsgId: `s${i}` });
    await expect(Promise.race([gone, sleep(5000).then(() => 'still connected')])).resolves.not.toBe('still connected');
  });
});

describe('who may talk', () => {
  test('no paid session between them: refused (CHAT_NOT_OPEN), and the conversation says so', async () => {
    const { patient, id } = await pair({ session: null });
    const p = await connect(patient);
    expect(await ask(p, 'message:send', { conversationId: id, text: 'hi' })).toMatchObject({ ok: false, code: 'CHAT_NOT_OPEN' });
    const list = (await api('get', '/api/chat/conversations', patient)).body;
    expect(list[0]).toMatchObject({ canMessage: false, closedReason: 'not-booked' });
  });

  test('the last session ended more than 30 days ago: read-only (CHAT_CLOSED); a new booking reopens it', async () => {
    const { patient, doctor, id } = await pair({ hoursFromNow: -24 * 40, session: { status: 'completed' } });
    const p = await connect(patient);
    expect(await ask(p, 'message:send', { conversationId: id, text: 'hi' })).toMatchObject({ ok: false, code: 'CHAT_CLOSED' });
    expect((await api('get', '/api/chat/conversations', patient)).body[0]).toMatchObject({ canMessage: false, closedReason: 'closed' });
    // History still readable.
    expect((await api('get', `/api/chat/messages/${id}`, patient)).status).toBe(200);
    await makeSession({ patient, doctor, hoursFromNow: 48 });
    expect(await ask(p, 'message:send', { conversationId: id, text: 'hi again', clientMsgId: 'r1' })).toMatchObject({ ok: true });
  });

  test('a refunded session keeps chat open for 30 days after it, not forever', async () => {
    const recent = await pair({ hoursFromNow: -24 * 5, session: { status: 'cancelled', paymentStatus: 'refunded' } });
    const old = await pair({ hoursFromNow: -24 * 31, session: { status: 'cancelled', paymentStatus: 'refunded' } });
    expect(await ask(await connect(recent.patient), 'message:send', { conversationId: recent.id, text: 'hi', clientMsgId: 'a' })).toMatchObject({ ok: true });
    expect(await ask(await connect(old.patient), 'message:send', { conversationId: old.id, text: 'hi', clientMsgId: 'b' })).toMatchObject({ ok: false, code: 'CHAT_CLOSED' });
  });

  test('a suspended sender with an open socket can no longer send; nobody can message a suspended or rejected doctor', async () => {
    const { patient, doctor, id } = await pair();
    const p = await connect(patient);
    await User.updateOne({ _id: patient._id }, { $set: { status: 'suspended' } });
    expect(await ask(p, 'message:send', { conversationId: id, text: 'hi' })).toMatchObject({ ok: false, code: 'ACCESS_DENIED' });
    await User.updateOne({ _id: patient._id }, { $set: { status: 'active' } });
    await User.updateOne({ _id: doctor._id }, { $set: { approvalStatus: 'rejected' } });
    expect(await ask(p, 'message:send', { conversationId: id, text: 'hi' })).toMatchObject({ ok: false, code: 'RECIPIENT_UNAVAILABLE' });
    expect((await api('get', '/api/chat/conversations', patient)).body[0]).toMatchObject({ canMessage: false, closedReason: 'unavailable' });
  });
});

describe('one conversation per pair', () => {
  test('many "find or create" calls at once make exactly one conversation', async () => {
    const patient = await makeUser('patient');
    const doctor = await makeUser('doctor');
    await makeSession({ patient, doctor });
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2
      ? Conversation.findOrCreateConversation(patient._id, doctor._id)
      : Conversation.findOrCreateConversation(doctor._id, patient._id))));
    expect(new Set(results.map((c) => String(c._id))).size).toBe(1);
    expect(await Conversation.countDocuments({})).toBe(1);
  });

  test('a conversation from before pair keys is adopted, not duplicated', async () => {
    const patient = await makeUser('patient');
    const doctor = await makeUser('doctor');
    const legacy = await Conversation.collection.insertOne({
      participants: [{ userId: patient._id, role: 'patient' }, { userId: doctor._id, role: 'doctor' }], createdAt: new Date(), updatedAt: new Date()
    });
    const found = await Conversation.findOrCreateConversation(patient._id, doctor._id);
    expect(String(found._id)).toBe(String(legacy.insertedId));
    expect((await Conversation.findById(legacy.insertedId).lean()).pairKey).toBe(Conversation.pairKeyOf(patient._id, doctor._id));
    expect(await Conversation.countDocuments({})).toBe(1);
  });
});

describe('the list and the thread', () => {
  test('ordered by the latest message — reading a thread does not reorder anyone\'s list', async () => {
    const doctor = await makeUser('doctor');
    const a = await makeUser('patient');
    const b = await makeUser('patient');
    await makeSession({ patient: a, doctor });
    await makeSession({ patient: b, doctor });
    const ca = await Conversation.findOrCreateConversation(a._id, doctor._id);
    const cb = await Conversation.findOrCreateConversation(b._id, doctor._id);
    await api('post', '/api/chat/message', a, { conversationId: String(ca._id), text: 'from a' });
    await sleep(20);
    await api('post', '/api/chat/message', b, { conversationId: String(cb._id), text: 'from b' });
    const order = async () => (await api('get', '/api/chat/conversations', doctor)).body.map((c) => c.lastMessage);
    expect(await order()).toEqual(['from b', 'from a']);
    await api('put', `/api/chat/conversation/${ca._id}/read`, doctor); // reading a's thread
    await api('get', `/api/chat/messages/${ca._id}`, doctor);
    expect(await order()).toEqual(['from b', 'from a']);
    const first = (await api('get', '/api/chat/conversations', doctor)).body[0];
    expect(first).toMatchObject({ unreadCount: 1, canMessage: true });
    expect(new Date(first.lastMessageAt).getTime()).toBeGreaterThan(0);
  });

  test('cursor paging: the latest page, older pages with ?before, catching up with ?after — no gaps, no repeats', async () => {
    const { patient, id } = await pair();
    const base = Date.now() - 1000 * 60;
    const docs = Array.from({ length: 120 }, (_, i) => ({
      conversationId: id, senderId: patient._id, receiverId: patient._id, text: `m${i}`, createdAt: new Date(base + Math.floor(i / 2) * 1000)
    }));
    await Message.insertMany(docs);
    const page1 = await api('get', `/api/chat/messages/${id}?limit=50`, patient);
    expect(page1.headers['x-has-more']).toBe('1');
    expect(page1.body.map((m) => m.text)[49]).toBe('m119');
    const page2 = await api('get', `/api/chat/messages/${id}?limit=50&before=${page1.body[0]._id}`, patient);
    const page3 = await api('get', `/api/chat/messages/${id}?limit=50&before=${page2.body[0]._id}`, patient);
    expect(page3.headers['x-has-more']).toBe('0');
    const all = [...page3.body, ...page2.body, ...page1.body].map((m) => m.text);
    expect(all).toHaveLength(120);
    expect(new Set(all).size).toBe(120);
    expect(all[0]).toBe('m0');
    const after = await api('get', `/api/chat/messages/${id}?after=${page2.body[49]._id}`, patient);
    expect(after.body.map((m) => m.text)).toEqual(page1.body.map((m) => m.text));
    expect((await api('get', `/api/chat/messages/${id}?before=000000000000000000000000`, patient)).status).toBe(400);
  });

  test('marking read tells the reader\'s other tabs and dashboards', async () => {
    const { patient, doctor, id } = await pair();
    await api('post', '/api/chat/message', patient, { conversationId: id, text: 'hi' });
    const otherTab = await connect(doctor);
    const told = new Promise((resolve) => otherTab.on('conversation:read', resolve));
    const res = await api('put', `/api/chat/conversation/${id}/read`, doctor);
    expect(res.body).toMatchObject({ marked: 1 });
    expect(await told).toEqual({ conversationId: id });
    expect((await api('put', `/api/chat/conversation/${id}/read`, doctor)).body).toMatchObject({ marked: 0 });
  });
});

describe('deleting an account', () => {
  test('the other person keeps the thread, from a "Deleted user" who can no longer be messaged', async () => {
    const { patient, doctor, id } = await pair({ session: { paymentId: null, paymentStatus: 'not_required' } });
    await api('post', '/api/chat/message', patient, { conversationId: id, text: 'thank you' });
    await require('../../models/session').deleteMany({ patientId: patient._id });
    await require('../../services/auth.service').deleteAccount(patient._id);
    expect(await Message.countDocuments({ conversationId: id })).toBe(1);
    const thread = (await api('get', `/api/chat/messages/${id}`, doctor)).body;
    expect(thread[0]).toMatchObject({ text: 'thank you', senderName: 'Deleted user' });
    const list = (await api('get', '/api/chat/conversations', doctor)).body;
    expect(list[0]).toMatchObject({ userName: 'Deleted user', canMessage: false });
  });
});

describe('the pair-key migration (migrations/conversationPairKeys.js)', () => {
  test('dry run changes nothing; apply keys every pair and merges duplicates into the oldest, keeping every message', async () => {
    const { conversationPairKeys } = require('../../migrations/conversationPairKeys');
    const db = require('mongoose').connection.db;
    const patient = await makeUser('patient');
    const doctor = await makeUser('doctor');
    const parts = [{ userId: patient._id, role: 'patient' }, { userId: doctor._id, role: 'doctor' }];
    const old = await db.collection('conversations').insertOne({ participants: parts, createdAt: new Date(Date.now() - 2000) });
    const dup = await db.collection('conversations').insertOne({ participants: [...parts].reverse(), createdAt: new Date() });
    await db.collection('messages').insertMany([
      { conversationId: old.insertedId, senderId: patient._id, receiverId: doctor._id, text: 'a', createdAt: new Date(Date.now() - 1000) },
      { conversationId: dup.insertedId, senderId: doctor._id, receiverId: patient._id, text: 'b', createdAt: new Date() }
    ]);

    const dry = await conversationPairKeys(db);
    expect(dry).toMatchObject({ pairs: 1, keyed: 1, merged: 1, removed: 1, movedMessages: 1 });
    expect(await db.collection('conversations').countDocuments()).toBe(2);

    const done = await conversationPairKeys(db, { apply: true });
    expect(done).toMatchObject({ merged: 1, removed: 1, movedMessages: 1 });
    const convs = await db.collection('conversations').find().toArray();
    expect(convs).toHaveLength(1);
    expect(String(convs[0]._id)).toBe(String(old.insertedId));
    expect(convs[0].pairKey).toBe(Conversation.pairKeyOf(patient._id, doctor._id));
    expect(convs[0].lastMessage.text).toBe('b');
    expect(await db.collection('messages').countDocuments({ conversationId: old.insertedId })).toBe(2);
    expect(await conversationPairKeys(db, { apply: true })).toMatchObject({ keyed: 0, merged: 0 });
  });
});
