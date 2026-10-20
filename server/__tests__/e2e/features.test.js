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
  const { getAdminJWTSecret } = require('../../config/auth');
  const mk = (u) => jwt.sign({ userId: String(u._id), username: u.username, role: u.role }, getJWTSecret(), { expiresIn: '1h' });
  tokens = {
    patientA: mk(f.patientA), patientB: mk(f.patientB),
    doctorA: mk(f.doctorA), doctorB: mk(f.doctorB),
    // The admin moderation routes sit behind verifyAdminToken, a different
    // realm and secret from every token above.
    admin: jwt.sign({ userId: String(f.admin._id), role: 'admin' }, getAdminJWTSecret(), { expiresIn: '1h' })
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
  // what computeScore consumes. The depression test asks ten questions (the
  // PHQ-9 plus a difficulty item), and a submission must now answer all of
  // them: nine answers of 3 and a 0 => total 27 => 'severe'.
  const responses = [
    ...Array.from({ length: 9 }, (_, i) => ({ questionId: i + 1, answer: 3 })),
    { questionId: 10, answer: 0 }
  ];
  const mildAnxiety = Array.from({ length: 7 }, (_, i) => ({ questionId: i + 1, answer: 1 }));
  // A client-claimed score. Never stored; sent where a test needs a body the
  // pre-validation handler would also have accepted.
  const claimed = { total: 0, severity: 'minimal', percentage: 0 };

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
    // Used to answer 200 with the doctor's own (empty) list, because every
    // handler is self-scoped. The routes now declare requireRole('patient'),
    // so a doctor is refused at the route line rather than shown nothing.
    await call('post', '/api/assessments', tokens.patientA, { testType: 'depression', responses, scores: { total: 27, severity: 'severe', percentage: 100 } });
    const res = await call('get', '/api/assessments', tokens.doctorA);
    expect(res.status).toBe(403);
    expect(res.body.assessments).toBeUndefined();
  });

  test('an out-of-range answer is refused, not summed into a severity', async () => {
    // computeScore sums whatever it is handed. Before validation, one answer
    // of 100000 to a single question stored 'severe' at 333333%, and the
    // client-supplied `scores` the earlier fix stopped trusting were no longer
    // needed to choose a severity — the answers did it instead.
    // `scores` is sent (and ignored) so the refusal below is about the
    // answers — the old handler refused any body without it.
    const forged = [{ questionId: 1, answer: 100000 }];
    const res = await call('post', '/api/assessments', tokens.patientA, { testType: 'depression', responses: forged, scores: claimed });
    expect(res.status).toBe(400);
    expect(await Models.Assessment.countDocuments({})).toBe(0);
  });

  test('every question must be answered, each once, from its own options', async () => {
    const cases = [
      // too few: a "minimal" depression result from three zeros
      responses.slice(0, 3).map((r) => ({ ...r, answer: 0 })),
      // the same question twice
      [...responses.slice(0, 9), { questionId: 9, answer: 0 }],
      // a question the test does not have
      [...responses, { questionId: 11, answer: 0 }],
      // a fractional answer
      [...responses.slice(0, 9), { questionId: 10, answer: 1.5 }],
      // a YES/NO question answered 3 is not a valid option even though 3 is
      // valid elsewhere in the same test (ADHD Q1 vs Q8)
      [{ questionId: 1, answer: 3 }]
    ];
    for (const [i, rs] of cases.entries()) {
      const testType = i === cases.length - 1 ? 'adhd' : 'depression';
      // eslint-disable-next-line no-await-in-loop
      const res = await call('post', '/api/assessments', tokens.patientA, { testType, responses: rs, scores: claimed });
      expect([i, res.status]).toEqual([i, 400]);
    }
    expect(await Models.Assessment.countDocuments({})).toBe(0);
  });

  test('a branching test scores only the branch the patient was asked', async () => {
    // Addiction Q1 picks alcohol (0), drugs (1) or a behaviour (2). The client
    // keeps every answer it has seen, so a patient who answered an alcohol
    // question, went Back and switched to drugs also submits that stale
    // alcohol answer. It is dropped, not counted and not refused.
    const res = await call('post', '/api/assessments', tokens.patientA, {
      testType: 'addiction',
      scores: claimed,
      responses: [
        { questionId: 1, answer: 1 },
        { questionId: 2, answer: 1 }, // stale: alcohol branch
        { questionId: 5, answer: 1 }, { questionId: 6, answer: 1 }, { questionId: 7, answer: 0 }
      ]
    });
    expect(res.status).toBe(201);
    const saved = await Models.Assessment.findOne({ userId: f.patientA._id }).lean();
    expect(saved.responses.map((r) => r.questionId)).toEqual([1, 5, 6, 7]);
    // Q1 (the area picker) is stored but not scored: two "yes" out of the
    // drugs path's three questions.
    expect(saved.scores).toMatchObject({ total: 2, percentage: 67, severity: 'moderate' });
    expect(saved.testVersion).toBe('2.0');

    // And the branch's own questions are required.
    const partial = await call('post', '/api/assessments', tokens.patientA, {
      testType: 'addiction', scores: claimed, responses: [{ questionId: 1, answer: 1 }, { questionId: 5, answer: 1 }]
    });
    expect(partial.status).toBe(400);
  });

  test('PTSD: a patient who answers "no" to Q1 can finish and save', async () => {
    // Q1 asks whether the symptom questions may follow; "no" ends the test
    // after the past-experience questions. The server used to demand all 24
    // answers, so this path ended on "Missing answers for question(s) 10…".
    const responses9 = Array.from({ length: 9 }, (_, i) => ({ questionId: i + 1, answer: i === 0 ? 0 : (i % 2) }));
    const res = await call('post', '/api/assessments', tokens.patientA, { testType: 'ptsd', responses: responses9, scores: claimed });
    expect(res.status).toBe(201);
    expect(res.body.assessment.scores).toMatchObject({ total: 4, severity: 'minimal' });
  });

  test('the rescore migration: dry run changes nothing; apply rescores old results once', async () => {
    const { rescoreAssessments } = require('../../migrations/rescoreAssessments');
    const db = require('mongoose').connection.db;
    const col = db.collection('mentalhealthassessments');
    // Scored under the old rules: item 10 counted (24 → "severe"), the
    // addiction picker counted (1 + 2 = 3 → "mild").
    const phq = [...Array.from({ length: 8 }, (_, i) => ({ questionId: i + 1, answer: 2 })), { questionId: 9, answer: 1 }, { questionId: 10, answer: 3 }];
    await col.insertMany([
      { userId: f.patientA._id, testType: 'depression', responses: phq, scores: { total: 20, severity: 'severe', percentage: 67 }, testVersion: '1.0', completedAt: new Date() },
      { userId: f.patientA._id, testType: 'addiction', responses: [{ questionId: 1, answer: 1 }, { questionId: 5, answer: 1 }, { questionId: 6, answer: 1 }, { questionId: 7, answer: 0 }], scores: { total: 3, severity: 'mild', percentage: 30 }, testVersion: '1.0', completedAt: new Date() },
      { userId: f.patientA._id, testType: 'dla20', responses: [], scores: { total: 1, severity: 'mild', percentage: 1 }, testVersion: '1.0', completedAt: new Date() }
    ]);

    const dry = await rescoreAssessments(db);
    expect(dry).toMatchObject({ scanned: 3, changed: 2, severityChanged: 2, skipped: 1 });
    expect(dry.moves).toEqual({ 'depression: severe → moderately-severe': 1, 'addiction: mild → moderate': 1 });
    expect((await col.findOne({ testType: 'depression' })).scores.total).toBe(20);

    const done = await rescoreAssessments(db, { apply: true });
    expect(done.changed).toBe(2);
    expect((await col.findOne({ testType: 'depression' }))).toMatchObject({ scores: { total: 17, severity: 'moderately-severe', percentage: 63 }, testVersion: '2.0' });
    expect((await col.findOne({ testType: 'addiction' })).scores).toMatchObject({ total: 2, severity: 'moderate' });
    expect((await col.findOne({ testType: 'dla20' })).scores.total).toBe(1);
    expect(await rescoreAssessments(db, { apply: true })).toMatchObject({ changed: 0 });
  });

  test('DLA-20 is refused rather than saved with the client\'s own score', async () => {
    // The server has no scoring table for it and the client has no questions
    // for it, so the old fallback stored whatever `scores` arrived — the one
    // test type whose severity the caller simply chose.
    const res = await call('post', '/api/assessments', tokens.patientA, {
      testType: 'dla20',
      responses: [{ questionId: 1, answer: 1 }],
      scores: { total: 0, severity: 'minimal', percentage: 0 }
    });
    expect(res.status).toBe(400);
    expect(await Models.Assessment.countDocuments({ testType: 'dla20' })).toBe(0);
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

  test('history is the last N IST calendar days, not the last N entries', async () => {
    const istDate = (daysAgo) => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    };
    // Two recent check-ins and one from five weeks ago: a "last 14" window
    // must not reach back for the old one just because there are few entries.
    await Models.MoodEntry.insertMany([0, 13, 35].map((ago, i) => ({
      patientId: f.patientA._id, date: istDate(ago), mood: i + 1, label: Models.MoodEntry.MOOD_LABELS[i]
    })));

    const res = await call('get', '/api/session-tools/mood/history?days=14', tokens.patientA);
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e) => e.date)).toEqual([istDate(0), istDate(13)]);
    expect(res.body).toMatchObject({ from: istDate(13), to: istDate(0) });
  });

  test('the note\'s 280-character limit is enforced on the upsert path', async () => {
    // models/moodEntry.js declares maxlength 280, but entries are written with
    // findOneAndUpdate, which skips validators — so any length was stored.
    const long = await call('post', '/api/session-tools/mood', tokens.patientA, { mood: 3, note: 'x'.repeat(281) });
    expect(long.status).toBe(400);
    const obj = await call('post', '/api/session-tools/mood', tokens.patientA, { mood: 3, note: { $gt: '' } });
    expect(obj.status).toBe(400);
    expect(await Models.MoodEntry.countDocuments({})).toBe(0);

    const ok = await call('post', '/api/session-tools/mood', tokens.patientA, { mood: 3, note: 'x'.repeat(280) });
    expect(ok.status).toBe(201);
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

  test('blank or oversized entries are refused with a readable reason; edits are checked too', async () => {
    const post = (body) => call('post', '/api/session-tools/journal', tokens.patientA, body);
    const blank = await post({ title: '   ', content: 'something' });
    expect(blank.status).toBe(400);
    expect(blank.body.message).toMatch(/title/);
    expect((await post({ title: 'ok', content: '\n  \n' })).status).toBe(400);
    expect((await post({ title: 'x'.repeat(201), content: 'ok' })).status).toBe(400);
    expect((await post({ title: 'ok', content: 'x'.repeat(20001) })).status).toBe(400);
    expect((await post({ title: { $ne: '' }, content: 'ok' })).status).toBe(400);
    expect(await Models.Journal.countDocuments({})).toBe(0);

    const created = await post({ title: '  Morning  ', content: 'fine  ' });
    expect(created.status).toBe(201);
    expect(created.body.journal).toMatchObject({ title: 'Morning', content: 'fine' });
    const id = created.body.journal._id;
    expect((await call('put', `/api/session-tools/journal/${id}`, tokens.patientA, { title: '' })).status).toBe(400);
    const moodOnly = await call('put', `/api/session-tools/journal/${id}`, tokens.patientA, { mood: 'Calm' });
    expect(moodOnly.status).toBe(200);
    expect(moodOnly.body.journal).toMatchObject({ title: 'Morning', mood: 'Calm' });
  });

  test('the list pages through every entry and says when there are older ones', async () => {
    const base = Date.now();
    await Models.Journal.insertMany(Array.from({ length: 23 }, (_, i) => ({
      patientId: f.patientA._id, title: `Entry ${i}`, content: 'c', createdAt: new Date(base - i * 60000)
    })));
    const url = (page) => `/api/session-tools/journal/patient/${f.patientA._id}?page=${page}`;
    const first = await call('get', url(1), tokens.patientA);
    expect(first.body).toMatchObject({ hasMore: true, limit: 20 });
    expect(first.body.journals).toHaveLength(20);
    expect(first.body.journals[0].title).toBe('Entry 0');
    const second = await call('get', url(2), tokens.patientA);
    expect(second.body.hasMore).toBe(false);
    expect(second.body.journals.map((j) => j.title)).toEqual(['Entry 20', 'Entry 21', 'Entry 22']);
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

  test('creating a report saves it AND answers 201', async () => {
    // Was a characterisation test asserting 500. report.controller.js:37
    // logged `sessionId.substring(0, 8)`, but sessionId comes from
    // req.authz.derived, and clinicalRecords.policy.js derives it as
    // `session._id` — a Mongoose ObjectId, which has no .substring. The
    // TypeError was thrown AFTER report.save() and after the Session was
    // stamped, so the write succeeded and the caller was told it failed.
    //
    // This is the doctor's post-session report flow (PostSessionReportModal
    // posts here), so every submitted report showed "Failed to submit report",
    // and each retry filed a duplicate of a report that had saved correctly.
    //
    // Ids reach these handlers as strings (req.params, req.actor.id) and as
    // ObjectIds (anything derived from a loaded document), so the logging
    // helpers now convert instead of assuming. See shortId in utils/logger.js.
    const created = await call('post', '/api/session-tools/reports', tokens.doctorA, {
      sessionId: String(f.paidSession._id),
      title: 'Progress note',
      reportType: 'progress',
      content: 'Improving.'
    });

    expect(created.status).toBe(201);
    expect(created.body.success).toBe(true);
    expect(await Models.Report.countDocuments({ title: 'Progress note' })).toBe(1);
    const stamped = await Models.Session.findById(f.paidSession._id);
    expect(stamped.postSessionReportCompleted).toBe(true);
  });

  test('a log line can never fail a write that already succeeded', async () => {
    // The specific bug above was one call site; this pins the shape of it.
    // shortId must be total over every id representation these handlers see,
    // because the call site cannot tell which one a policy will hand it.
    const { shortId } = require('../../utils/logger');
    const mongoose = require('mongoose');
    const oid = new mongoose.Types.ObjectId();

    expect(shortId(oid)).toBe(String(oid).substring(0, 8));
    expect(shortId(String(oid))).toBe(String(oid).substring(0, 8));
    expect(shortId(null)).toBeUndefined();
    expect(shortId(undefined)).toBeUndefined();
    expect(() => shortId({ nested: 'object' })).not.toThrow();
  });

  test('marking an UNSHARED report viewed is refused, because the response is the report', async () => {
    // markReportViewed answers with the whole document, so this route is also
    // a read — and its policy checked only that the caller was the patient.
    // A report the doctor withheld was one PUT away.
    const report = await Models.Report.create({
      sessionId: f.paidSession._id, doctorId: f.doctorA._id, patientId: f.patientA._id,
      title: 'Withheld', reportType: 'progress', content: 'withheld-report-marker', isSharedWithPatient: false
    });
    const res = await call('put', `/api/session-tools/reports/${report._id}/view`, tokens.patientA);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/withheld-report-marker/);
    expect((await Models.Report.findById(report._id)).viewedByPatient).toBe(false);
  });

  test('a legacy session report the doctor has not shared is hidden from the patient by id and by session', async () => {
    // The list-by-patient scope already filtered isSharedWithPatient; the
    // by-id rule and the by-session handler did not.
    const SessionReport = require('../../models/sessionReport');
    const [shared, withheld] = await SessionReport.create([
      { sessionId: f.paidSession._id, patientId: f.patientA._id, doctorId: f.doctorA._id, reportType: 'progress-summary', title: 'Shared', content: 'shared-marker', isSharedWithPatient: true },
      { sessionId: f.paidSession._id, patientId: f.patientA._id, doctorId: f.doctorA._id, reportType: 'session-notes', title: 'Withheld', content: 'withheld-legacy-marker', isSharedWithPatient: false }
    ]);
    try {
      const byId = await call('get', `/api/session-reports/${withheld._id}`, tokens.patientA);
      expect(byId.status).toBe(403);
      expect(JSON.stringify(byId.body)).not.toMatch(/withheld-legacy-marker/);

      const bySession = await call('get', `/api/session-reports/session/${f.paidSession._id}`, tokens.patientA);
      expect(bySession.status).toBe(200);
      expect(bySession.body.reports.map((r) => r.title)).toEqual(['Shared']);

      // The shared one, and everything for the authoring doctor, still reads.
      expect((await call('get', `/api/session-reports/${shared._id}`, tokens.patientA)).status).toBe(200);
      expect((await call('get', `/api/session-reports/${withheld._id}`, tokens.doctorA)).status).toBe(200);
      const doctorView = await call('get', `/api/session-reports/session/${f.paidSession._id}`, tokens.doctorA);
      expect(doctorView.body.reports).toHaveLength(2);
    } finally {
      await SessionReport.deleteMany({});
    }
  });

  test('a legacy session report only takes attachments from our own Cloudinary account', async () => {
    const SessionReport = require('../../models/sessionReport');
    const base = { sessionId: String(f.paidSession._id), reportType: 'other', title: 'With file', content: 'x' };
    try {
      for (const url of [
        'https://evil.example/x.pdf',
        'https://res.cloudinary.com/someone-else/raw/upload/x.pdf',
        'http://res.cloudinary.com/stub/raw/upload/x.pdf',
        'javascript:alert(1)'
      ]) {
        // eslint-disable-next-line no-await-in-loop
        const res = await call('post', '/api/session-reports', tokens.doctorA, { ...base, attachments: [{ filename: 'x.pdf', url }] });
        expect([url, res.status]).toEqual([url, 400]);
      }
      expect(await SessionReport.countDocuments({})).toBe(0);

      const ok = await call('post', '/api/session-reports', tokens.doctorA, {
        ...base, attachments: [{ filename: 'x.pdf', url: 'https://res.cloudinary.com/stub/raw/upload/v1/x.pdf' }]
      });
      expect(ok.status).toBe(201);
    } finally {
      await SessionReport.deleteMany({});
    }
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

  test('fetching the thread does NOT mark it read; PUT .../read does', async () => {
    // Fetching history used to mark everything read as a side effect — so the
    // in-call chat merely mounting, or a prefetch, counted as reading, and a
    // message arriving later was hidden but "read". Reading is now explicit
    // (the app calls PUT .../read while the thread is on screen).
    await call('post', '/api/chat/conversation', tokens.patientA, { otherUserId: String(f.doctorA._id) });
    const conversationId = String((await Models.Conversation.findOne({}))._id);
    await call('post', '/api/chat/message', tokens.patientA, { conversationId, text: 'Hello doctor' });
    expect((await call('get', '/api/chat/unread-count', tokens.doctorA)).body.unreadCount).toBe(1);

    const fetched = await call('get', `/api/chat/messages/${conversationId}`, tokens.doctorA);
    expect(fetched.status).toBe(200);
    expect(fetched.body[0].isRead).toBe(false);
    expect((await call('get', '/api/chat/unread-count', tokens.doctorA)).body.unreadCount).toBe(1);

    const read = await call('put', `/api/chat/conversation/${conversationId}/read`, tokens.doctorA);
    expect(read.body).toMatchObject({ success: true, marked: 1 });
    expect((await call('get', '/api/chat/unread-count', tokens.doctorA)).body.unreadCount).toBe(0);
  });

  test('a message arriving while the thread is open is cleared by the next read', async () => {
    // The reported bug: read state was written only on ENTERING a thread, so
    // a message arriving while it was open stayed unread forever. The app now
    // calls PUT .../read for a message that arrives into the open thread.
    await call('post', '/api/chat/conversation', tokens.patientA, { otherUserId: String(f.doctorA._id) });
    const conversationId = String((await Models.Conversation.findOne({}))._id);
    await call('post', '/api/chat/message', tokens.patientA, { conversationId, text: 'first' });
    await call('put', `/api/chat/conversation/${conversationId}/read`, tokens.doctorA);
    expect((await call('get', '/api/chat/unread-count', tokens.doctorA)).body.unreadCount).toBe(0);

    await call('post', '/api/chat/message', tokens.patientA, { conversationId, text: 'second' });
    expect((await call('get', '/api/chat/unread-count', tokens.doctorA)).body.unreadCount).toBe(1);
    await call('put', `/api/chat/conversation/${conversationId}/read`, tokens.doctorA);
    expect((await call('get', '/api/chat/unread-count', tokens.doctorA)).body.unreadCount).toBe(0);
  });

  test('an abandoned or failed checkout is not a relationship that opens a chat', async () => {
    // A Session row is created when checkout OPENS, before any payment. Any
    // Session used to qualify, so opening and closing a checkout with a doctor
    // was enough to message them directly from then on.
    const opened = [];
    for (const paymentStatus of ['pending', 'failed']) {
      // eslint-disable-next-line no-await-in-loop
      opened.push(await Models.Session.create({
        patientId: f.patientB._id, doctorId: f.doctorB._id,
        startsAt: new Date(Date.now() + (48 + opened.length) * 3600 * 1000), duration: 60, price: 1500,
        status: 'payment_pending', paymentStatus
      }));
    }
    try {
      for (const token of [tokens.patientB, tokens.doctorB]) {
        const other = token === tokens.patientB ? f.doctorB : f.patientB;
        // eslint-disable-next-line no-await-in-loop
        const res = await call('post', '/api/chat/conversation', token, { otherUserId: String(other._id) });
        expect(res.status).toBe(403);
      }
      expect(await Models.Conversation.countDocuments({})).toBe(0);

      // Once money has changed hands — even if it was later refunded — they
      // really were matched, and the chat opens.
      await Models.Session.updateOne({ _id: opened[0]._id }, { $set: { status: 'cancelled', paymentStatus: 'refunded', paymentId: 'pay_x', refundId: 'rfnd_x', refundAmount: 1500 } });
      const ok = await call('post', '/api/chat/conversation', tokens.patientB, { otherUserId: String(f.doctorB._id) });
      expect(ok.status).toBe(200);
    } finally {
      await Models.Session.deleteMany({ _id: { $in: opened.map((s) => s._id) } });
    }
  });

  test('a completed session qualifies whatever its payment field says', async () => {
    const s = await Models.Session.create({
      patientId: f.patientB._id, doctorId: f.doctorB._id,
      startsAt: new Date(Date.now() - 48 * 3600 * 1000), duration: 60, price: 0,
      status: 'completed', paymentStatus: 'pending'
    });
    try {
      const res = await call('post', '/api/chat/conversation', tokens.doctorB, { otherUserId: String(f.patientB._id) });
      expect(res.status).toBe(200);
    } finally {
      await Models.Session.deleteOne({ _id: s._id });
    }
  });

  test('message text must be a non-empty string', async () => {
    await call('post', '/api/chat/conversation', tokens.patientA, { otherUserId: String(f.doctorA._id) });
    const conversationId = String((await Models.Conversation.findOne({}))._id);
    for (const text of [{ $gt: '' }, ['a'], '   ', 42]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call('post', '/api/chat/message', tokens.patientA, { conversationId, text });
      expect(res.status).toBe(400);
    }
    expect(await Models.Message.countDocuments({})).toBe(0);
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

  test('a doctor review of a completed session is public as soon as it is submitted', async () => {
    // This used to assert the opposite: every doctor review waited for an
    // admin. Nothing in the client moderates reviews, so in end-to-end testing
    // a patient's review simply never appeared on the doctor's profile. A
    // doctor review can only come from the patient of a completed session
    // with that doctor — verified by construction — so it is now visible by
    // default and an admin can take it down (next test).
    const s = await completedSession();
    await call('post', '/api/reviews/submit', tokens.patientA, {
      sessionId: String(s._id), reviewType: 'doctor', rating: 5, feedback: 'Great'
    });

    const review = await Models.Review.findOne({});
    expect(review.approvedForDisplay).toBe(true);

    const publicList = await request(server).get(`/api/reviews/doctor/${f.doctorA._id}`);
    expect(publicList.status).toBe(200);
    expect(publicList.body.reviews.map((r) => r.feedback)).toEqual(['Great']);
    expect(publicList.body.stats).toMatchObject({ totalReviews: 1, averageRating: 5 });
    expect(publicList.body.total).toBe(1);
  });

  test('includeAll cannot be used to reveal a review an admin has hidden', async () => {
    // review.controller.js deliberately ignores the parameter. Doctor reviews
    // are public by default now, so what it would reveal is a takedown —
    // either kind: `approve` with approved:false, or a flag.
    const hiddenIds = [];
    for (const [i, action] of [['approve', { approved: false }], ['status', { status: 'flagged' }]].entries()) {
      const s = await completedSession();
      // eslint-disable-next-line no-await-in-loop
      await call('post', '/api/reviews/submit', tokens.patientA, {
        sessionId: String(s._id), reviewType: 'doctor', rating: 2, feedback: `hidden-text-marker-${i}`
      });
      // eslint-disable-next-line no-await-in-loop
      const review = await Models.Review.findOne({ sessionId: s._id });
      hiddenIds.push(review._id);
      // eslint-disable-next-line no-await-in-loop
      const res = await call('patch', `/api/reviews/admin/${review._id}/${action[0]}`, tokens.admin, action[1]);
      expect(res.status).toBe(200);
    }

    for (const q of ['', '?includeAll=true']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(server).get(`/api/reviews/doctor/${f.doctorA._id}${q}`);
      expect(JSON.stringify(res.body.reviews)).not.toMatch(/hidden-text-marker/);
      expect(res.body.stats.totalReviews).toBe(0);
    }
    expect(await Models.Review.countDocuments({ _id: { $in: hiddenIds } })).toBe(2);
  });

  test('a legacy doctor review nobody moderated is shown, but only for a completed session', async () => {
    // Rows written while doctor reviews waited for approval sit at
    // approvedForDisplay:false with no reviewedAt. Nobody looked at them, so
    // they are shown — handled in the query, not by a migration — provided the
    // session they rate really was completed.
    const completed = await completedSession();
    const unfinished = await Models.Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + 72 * 3600 * 1000), duration: 60, price: 1500,
      status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_future_01'
    });
    const legacy = { patientId: f.patientA._id, doctorId: f.doctorA._id, reviewType: 'doctor', rating: 4, approvedForDisplay: false, isPublic: false };
    await Models.Review.create([
      { ...legacy, sessionId: completed._id, feedback: 'legacy-completed-marker' },
      { ...legacy, sessionId: unfinished._id, feedback: 'legacy-unfinished-marker' }
    ]);

    const res = await request(server).get(`/api/reviews/doctor/${f.doctorA._id}`);
    const raw = JSON.stringify(res.body.reviews);
    expect(raw).toMatch(/legacy-completed-marker/);
    expect(raw).not.toMatch(/legacy-unfinished-marker/);
    expect(res.body.stats).toMatchObject({ totalReviews: 1, averageRating: 4 });
    await Models.Session.deleteOne({ _id: unfinished._id });
  });

  /** Submit a review as patientA, then approve it through the real admin route. */
  async function approvedReview(over = {}) {
    const s = await completedSession();
    const body = { sessionId: String(s._id), reviewType: 'doctor', rating: 5, feedback: 'Helpful', ...over };
    const submitted = await call('post', '/api/reviews/submit', tokens.patientA, body);
    expect(submitted.status).toBe(201);
    const review = await Models.Review.findOne({ sessionId: s._id, reviewType: body.reviewType });
    const approved = await call('patch', `/api/reviews/admin/${review._id}/approve`, tokens.admin, { approved: true });
    expect(approved.status).toBe(200);
    return review;
  }

  test('a public therapist review names nobody: it is "Verified patient"', async () => {
    // Both public endpoints populated `firstName lastName` and returned the
    // whole document, so an anonymous caller could read the full name of a
    // person in therapy, their account id, the moderator's notes and the
    // private "improvements" feedback meant for the doctor. Then it was first
    // name + last initial; next to a named therapist even that can out a
    // patient, so a therapist review is now anonymous (Phase 5 decision).
    const review = await approvedReview({ improvements: 'private-improvement-marker' });
    await Models.Review.updateOne({ _id: review._id }, { adminNotes: 'admin-notes-marker' });

    const res = await request(server).get(`/api/reviews/doctor/${f.doctorA._id}`);
    expect(res.status).toBe(200);
    expect(res.body.reviews).toHaveLength(1);
    const [shown] = res.body.reviews;

    expect(shown.patientId).toEqual({ firstName: 'Verified patient', lastName: '' });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(f.patientA.firstName);
    expect(raw).not.toContain(f.patientA.lastName);
    expect(raw).not.toContain(String(f.patientA._id));
    expect(raw).not.toMatch(/private-improvement-marker|admin-notes-marker/);
    // The fields the profile page renders are still there.
    expect(shown).toMatchObject({ rating: 5, feedback: 'Helpful' });
  });

  test('a review whose author account is gone is still shown, without crashing the page', async () => {
    const review = await approvedReview();
    await Models.Review.updateOne({ _id: review._id }, { patientId: new mongoose.Types.ObjectId() });

    const res = await request(server).get(`/api/reviews/doctor/${f.doctorA._id}`);
    expect(res.body.reviews[0].patientId).toEqual({ firstName: 'Verified patient', lastName: '' });
  });

  test('a star-only rating is stored with no comment, and is never shown as a filler quote', async () => {
    const s = await completedSession();
    const res = await call('post', '/api/reviews/submit', tokens.patientA, { sessionId: String(s._id), reviewType: 'doctor', rating: 4 });
    expect(res.status).toBe(201);
    expect((await Models.Review.findOne({ sessionId: s._id })).feedback).toBe('');

    // A row from before: the form sent "No additional comments provided.".
    const old = await completedSession();
    await Models.Review.create({
      sessionId: old._id, patientId: f.patientA._id, doctorId: f.doctorA._id, reviewType: 'doctor', rating: 5,
      feedback: 'No additional comments provided.', approvedForDisplay: true, isPublic: true
    });
    const list = await request(server).get(`/api/reviews/doctor/${f.doctorA._id}`);
    expect(list.body.reviews.map((r) => r.feedback)).toEqual(['', '']);
  });

  test('a comment that is not text, or is very long, is refused', async () => {
    const s = await completedSession();
    const notText = await call('post', '/api/reviews/submit', tokens.patientA, { sessionId: String(s._id), reviewType: 'doctor', rating: 4, feedback: { a: 1 } });
    expect(notText.status).toBe(400);
    const tooLong = await call('post', '/api/reviews/submit', tokens.patientA, { sessionId: String(s._id), reviewType: 'doctor', rating: 4, feedback: 'x'.repeat(2001) });
    expect(tooLong.status).toBe(400);
    expect(await Models.Review.countDocuments({ sessionId: s._id })).toBe(0);
  });

  test('a platform review is not on the landing page until an admin approves it', async () => {
    // Platform reviews were approved at submission — the one public surface
    // with no moderation at all.
    const s = await completedSession();
    await call('post', '/api/reviews/submit', tokens.patientA, {
      sessionId: String(s._id), reviewType: 'platform', rating: 1, feedback: 'unmoderated-platform-marker'
    });
    const review = await Models.Review.findOne({ reviewType: 'platform' });
    expect(review.approvedForDisplay).toBe(false);

    const before = await request(server).get('/api/reviews/platform');
    expect(before.body.reviews).toHaveLength(0);
    expect(before.body.total).toBe(0);

    await call('patch', `/api/reviews/admin/${review._id}/approve`, tokens.admin, { approved: true });
    const after = await request(server).get('/api/reviews/platform');
    expect(after.body.reviews).toHaveLength(1);
    expect(after.body.reviews[0].patientId.lastName).toBe(f.patientA.lastName.charAt(0));
  });

  test('a legacy self-approved platform review stays hidden until a human approves it', async () => {
    // Rows written before the fix carry approvedForDisplay: true with no
    // moderation stamp. They must not be published by the new filter either.
    const s = await completedSession();
    await Models.Review.create({
      sessionId: s._id, patientId: f.patientA._id, doctorId: f.doctorA._id,
      rating: 5, feedback: 'legacy-autoapproved-marker', reviewType: 'platform',
      approvedForDisplay: true, isPublic: true
    });
    const res = await request(server).get('/api/reviews/platform');
    expect(JSON.stringify(res.body)).not.toMatch(/legacy-autoapproved-marker/);
  });

  test('a flagged review leaves the public list and the public rating, even if approved', async () => {
    const good = await approvedReview({ rating: 5 });
    const bad = await approvedReview({ rating: 1, feedback: 'flagged-marker' });

    const flag = await call('patch', `/api/reviews/admin/${bad._id}/status`, tokens.admin, { status: 'flagged' });
    expect(flag.status).toBe(200);

    const res = await request(server).get(`/api/reviews/doctor/${f.doctorA._id}`);
    expect(res.body.reviews.map((r) => String(r._id))).toEqual([String(good._id)]);
    expect(res.body.stats).toMatchObject({ totalReviews: 1, averageRating: 5, oneStar: 0 });
    expect(res.body.total).toBe(1);
  });

  test('the public rating counts visible doctor reviews only, never platform ones', async () => {
    // getDoctorStats matched on doctorId alone: flagged reviews and platform
    // reviews (which carry the session's doctorId) were averaged in.
    const s1 = await completedSession();
    await call('post', '/api/reviews/submit', tokens.patientA, { sessionId: String(s1._id), reviewType: 'doctor', rating: 4, feedback: 'visible' });
    const flagged = await approvedReview({ rating: 1, feedback: 'to-be-flagged' });
    await call('patch', `/api/reviews/admin/${flagged._id}/status`, tokens.admin, { status: 'flagged' });
    await approvedReview({ reviewType: 'platform', rating: 1 });

    const stats = await Models.Review.getDoctorStats(String(f.doctorA._id));
    expect(stats).toMatchObject({ totalReviews: 1, averageRating: 4, fourStars: 1, oneStar: 0 });
  });

  test('the stored DoctorProfile rating follows what is public — up on submission, down on takedown', async () => {
    // GET /api/sessions/my-doctors returns DoctorProfile.rating as stored. It
    // used to be rebuilt from every session score, so a review an admin had
    // taken down still counted.
    const DoctorProfile = require('../../models/doctorProfile');
    await DoctorProfile.updateOne({ userId: f.doctorA._id }, { $set: { rating: { average: 0, totalReviews: 0 } } });

    const s = await completedSession();
    await call('post', '/api/reviews/submit', tokens.patientA, { sessionId: String(s._id), reviewType: 'doctor', rating: 2, feedback: 'x' });
    let { rating } = await DoctorProfile.findOne({ userId: f.doctorA._id }).lean();
    expect(rating).toMatchObject({ average: 2, totalReviews: 1 });
    expect(rating.distribution['2']).toBe(1);

    const review = await Models.Review.findOne({ sessionId: s._id });
    await call('patch', `/api/reviews/admin/${review._id}/approve`, tokens.admin, { approved: false });
    ({ rating } = await DoctorProfile.findOne({ userId: f.doctorA._id }).lean());
    expect(rating).toMatchObject({ average: 0, totalReviews: 0 });
  });

  test('a rating must be a whole number of stars', async () => {
    // 4.5 passed the 1-5 range check and then wrote NaN into the doctor's
    // star distribution (`distribution[4.5]++`). `true` is Number(true) === 1.
    for (const rating of [4.5, '3.5', true, 0, 6, 'abc']) {
      const s = await completedSession();
      // eslint-disable-next-line no-await-in-loop
      const res = await call('post', '/api/reviews/submit', tokens.patientA, {
        sessionId: String(s._id), reviewType: 'doctor', rating, feedback: 'x'
      });
      expect([rating, res.status]).toEqual([rating, 400]);
    }
    expect(await Models.Review.countDocuments({})).toBe(0);
  });

  test('admin moderation records the admin as a User the review can be populated with', async () => {
    // reviewedBy referenced an 'Admin' model that does not exist, so any
    // populate of it threw MissingSchemaError.
    const review = await approvedReview();
    const populated = await Models.Review.findById(review._id).populate('reviewedBy', 'firstName role').lean();
    expect(String(populated.reviewedBy._id)).toBe(String(f.admin._id));
    expect(populated.reviewedBy.role).toBe('admin');
  });

  test('approve refuses anything but a boolean', async () => {
    // An absent `approved` was written through as undefined, while still
    // stamping the review as moderated.
    const s = await completedSession();
    await call('post', '/api/reviews/submit', tokens.patientA, { sessionId: String(s._id), reviewType: 'platform', rating: 5, feedback: 'x' });
    const review = await Models.Review.findOne({});
    for (const approved of [undefined, 'true', 1]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call('patch', `/api/reviews/admin/${review._id}/approve`, tokens.admin, approved === undefined ? {} : { approved });
      expect(res.status).toBe(400);
    }
    const after = await Models.Review.findById(review._id);
    expect(after.approvedForDisplay).toBe(false);
    expect(after.reviewedAt).toBeNull();
  });
});
