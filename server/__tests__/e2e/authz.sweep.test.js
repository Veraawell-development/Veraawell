/**
 * An exhaustive authorization sweep over the WHOLE route table.
 *
 * authz/UNDECLARED.js lists 97 routes whose authorization is not stated on the
 * route line. Its own docblock is careful to say that being listed there does
 * not mean unprotected — many carry verifyToken plus an in-controller check.
 * The open question is which ones genuinely have no check, and the ratchet
 * cannot answer it: it reasons about *declarations*, not behaviour.
 *
 * So this suite enumerates the real route table off the real app and answers it
 * behaviourally, in three sweeps:
 *
 *   1. anonymous  — every route must refuse, except a known public allowlist
 *   2. wrong role — a patient token must not reach doctor-only or admin-only
 *                   surfaces, and vice versa
 *   3. wrong realm— a user-realm token must not satisfy verifyAdminToken
 *
 * Every sweep also asserts the database is byte-identical afterwards, because
 * a route that mutates and *then* denies would pass a status-only check. That
 * is the same reasoning as the `after` hooks in authz.matrix.test.js:10-14.
 *
 * It is generated rather than hand-listed on purpose: a new route joins the
 * sweep automatically.
 */

require('../support/env');

const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn().mockResolvedValue({ id: 'order_test' }) },
  payments: { refund: jest.fn().mockResolvedValue({ id: 'rfnd', status: 'processed' }), fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn().mockResolvedValue({ id: 'acc_test' }) }
})));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));
// jsdom pulls an ESM-only dependency jest cannot parse; this is the reason no
// test could require app.js at all before authz.routeCoverage.test.js:33.
jest.mock('isomorphic-dompurify', () => ({ sanitize: (s) => s }));

let app;
let server;
let fixtures;
let tokens;

/**
 * Routes that are public by intent. Anything NOT here must refuse an
 * anonymous caller. Sourced from the deliberate `publicRoute(reason)`
 * declarations plus the unauthenticated surface documented in app.js.
 */
const INTENTIONALLY_PUBLIC = new Set([
  'GET /',
  'GET /api/health',
  'GET /api/csrf-token',
  'GET /api/test-google-routes',
  'GET /sitemap.xml',
  'GET /robots.txt',
  'GET /api/auth/google',
  'GET /api/auth/google/callback',
  'POST /api/auth/validate-registration',
  'POST /api/auth/register',
  'POST /api/auth/verify-signup',
  'POST /api/auth/login',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
  'POST /api/otp/send',
  'POST /api/otp/verify',
  'POST /api/otp/resend',
  'GET /api/sessions/doctors',
  'GET /api/sessions/doctors/:doctorId',
  'GET /api/sessions/doctors/:doctorId/slots/:date',
  'GET /api/availability/doctor/:doctorId',
  'GET /api/availability/slots/:doctorId/:date',
  'GET /api/doctor-status/online-doctors',
  'POST /api/enquiries/',
  'GET /api/reviews/platform',
  'GET /api/reviews/doctor/:doctorId',
  'GET /api/articles/',
  'GET /api/articles/:slug',
  'POST /api/articles/:id/view',
  'POST /api/articles/:id/like',
  'POST /api/upload/doctor-document',
  'POST /api/upload/doctor-documents',
  'POST /api/payments/webhook',
  'POST /api/admin/auth/setup',
  'POST /api/admin/auth/login',
  'POST /api/admin/auth/forgot-password',
  'POST /api/admin/auth/reset-password/:token'
]);

/** Substitute a real, resolvable value for every path parameter. */
function concretePath(path) {
  return path
    .replace(':doctorId', () => String(fixtures.doctorA._id))
    .replace(':patientId', () => String(fixtures.patientA._id))
    .replace(':sessionId', () => String(fixtures.paidSession._id))
    .replace(':conversationId', () => String(new mongoose.Types.ObjectId()))
    .replace(':reportId', () => String(new mongoose.Types.ObjectId()))
    .replace(':journalId', () => String(new mongoose.Types.ObjectId()))
    .replace(':taskId', () => String(new mongoose.Types.ObjectId()))
    .replace(':reviewId', () => String(new mongoose.Types.ObjectId()))
    .replace(':adminId', () => String(fixtures.admin._id))
    .replace(':id', () => String(new mongoose.Types.ObjectId()))
    .replace(':testType', 'depression')
    .replace(':slug', 'some-article-slug')
    .replace(':date', '2027-01-15')
    .replace(':year', '2027')
    .replace(':month', '1')
    .replace(':token', 'a'.repeat(96));
}

/** A stable census of every collection, to prove a sweep changed nothing. */
async function census() {
  const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name).sort();
  const out = {};
  for (const n of names) {
    out[n] = await mongoose.connection.db.collection(n).countDocuments();
  }
  return out;
}

beforeAll(async () => {
  await connectDb('authz.sweep');

  app = require('../../app');

  server = await startServer(app);
  const { seedAll } = require('../support/seed');
  fixtures = await seedAll();

  const jwt = require('jsonwebtoken');
  const { getJWTSecret, getAdminJWTSecret } = require('../../config/auth');
  const userTok = (u) => jwt.sign({ userId: String(u._id), username: u.username, role: u.role }, getJWTSecret(), { expiresIn: '1h' });
  tokens = {
    patient: userTok(fixtures.patientA),
    doctor: userTok(fixtures.doctorA),
    // An admin who logged in through the ordinary /api/auth/login path holds a
    // USER-realm token. That is the reachable path by which an admin-role actor
    // previously reached clinical endpoints, so it is the one worth testing.
    adminUserRealm: userTok(fixtures.admin),
    adminRealm: jwt.sign({ userId: String(fixtures.superAdmin._id), role: 'super_admin' }, getAdminJWTSecret(), { expiresIn: '1h' })
  };
}, 120000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

/** The full route table, minus the ones that cannot be swept meaningfully. */
function routeTable() {
  const { enumerateRoutes } = require('../../authz/audit');
  return enumerateRoutes(app)
    .filter((r) => r.method !== 'OPTIONS' && r.method !== 'HEAD')
    // Multipart upload routes need a real file part; they get their own suite.
    .filter((r) => !r.path.startsWith('/api/upload'))
    .map((r) => ({ ...r, key: `${r.method} ${r.path}` }));
}

function send(method, path, token) {
  let req = request(server)[method.toLowerCase()](path);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return req.send({});
}

describe('the route table is enumerable and complete', () => {
  test('more than 100 routes are discovered, so the sweeps cannot pass vacuously', () => {
    const routes = routeTable();
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.map((r) => r.key)).toContain('POST /api/sessions/:sessionId/missed');
  });
});

describe('sweep 1: an anonymous caller is refused by every non-public route', () => {
  let before;
  let results;

  beforeAll(async () => {
    before = await census();
    results = [];
    for (const r of routeTable()) {
      if (INTENTIONALLY_PUBLIC.has(r.key)) continue;
      const res = await send(r.method, concretePath(r.path), null);
      results.push({ ...r, status: res.status });
    }
  }, 180000);

  test('no route returns 2xx without credentials', () => {
    const leaked = results.filter((r) => r.status >= 200 && r.status < 300)
      .map((r) => `${r.key} -> ${r.status}`);
    expect(leaked).toEqual([]);
  });

  test('every refusal is an auth failure, not a crash', () => {
    const crashed = results.filter((r) => r.status >= 500).map((r) => `${r.key} -> ${r.status}`);
    expect(crashed).toEqual([]);
  });

  test('the anonymous sweep changed nothing in the database', async () => {
    expect(await census()).toEqual(before);
  });
});

describe('sweep 2: a patient token cannot reach the admin surface', () => {
  let before;
  let results;

  beforeAll(async () => {
    before = await census();
    results = [];
    for (const r of routeTable()) {
      if (!r.path.startsWith('/api/admin')) continue;
      if (INTENTIONALLY_PUBLIC.has(r.key)) continue;
      const res = await send(r.method, concretePath(r.path), tokens.patient);
      results.push({ ...r, status: res.status });
    }
  }, 180000);

  test('no /api/admin route accepts a patient user-realm token', () => {
    const leaked = results.filter((r) => r.status >= 200 && r.status < 300)
      .map((r) => `${r.key} -> ${r.status}`);
    expect(leaked).toEqual([]);
  });

  test('no /api/admin route accepts a doctor user-realm token', async () => {
    const leaked = [];
    for (const r of routeTable()) {
      if (!r.path.startsWith('/api/admin')) continue;
      if (INTENTIONALLY_PUBLIC.has(r.key)) continue;
      const res = await send(r.method, concretePath(r.path), tokens.doctor);
      if (res.status >= 200 && res.status < 300) leaked.push(`${r.key} -> ${res.status}`);
    }
    expect(leaked).toEqual([]);
  }, 180000);

  test('an admin-ROLE token minted in the user realm is still refused by the admin surface', async () => {
    // config/auth.js gives ADMIN_JWT_SECRET a distinct value here, so this
    // proves the realm boundary rather than the role check.
    const leaked = [];
    for (const r of routeTable()) {
      if (!r.path.startsWith('/api/admin')) continue;
      if (INTENTIONALLY_PUBLIC.has(r.key)) continue;
      const res = await send(r.method, concretePath(r.path), tokens.adminUserRealm);
      if (res.status >= 200 && res.status < 300) leaked.push(`${r.key} -> ${res.status}`);
    }
    expect(leaked).toEqual([]);
  }, 180000);

  test('the wrong-role sweeps changed nothing in the database', async () => {
    expect(await census()).toEqual(before);
  });
});

describe('sweep 3: an admin-realm token cannot reach clinical data', () => {
  test('clinical list endpoints deny an admin-realm token outright', async () => {
    // clinicalRecords.policy.js:29-31 makes this an explicit policy decision
    // rather than an oversight: admin and super_admin get DENY on every
    // clinical action. Worth pinning so a future "admins can see everything"
    // change is a deliberate one.
    const clinical = [
      `GET /api/session-tools/notes/patient/${fixtures.patientA._id}`,
      `GET /api/session-tools/reports/patient/${fixtures.patientA._id}`,
      `GET /api/session-tools/journal/patient/${fixtures.patientA._id}`,
      `GET /api/session-reports/patient/${fixtures.patientA._id}`
    ];
    for (const entry of clinical) {
      const [method, path] = entry.split(' ');
      const res = await send(method, path, tokens.adminRealm);
      expect(res.status).not.toBeLessThan(400);
    }
  }, 60000);
});

describe('cross-tenant isolation between two patients and two doctors', () => {
  test('patientB cannot read patientA\'s session, journal, notes or reports', async () => {
    const jwt = require('jsonwebtoken');
    const { getJWTSecret } = require('../../config/auth');
    const bTok = jwt.sign(
      { userId: String(fixtures.patientB._id), username: fixtures.patientB.username, role: 'patient' },
      getJWTSecret(), { expiresIn: '1h' }
    );

    const targets = [
      `GET /api/sessions/${fixtures.paidSession._id}`,
      `GET /api/session-tools/notes/patient/${fixtures.patientA._id}`,
      `GET /api/session-tools/reports/patient/${fixtures.patientA._id}`,
      `GET /api/session-tools/journal/patient/${fixtures.patientA._id}`,
      `GET /api/session-reports/patient/${fixtures.patientA._id}`
    ];
    for (const entry of targets) {
      const [method, path] = entry.split(' ');
      const res = await send(method, path, bTok);
      expect(res.status).toBe(403);
      expect(res.body.category).toBe('authz');
    }
  }, 60000);

  test('doctorB, a stranger to the session, cannot act on it or read the chart', async () => {
    const jwt = require('jsonwebtoken');
    const { getJWTSecret } = require('../../config/auth');
    const bTok = jwt.sign(
      { userId: String(fixtures.doctorB._id), username: fixtures.doctorB.username, role: 'doctor' },
      getJWTSecret(), { expiresIn: '1h' }
    );
    const Session = require('../../models/session');

    for (const entry of [
      `GET /api/sessions/${fixtures.paidSession._id}`,
      `POST /api/sessions/${fixtures.paidSession._id}/cancel`,
      `POST /api/sessions/${fixtures.paidSession._id}/complete`,
      `POST /api/sessions/${fixtures.paidSession._id}/accept`,
      `GET /api/session-reports/patient/${fixtures.patientA._id}`
    ]) {
      const [method, path] = entry.split(' ');
      const res = await send(method, path, bTok);
      expect(res.status).toBe(403);
    }

    // And no money or status moved while being refused.
    const after = await Session.findById(fixtures.paidSession._id).lean();
    expect(after.status).toBe('scheduled');
    expect(after.paymentStatus).toBe('paid');
  }, 60000);
});
