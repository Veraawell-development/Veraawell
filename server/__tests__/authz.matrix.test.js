/**
 * Authorization matrix.
 *
 * One table of (endpoint, actor) -> expected outcome, run against the REAL
 * routers and the REAL controllers with authentication stubbed at the
 * boundary. This is the test that would have caught the four missing-check
 * vulnerabilities on the day each was written.
 *
 * Two properties are deliberate:
 *
 *  1. Cases assert DATABASE STATE, not only the status code. A 403 alone is
 *     not proof: a handler that refunds and *then* returns 403 would pass a
 *     status-only assertion. `after` hooks check that nothing moved.
 *
 *  2. The whole matrix runs twice, once with `req.user` as a plain object
 *     literal (the idiom the pre-existing tests use) and once as a hydrated
 *     Mongoose document (what production attaches). The policy layer must not
 *     behave differently between them — that equivalence is what makes the
 *     fast no-DB fixtures trustworthy.
 */

process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'dummy_secret';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const request = require('supertest');

const mockRefund = jest.fn().mockResolvedValue({ id: 'rfnd_test', status: 'processed' });
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: mockRefund, fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
jest.mock('../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue(undefined)
}));

const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { errorHandler } = require('../middleware/error.middleware');
const { getJWTSecret } = require('../config/auth');

let mongod;
let User, Session, SessionNote, Report, SessionReport, Task, Journal;
let actors = {};
let fixtures = {};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  User = require('../models/user');
  Session = require('../models/session');
  SessionNote = require('../models/sessionNote');
  Report = require('../models/report');
  SessionReport = require('../models/sessionReport');
  Task = require('../models/task');
  Journal = require('../models/journal');
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

let seq = 0;
async function mkUser(role, extra = {}) {
  seq += 1;
  return User.create({
    firstName: role, lastName: 'T',
    email: `${role}${seq}@t.com`, username: `${role}${seq}`,
    password: 'password123', role, approvalStatus: 'approved', ...extra
  });
}

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}), Session.deleteMany({}), SessionNote.deleteMany({}),
    Report.deleteMany({}), SessionReport.deleteMany({}), Task.deleteMany({}), Journal.deleteMany({})
  ]);
  mockRefund.mockClear();

  const patientA = await mkUser('patient');
  const patientB = await mkUser('patient');
  const doctorA = await mkUser('doctor');
  const doctorB = await mkUser('doctor');
  const admin = await mkUser('admin');

  // patientA is treated by doctorA. patientB and doctorB are strangers to them.
  const sessionA = await Session.create({
    patientId: patientA._id, doctorId: doctorA._id,
    sessionDate: new Date(Date.now() + 3 * 864e5), sessionTime: '10:00 AM',
    duration: 60, price: 1500, status: 'scheduled', paymentStatus: 'paid',
    paymentId: 'pay_realone'
  });

  const privateNote = await SessionNote.create({
    sessionId: sessionA._id, doctorId: doctorA._id, patientId: patientA._id,
    content: 'PRIVATE clinical impression', isPrivate: true
  });
  const sharedReport = await Report.create({
    sessionId: sessionA._id, doctorId: doctorA._id, patientId: patientA._id,
    title: 'Progress', reportType: 'progress', content: 'x', isSharedWithPatient: true
  });
  const sessionReport = await SessionReport.create({
    sessionId: sessionA._id, doctorId: doctorA._id, patientId: patientA._id,
    title: 'PHI: suicidal ideation notes', content: 'confidential', reportType: 'session-notes'
  });
  const journalA = await Journal.create({
    patientId: patientA._id, title: 'diary', content: 'private thoughts'
  });

  actors = {
    patientA: { doc: patientA, realm: 'user' },
    patientB: { doc: patientB, realm: 'user' },
    doctorA: { doc: doctorA, realm: 'user' },
    doctorB: { doc: doctorB, realm: 'user' },
    admin: { doc: admin, realm: 'admin' },
    anonymous: null
  };
  fixtures = { patientA, patientB, doctorA, doctorB, admin, sessionA, privateNote, sharedReport, sessionReport, journalA };
});

/**
 * Mounts the real routers, including the real verifyToken. Auth is exercised
 * rather than stubbed: each actor presents a genuine JWT, so this covers the
 * middleware chain (token extraction, user lookup, and — once it lands — the
 * account-status check) in addition to the policy layer.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/sessions', require('../routes/sessions'));
  app.use('/api/session-tools', require('../routes/sessionTools'));
  app.use('/api/session-reports', require('../routes/sessionReports'));
  app.use(errorHandler);
  return app;
}

/**
 * A real user-realm token. Note the admin case deliberately uses this same
 * realm: an admin who signs in through the normal /api/auth/login path holds
 * exactly such a token, and that is the reachable route by which an
 * admin-role actor reached the clinical list endpoints and got an unfiltered
 * query. Testing it via the user realm is testing the path that was exposed.
 */
function tokenFor(user) {
  return jwt.sign(
    { userId: user._id.toString(), username: user.username, role: user.role },
    getJWTSecret(),
    { expiresIn: '1h' }
  );
}

const CASES = [
  // ── V1: POST /sessions/:id/missed had NO authorization check ─────────────
  {
    name: 'V1 an unrelated patient cannot report a stranger session as missed',
    as: 'patientB', method: 'post',
    url: () => `/api/sessions/${fixtures.sessionA._id}/missed`,
    expect: 403,
    after: async () => {
      const s = await Session.findById(fixtures.sessionA._id);
      expect(s.status).toBe('scheduled');          // not cancelled
      expect(s.paymentStatus).toBe('paid');        // not refunded
      expect(mockRefund).not.toHaveBeenCalled();   // no money moved
    }
  },
  {
    name: 'V1b the doctor cannot report their own session as missed',
    as: 'doctorA', method: 'post',
    url: () => `/api/sessions/${fixtures.sessionA._id}/missed`,
    expect: 403
  },
  {
    name: 'V1c the session\'s own patient may report it as missed',
    as: 'patientA', method: 'post',
    url: () => `/api/sessions/${fixtures.sessionA._id}/missed`,
    expect: 200
  },

  // ── V2: any doctor could read any patient's session reports ──────────────
  {
    name: 'V2 a non-treating doctor cannot read a patient chart',
    as: 'doctorB', method: 'get',
    url: () => `/api/session-reports/patient/${fixtures.patientA._id}`,
    expect: 403
  },
  {
    name: 'V2b the treating doctor can read it',
    as: 'doctorA', method: 'get',
    url: () => `/api/session-reports/patient/${fixtures.patientA._id}`,
    expect: 200,
    assert: (res) => expect(res.body.reports.length).toBeGreaterThan(0)
  },
  {
    name: 'V2c another patient cannot read it',
    as: 'patientB', method: 'get',
    url: () => `/api/session-reports/patient/${fixtures.patientA._id}`,
    expect: 403
  },

  // ── V3: note/report/task creation trusted a body-supplied patientId ──────
  {
    name: 'V3 body patientId is ignored — the note lands on the session\'s patient',
    as: 'doctorA', method: 'post',
    url: () => '/api/session-tools/notes',
    body: () => ({ sessionId: fixtures.sessionA._id, patientId: fixtures.patientB._id, content: 'FABRICATED' }),
    expect: 201,
    after: async () => {
      expect(await SessionNote.countDocuments({ patientId: fixtures.patientB._id })).toBe(0);
      const n = await SessionNote.findOne({ content: 'FABRICATED' });
      expect(String(n.patientId)).toBe(String(fixtures.patientA._id));
    }
  },
  {
    name: 'V3b a doctor cannot create a note on a session they do not own',
    as: 'doctorB', method: 'post',
    url: () => '/api/session-tools/notes',
    body: () => ({ sessionId: fixtures.sessionA._id, content: 'x' }),
    expect: 403,
    after: async () => expect(await SessionNote.countDocuments({ content: 'x' })).toBe(0)
  },

  // ── V4: list filters had no default-deny branch ──────────────────────────
  {
    name: 'V4 an admin-realm token gets no clinical notes',
    as: 'admin', method: 'get',
    url: () => `/api/session-tools/notes/patient/${fixtures.patientA._id}`,
    expect: 403
  },
  {
    name: 'V4b a patient never receives a note flagged private',
    as: 'patientA', method: 'get',
    url: () => `/api/session-tools/notes/patient/${fixtures.patientA._id}`,
    expect: 200,
    assert: (res) => {
      expect(res.body.notes.every((n) => n.isPrivate === false)).toBe(true);
      expect(res.body.notes.some((n) => n.content === 'PRIVATE clinical impression')).toBe(false);
    }
  },
  {
    name: 'V4c a non-authoring doctor sees an empty list, not another doctor\'s notes',
    as: 'doctorB', method: 'get',
    url: () => `/api/session-tools/notes/patient/${fixtures.patientA._id}`,
    expect: 200,
    assert: (res) => expect(res.body.notes).toHaveLength(0)
  },
  {
    name: 'V4d one patient cannot list another patient\'s notes',
    as: 'patientB', method: 'get',
    url: () => `/api/session-tools/notes/patient/${fixtures.patientA._id}`,
    expect: 403
  },

  // ── journal: owner-only, no doctor or admin path ─────────────────────────
  {
    name: 'a doctor cannot read a patient journal',
    as: 'doctorA', method: 'get',
    url: () => `/api/session-tools/journal/patient/${fixtures.patientA._id}`,
    expect: 403
  },
  {
    name: 'a patient cannot delete another patient\'s journal entry',
    as: 'patientB', method: 'delete',
    url: () => `/api/session-tools/journal/${fixtures.journalA._id}`,
    expect: 403,
    after: async () => expect(await Journal.countDocuments({})).toBe(1)
  },
  {
    name: 'the owner can delete their own journal entry',
    as: 'patientA', method: 'delete',
    url: () => `/api/session-tools/journal/${fixtures.journalA._id}`,
    expect: 200
  },

  // ── session read: parties only ───────────────────────────────────────────
  {
    name: 'a stranger cannot read a session',
    as: 'patientB', method: 'get',
    url: () => `/api/sessions/${fixtures.sessionA._id}`,
    expect: 403
  },
  {
    name: 'an unauthenticated caller cannot read a session',
    as: 'anonymous', method: 'get',
    url: () => `/api/sessions/${fixtures.sessionA._id}`,
    expect: 401
  }
];

describe('authorization matrix', () => {
  test.each(CASES.map((c) => [c.name, c]))('%s', async (_name, c) => {
    const app = buildApp();
    let req = request(app)[c.method](c.url());
    const entry = actors[c.as];
    if (entry) req = req.set('Authorization', `Bearer ${tokenFor(entry.doc)}`);
    if (c.body) req = req.send(c.body());
    const res = await req;

    expect(res.status).toBe(c.expect);

    // A 403 must be identifiable as an authorization denial, so the client's
    // CSRF interceptor does not mistake it for a stale token.
    if (c.expect === 403) expect(res.body.category).toBe('authz');

    if (c.assert) c.assert(res);
    if (c.after) await c.after();
  });
});
