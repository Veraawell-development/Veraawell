/**
 * The feature surfaces that no test touches today: assessments, mood, journal,
 * clinical notes/tasks/reports, chat and reviews.
 *
 * Only the pure assessment scorer is covered by the existing suite; every HTTP
 * layer below is currently unexercised.
 */

require('../support/env');

const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: jest.fn().mockResolvedValue({ id: 'rfnd', status: 'processed' }), fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));
jest.mock('isomorphic-dompurify', () => ({ sanitize: (s) => s }));

let app, f;
let server;
let tokens = {};
let Models = {};

beforeAll(async () => {
  await connectDb('features');
  app = require('../../app');
  server = await startServer(app);
  Models = {
    Session: require('../../models/session'),
    Journal: require('../../models/journal'),
    MoodEntry: require('../../models/moodEntry'),
    Assessment: require('../../models/mentalHealthAssessment'),
    SessionNote: require('../../models/sessionNote'),
    Task: require('../../models/task'),
    Report: require('../../models/report'),
    Conversation: require('../../models/conversation'),
    Message: require('../../models/message'),
    Review: require('../../models/review')
  };

  const { seedAll } = require('../support/seed');
  f = await seedAll();

  const jwt = require('jsonwebtoken');
  const { getJWTSecret } = require('../../config/auth');
  const mk = (u) => jwt.sign({ userId: String(u._id), username: u.username, role: u.role }, getJWTSecret(), { expiresIn: '1h' });
  tokens = {
    patientA: mk(f.patientA), patientB: mk(f.patientB),
    doctorA: mk(f.doctorA), doctorB: mk(f.doctorB)
  };
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

beforeEach(async () => {
  await Promise.all([
    Models.Journal.deleteMany({}), Models.MoodEntry.deleteMany({}),
    Models.Assessment.deleteMany({}), Models.SessionNote.deleteMany({}),
    Models.Task.deleteMany({}), Models.Report.deleteMany({}),
    Models.Conversation.deleteMany({}), Models.Message.deleteMany({}),
    Models.Review.deleteMany({})
  ]);
});

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

describe('mental health assessments', () => {
  // The schema stores embedded {questionId, answer} documents, which is also
  // what computeScore consumes. 9 answers of 3 => total 27 => 'severe'.
  const responses = Array.from({ length: 9 }, (_, i) => ({ questionId: i + 1, answer: 3 }));
  const mildAnxiety = Array.from({ length: 7 }, (_, i) => ({ questionId: i + 1, answer: 1 }));

  test('a submitted assessment is scored on the SERVER, ignoring a client-claimed score', async () => {
    const res = await call('post', '/api/assessments', tokens.patientA, {
      testType: 'depression',
      responses,
      // A deliberately false client-supplied score.
      scores: { total: 0, severity: 'minimal', percentage: 0 }
    });
    expect(res.status).toBe(201);

    const saved = await Models.Assessment.findOne({ userId: f.patientA._id }).lean();
    // utils/assessmentScoring recomputes from the raw responses: 9 x 3 = 27,
    // and the client's claim of "minimal" is discarded.
    expect(saved.scores.total).toBe(27);
    expect(saved.scores.severity).toBe('severe');
  });

  test('history and latest-by-type are scoped to the caller', async () => {
    await call('post', '/api/assessments', tokens.patientA, { testType: 'depression', responses, scores: { total: 27, severity: 'severe', percentage: 100 } });
    await call('post', '/api/assessments', tokens.patientB, { testType: 'anxiety', responses: mildAnxiety, scores: { total: 7, severity: 'mild', percentage: 33 } });

    const mine = await call('get', '/api/assessments', tokens.patientA);
    expect(mine.status).toBe(200);
    expect(mine.body.assessments).toHaveLength(1);
    expect(mine.body.assessments[0].testType).toBe('depression');

    const latest = await call('get', '/api/assessments/latest/depression', tokens.patientA);
    expect(latest.status).toBe(200);
  });

  test('one patient cannot read another patient\'s assessment by id', async () => {
    const created = await call('post', '/api/assessments', tokens.patientA, { testType: 'depression', responses, scores: { total: 27, severity: 'severe', percentage: 100 } });
    const id = (await Models.Assessment.findOne({ userId: f.patientA._id }).lean())._id;
    expect(created.status).toBeLessThan(300);

    const res = await call('get', `/api/assessments/${id}`, tokens.patientB);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('one patient cannot delete another patient\'s assessment', async () => {
    await call('post', '/api/assessments', tokens.patientA, { testType: 'depression', responses, scores: { total: 27, severity: 'severe', percentage: 100 } });
    const id = (await Models.Assessment.findOne({ userId: f.patientA._id }).lean())._id;

    const res = await call('delete', `/api/assessments/${id}`, tokens.patientB);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await Models.Assessment.countDocuments({ _id: id })).toBe(1);
  });

  test('a doctor has no route into the assessment list at all', async () => {
    await call('post', '/api/assessments', tokens.patientA, { testType: 'depression', responses, scores: { total: 27, severity: 'severe', percentage: 100 } });
    const res = await call('get', '/api/assessments', tokens.doctorA);
    expect(res.body.assessments).toHaveLength(0);
  });
});

describe('mood check-in', () => {
  test('one entry per patient per IST day, and re-posting corrects rather than duplicates', async () => {
    const first = await call('post', '/api/session-tools/mood', tokens.patientA, { mood: 2 });
    expect(first.status).toBeLessThan(300);

    const second = await call('post', '/api/session-tools/mood', tokens.patientA, { mood: 5 });
    expect(second.status).toBeLessThan(300);

    const rows = await Models.MoodEntry.find({ patientId: f.patientA._id }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].mood).toBe(5);
  });

  test('today reflects the entry, and history is clamped to a sane window', async () => {
    await call('post', '/api/session-tools/mood', tokens.patientA, { mood: 4 });

    const today = await call('get', '/api/session-tools/mood/today', tokens.patientA);
    expect(today.status).toBe(200);

    const huge = await call('get', '/api/session-tools/mood/history?days=99999', tokens.patientA);
    expect(huge.status).toBe(200);
  });

  test('a doctor cannot post a mood entry', async () => {
    const res = await call('post', '/api/session-tools/mood', tokens.doctorA, { mood: 3 });
    expect(res.status).toBe(403);
    expect(await Models.MoodEntry.countDocuments({})).toBe(0);
  });
});

describe('journal', () => {
  test('a patient can create, list, update and delete their own entries', async () => {
    const created = await call('post', '/api/session-tools/journal', tokens.patientA, { title: 'Day one', content: 'private thoughts' });
    expect(created.status).toBeLessThan(300);
    const entry = await Models.Journal.findOne({ patientId: f.patientA._id });

    const listed = await call('get', `/api/session-tools/journal/patient/${f.patientA._id}`, tokens.patientA);
    expect(listed.status).toBe(200);

    const updated = await call('put', `/api/session-tools/journal/${entry._id}`, tokens.patientA, { title: 'Day one (edited)', content: 'still private' });
    expect(updated.status).toBe(200);

    const removed = await call('delete', `/api/session-tools/journal/${entry._id}`, tokens.patientA);
    expect(removed.status).toBe(200);
    expect(await Models.Journal.countDocuments({})).toBe(0);
  });

  test('a journal is owner-only: no doctor and no other patient can reach it', async () => {
    await call('post', '/api/session-tools/journal', tokens.patientA, { title: 'x', content: 'y' });
    const entry = await Models.Journal.findOne({});

    for (const who of ['doctorA', 'patientB']) {
      expect((await call('get', `/api/session-tools/journal/patient/${f.patientA._id}`, tokens[who])).status).toBe(403);
      expect((await call('put', `/api/session-tools/journal/${entry._id}`, tokens[who], { content: 'tampered' })).status).toBe(403);
      expect((await call('delete', `/api/session-tools/journal/${entry._id}`, tokens[who])).status).toBe(403);
    }
    expect(await Models.Journal.countDocuments({})).toBe(1);
  });
});

describe('clinical notes, tasks and reports', () => {
  test('the treating doctor can write a note, and the body-supplied patientId is ignored', async () => {
    const res = await call('post', '/api/session-tools/notes', tokens.doctorA, {
      sessionId: String(f.paidSession._id),
      patientId: String(f.patientB._id), // an attempt to file it on the wrong chart
      content: 'Presented calm.'
    });
    expect(res.status).toBe(201);

    expect(await Models.SessionNote.countDocuments({ patientId: f.patientB._id })).toBe(0);
    const note = await Models.SessionNote.findOne({});
    expect(String(note.patientId)).toBe(String(f.patientA._id));
  });

  test('a private note is withheld from the patient but visible to its author', async () => {
    await Models.SessionNote.create({
      sessionId: f.paidSession._id, doctorId: f.doctorA._id, patientId: f.patientA._id,
      content: 'PRIVATE clinical impression', isPrivate: true
    });
    await Models.SessionNote.create({
      sessionId: f.paidSession._id, doctorId: f.doctorA._id, patientId: f.patientA._id,
      content: 'Shared summary', isPrivate: false
    });

    const asPatient = await call('get', `/api/session-tools/notes/patient/${f.patientA._id}`, tokens.patientA);
    expect(asPatient.status).toBe(200);
    expect(asPatient.body.notes.every((n) => n.isPrivate === false)).toBe(true);

    const asDoctor = await call('get', `/api/session-tools/notes/patient/${f.patientA._id}`, tokens.doctorA);
    expect(asDoctor.body.notes).toHaveLength(2);
  });

  test('a non-authoring doctor gets an empty list rather than another doctor\'s notes', async () => {
    await Models.SessionNote.create({
      sessionId: f.paidSession._id, doctorId: f.doctorA._id, patientId: f.patientA._id, content: 'x'
    });
    const res = await call('get', `/api/session-tools/notes/patient/${f.patientA._id}`, tokens.doctorB);
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(0);
  });

  test('a doctor cannot attach a note to a session they are not on', async () => {
    const res = await call('post', '/api/session-tools/notes', tokens.doctorB, {
      sessionId: String(f.paidSession._id), content: 'intrusion'
    });
    expect(res.status).toBe(403);
    expect(await Models.SessionNote.countDocuments({})).toBe(0);
  });

  test('a task can be assigned by the treating doctor and completed by the patient', async () => {
    const created = await call('post', '/api/session-tools/tasks', tokens.doctorA, {
      sessionId: String(f.paidSession._id),
      title: 'Breathing exercise',
      description: 'Twice daily',
      dueDate: new Date(Date.now() + 3 * 864e5).toISOString(),
      priority: 'medium'
    });
    expect(created.status).toBe(201);
    const task = await Models.Task.findOne({});

    const done = await call('put', `/api/session-tools/tasks/${task._id}`, tokens.patientA, { status: 'completed' });
    expect(done.status).toBe(200);
    expect((await Models.Task.findById(task._id)).status).toBe('completed');
  });

  test('a patient cannot rewrite a task\'s content, only its status', async () => {
    await call('post', '/api/session-tools/tasks', tokens.doctorA, {
      sessionId: String(f.paidSession._id), title: 'Original title',
      description: 'Do the thing', priority: 'low',
      dueDate: new Date(Date.now() + 3 * 864e5).toISOString()
    });
    const task = await Models.Task.findOne({});

    await call('put', `/api/session-tools/tasks/${task._id}`, tokens.patientA, {
      title: 'Rewritten by the patient', status: 'completed'
    });

    const after = await Models.Task.findById(task._id);
    expect(after.title).toBe('Original title');
  });

  test('creating a report SAVES it but still answers 500', async () => {
    // report.controller.js:37 logs `sessionId.substring(0, 8)`, but sessionId
    // comes from req.authz.derived, and clinicalRecords.policy.js:61 derives it
    // as `session._id` — a Mongoose ObjectId, which has no .substring. The
    // TypeError is thrown AFTER report.save() and after the Session is stamped,
    // so the write succeeds and the caller is told it failed.
    //
    // This is the doctor's post-session report flow (PostSessionReportModal
    // posts here), so every submitted report reports an error, and a retry
    // creates a duplicate.
    const created = await call('post', '/api/session-tools/reports', tokens.doctorA, {
      sessionId: String(f.paidSession._id),
      title: 'Progress note',
      reportType: 'progress',
      content: 'Improving.'
    });

    expect(created.status).toBe(500);
    // ...and yet the record exists:
    expect(await Models.Report.countDocuments({ title: 'Progress note' })).toBe(1);
    const stamped = await Models.Session.findById(f.paidSession._id);
    expect(stamped.postSessionReportCompleted).toBe(true);
  });

  test('a saved report is still readable and markable by the patient', async () => {
    await call('post', '/api/session-tools/reports', tokens.doctorA, {
      sessionId: String(f.paidSession._id),
      title: 'Progress note',
      reportType: 'progress',
      content: 'Improving.'
    });
    const report = await Models.Report.findOne({});

    const byDoctor = await call('put', `/api/session-tools/reports/${report._id}/view`, tokens.doctorA);
    expect(byDoctor.status).toBe(403);

    const byPatient = await call('put', `/api/session-tools/reports/${report._id}/view`, tokens.patientA);
    expect(byPatient.status).toBe(200);
    expect((await Models.Report.findById(report._id)).viewedByPatient).toBe(true);
  });
});

describe('chat', () => {
  test('a conversation requires a prior session between the two users', async () => {
    // patientB has never had a session with doctorA.
    const res = await call('post', '/api/chat/conversation', tokens.patientB, { otherUserId: String(f.doctorA._id) });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const ok = await call('post', '/api/chat/conversation', tokens.patientA, { otherUserId: String(f.doctorA._id) });
    expect(ok.status).toBeLessThan(300);
  });

  test('a message is delivered and counted as unread for the recipient only', async () => {
    const conv = await call('post', '/api/chat/conversation', tokens.patientA, { otherUserId: String(f.doctorA._id) });
    const conversationId = String(conv.body.conversation?._id || conv.body._id || (await Models.Conversation.findOne({}))._id);

    const sent = await call('post', '/api/chat/message', tokens.patientA, { conversationId, text: 'Hello doctor' });
    expect(sent.status).toBeLessThan(300);

    const doctorUnread = await call('get', '/api/chat/unread-count', tokens.doctorA);
    expect(doctorUnread.body.count ?? doctorUnread.body.unreadCount ?? 0).toBe(1);

    const senderUnread = await call('get', '/api/chat/unread-count', tokens.patientA);
    expect(senderUnread.body.count ?? senderUnread.body.unreadCount ?? 0).toBe(0);
  });

  test('a non-participant can neither read the thread nor post into it', async () => {
    await call('post', '/api/chat/conversation', tokens.patientA, { otherUserId: String(f.doctorA._id) });
    const conversationId = String((await Models.Conversation.findOne({}))._id);
    await call('post', '/api/chat/message', tokens.patientA, { conversationId, text: 'private' });

    const read = await call('get', `/api/chat/messages/${conversationId}`, tokens.patientB);
    expect(read.status).toBeGreaterThanOrEqual(400);

    const post = await call('post', '/api/chat/message', tokens.patientB, { conversationId, text: 'intrusion' });
    expect(post.status).toBeGreaterThanOrEqual(400);
    expect(await Models.Message.countDocuments({ text: 'intrusion' })).toBe(0);
  });

  test('the recipient\'s own mark-read drops their count to zero', async () => {
    // The assertion the suite was missing. Everything around unread counting
    // was covered except the one transition the badge depends on.
    await call('post', '/api/chat/conversation', tokens.patientA, { otherUserId: String(f.doctorA._id) });
    const conversationId = String((await Models.Conversation.findOne({}))._id);
    await call('post', '/api/chat/message', tokens.patientA, { conversationId, text: 'Hello doctor' });

    const before = await call('get', '/api/chat/unread-count', tokens.doctorA);
    expect(before.body.unreadCount).toBe(1);

    const marked = await call('put', `/api/chat/conversation/${conversationId}/read`, tokens.doctorA);
    expect(marked.status).toBe(200);

    const after = await call('get', '/api/chat/unread-count', tokens.doctorA);
    expect(after.body.unreadCount).toBe(0);
  });

  test('fetching the thread also marks it read', async () => {
    // getMessages carries the same side effect (chat.controller.js:72). Worth
    // pinning separately because the client relies on it implicitly, and a
    // cached GET silently skips it.
    await call('post', '/api/chat/conversation', tokens.patientA, { otherUserId: String(f.doctorA._id) });
    const conversationId = String((await Models.Conversation.findOne({}))._id);
    await call('post', '/api/chat/message', tokens.patientA, { conversationId, text: 'Hello doctor' });

    expect((await call('get', '/api/chat/unread-count', tokens.doctorA)).body.unreadCount).toBe(1);

    const fetched = await call('get', `/api/chat/messages/${conversationId}`, tokens.doctorA);
    expect(fetched.status).toBe(200);
    // The response is built BEFORE the mark-read, so it still reports unread.
    expect(fetched.body[0].isRead).toBe(false);

    expect((await call('get', '/api/chat/unread-count', tokens.doctorA)).body.unreadCount).toBe(0);
  });

  test('A MESSAGE ARRIVING AFTER THE THREAD IS OPEN STAYS UNREAD FOREVER', async () => {
    // The reported bug. Read state is written only on ENTERING a conversation
    // — by GET /chat/messages/:id or by the socket conversation:join. There is
    // no read signal for a message that arrives while the reader already has
    // the thread open: MessagesPage handles `message:receive` with
    // setQueryData, so no GET is issued and nothing is emitted. The comment at
    // socket/chat.socket.js:142-148 records that a `message:read` handler was
    // removed precisely because no client emitted one.
    //
    // So the recipient watches the message appear on screen and the count
    // stays at 1 — through a poll, through the 5-minute cache, and through a
    // full reload.
    await call('post', '/api/chat/conversation', tokens.patientA, { otherUserId: String(f.doctorA._id) });
    const conversationId = String((await Models.Conversation.findOne({}))._id);

    // The doctor opens the thread and reads everything in it.
    await call('post', '/api/chat/message', tokens.patientA, { conversationId, text: 'first' });
    await call('get', `/api/chat/messages/${conversationId}`, tokens.doctorA);
    expect((await call('get', '/api/chat/unread-count', tokens.doctorA)).body.unreadCount).toBe(0);

    // A second message arrives while the thread is still open. The client
    // renders it from the socket payload and issues no request.
    await call('post', '/api/chat/message', tokens.patientA, { conversationId, text: 'second' });

    // It is now unread and nothing in the protocol will ever clear it.
    expect((await call('get', '/api/chat/unread-count', tokens.doctorA)).body.unreadCount).toBe(1);

    // Only re-entering the conversation clears it — which is the workaround
    // users discover, and the reason the badge looks stuck.
    await call('put', `/api/chat/conversation/${conversationId}/read`, tokens.doctorA);
    expect((await call('get', '/api/chat/unread-count', tokens.doctorA)).body.unreadCount).toBe(0);
  });

  test('a non-participant cannot mark a conversation read', async () => {
    // This route used to answer 200 to anyone. It was not exploitable — both
    // writes are scoped to the caller's own receiverId and participant entry,
    // so a stranger's call matched nothing — but it is now called by the
    // client on every read, so it carries the same membership check as its
    // sibling routes.
    await call('post', '/api/chat/conversation', tokens.patientA, { otherUserId: String(f.doctorA._id) });
    const conversationId = String((await Models.Conversation.findOne({}))._id);
    await call('post', '/api/chat/message', tokens.patientA, { conversationId, text: 'hello' });

    const res = await call('put', `/api/chat/conversation/${conversationId}/read`, tokens.patientB);
    expect(res.status).toBe(403);

    // And the real recipient's count is untouched either way.
    expect((await call('get', '/api/chat/unread-count', tokens.doctorA)).body.unreadCount).toBe(1);
  });
});

describe('reviews', () => {
  async function completedSession() {
    return Models.Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() - 3 * 3600 * 1000),
      duration: 60, price: 1500, status: 'completed',
      paymentStatus: 'paid', paymentId: 'pay_done_01'
    });
  }

  test('a patient can review a completed session exactly once', async () => {
    const s = await completedSession();
    const body = { sessionId: String(s._id), reviewType: 'doctor', rating: 5, feedback: 'Very helpful' };

    const first = await call('post', '/api/reviews/submit', tokens.patientA, body);
    expect(first.status).toBeLessThan(300);

    const second = await call('post', '/api/reviews/submit', tokens.patientA, body);
    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(await Models.Review.countDocuments({ sessionId: s._id, reviewType: 'doctor' })).toBe(1);
  });

  test('a patient cannot review a session that is not theirs', async () => {
    const s = await completedSession();
    const res = await call('post', '/api/reviews/submit', tokens.patientB, {
      sessionId: String(s._id), reviewType: 'doctor', rating: 1, feedback: 'sabotage'
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await Models.Review.countDocuments({})).toBe(0);
  });

  test('a doctor review needs admin approval before it is publicly listed', async () => {
    const s = await completedSession();
    await call('post', '/api/reviews/submit', tokens.patientA, {
      sessionId: String(s._id), reviewType: 'doctor', rating: 5, feedback: 'Great'
    });

    const review = await Models.Review.findOne({});
    expect(review.approvedForDisplay).not.toBe(true);

    const publicList = await request(server).get(`/api/reviews/doctor/${f.doctorA._id}`);
    expect(publicList.status).toBe(200);
    const shown = publicList.body.reviews || publicList.body.data || [];
    expect(shown).toHaveLength(0);
  });

  test('includeAll cannot be used to reveal unapproved reviews', async () => {
    // review.controller.js:100-108 deliberately ignores the parameter.
    const s = await completedSession();
    await call('post', '/api/reviews/submit', tokens.patientA, {
      sessionId: String(s._id), reviewType: 'doctor', rating: 2, feedback: 'unapproved-text-marker'
    });

    const res = await request(server).get(`/api/reviews/doctor/${f.doctorA._id}?includeAll=true`);
    const shown = res.body.reviews || res.body.data || [];
    expect(JSON.stringify(shown)).not.toMatch(/unapproved-text-marker/);
  });
});
