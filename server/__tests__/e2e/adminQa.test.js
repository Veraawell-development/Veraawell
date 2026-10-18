/**
 * The admin QA pass: each test pins a defect found by reading the admin
 * surface end to end, and fails against the code before the fix.
 */

require('../support/env');

process.env.ADMIN_ID = 'master.qa@veraawell.test';
process.env.ADMIN_PASSWORD = 'a-very-long-master-password';

const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: jest.fn().mockResolvedValue({ id: 'rfnd_qa', status: 'processed' }), fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) }
})));
// isomorphic-dompurify is ESM and cannot load under Jest. This stand-in does
// what matters here the way the real one does: with no allowed tags it strips
// them, drops <script> with its content, and returns SERIALISED text — "&"
// and "<" come back as entities, which is the behaviour the plain-text fix
// undoes. Verified against the real library outside Jest.
jest.mock('isomorphic-dompurify', () => ({
  sanitize: (value, opts = {}) => {
    const text = String(value);
    if (opts.ALLOWED_TAGS && opts.ALLOWED_TAGS.length === 0) {
      return text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    return text;
  }
}));
const mockMail = {};
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: (_t, name) => {
    if (!mockMail[name]) mockMail[name] = jest.fn().mockResolvedValue({ id: 'sink' });
    return mockMail[name];
  }
}));

let app, server, f;
let User, Session, PendingUser, Article, Review;
let adminToken, superAdminToken;

beforeAll(async () => {
  await connectDb('admin-qa');
  app = require('../../app');
  server = await startServer(app);
  User = require('../../models/user');
  Session = require('../../models/session');
  PendingUser = require('../../models/pendingUser');
  Article = require('../../models/article');
  Review = require('../../models/review');
  const { seedAll } = require('../support/seed');
  f = await seedAll();

  const jwt = require('jsonwebtoken');
  const { getAdminJWTSecret } = require('../../config/auth');
  adminToken = jwt.sign({ userId: String(f.admin._id), role: 'admin' }, getAdminJWTSecret(), { expiresIn: '1h' });
  superAdminToken = jwt.sign({ userId: String(f.superAdmin._id), role: 'super_admin' }, getAdminJWTSecret(), { expiresIn: '1h' });
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

beforeEach(() => Object.values(mockMail).forEach((fn) => fn.mockClear()));

async function csrfPair() {
  const res = await request(server).get('/api/csrf-token');
  return { csrf: res.body.csrfToken, cookie: res.headers['set-cookie'] };
}

async function call(method, path, token, body, extraCookie) {
  const { csrf, cookie } = await csrfPair();
  const cookies = [].concat(cookie || [], extraCookie ? [extraCookie] : []);
  let req = request(server)[method](path).set('Cookie', cookies).set('X-CSRF-Token', csrf);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return body === undefined ? req.send() : req.send(body);
}

const setCookies = (res) => [].concat(res.headers['set-cookie'] || []).join(';');

describe('admin accounts', () => {
  test('verifying an admin signup issues no session — the applicant waits for a super admin', async () => {
    const email = `applicant.${Date.now()}@veraawell.test`;
    const reg = await request(server).post('/api/auth/register').send({
      firstName: 'Asha', lastName: 'Rao', email, username: email, password: 'Admin@123', role: 'admin'
    });
    expect(reg.status).toBeLessThan(300);
    const otp = mockMail.sendOTPEmail.mock.calls.at(-1)[1];
    // The code email used to call every non-doctor a "Patient".
    expect(mockMail.sendOTPEmail.mock.calls.at(-1)[2]).toBe('admin');

    const verified = await request(server).post('/api/auth/verify-signup').send({ email, otp });
    expect(verified.status).toBe(200);
    expect(verified.body.requiresApproval).toBe(true);
    expect(verified.body.token).toBeUndefined();
    expect(setCookies(verified)).not.toMatch(/(^|;\s*)token=/);

    const stored = await User.findOne({ email });
    expect(stored.role).toBe('admin');
    expect(stored.approvalStatus).toBe('pending');
  });

  test('approving and rejecting an admin emails them the outcome', async () => {
    const pending = await User.create({
      firstName: 'Pen', lastName: 'Ding', email: `pending.${Date.now()}@veraawell.test`,
      username: `pending.${Date.now()}`, password: 'Admin@123', role: 'admin', approvalStatus: 'pending'
    });
    const approved = await call('post', `/api/admin/approvals/admins/${pending._id}/approve`, superAdminToken, {});
    expect(approved.status).toBe(200);
    expect(mockMail.sendAdminDecisionEmail).toHaveBeenCalledWith(pending.email, 'Pen', true);

    const other = await User.create({
      firstName: 'Re', lastName: 'Ject', email: `reject.${Date.now()}@veraawell.test`,
      username: `reject.${Date.now()}`, password: 'Admin@123', role: 'admin', approvalStatus: 'pending'
    });
    await call('post', `/api/admin/approvals/admins/${other._id}/reject`, superAdminToken, { reason: 'Unknown requester' });
    expect(mockMail.sendAdminDecisionEmail).toHaveBeenCalledWith(other.email, 'Re', false, 'Unknown requester');
  });

  test('a malformed admin id is a 400, not a 500', async () => {
    const res = await call('post', '/api/admin/approvals/admins/not-an-id/approve', superAdminToken, {});
    expect(res.status).toBe(400);
  });

  test('admin logout works with an expired session and still clears the cookie', async () => {
    const res = await call('post', '/api/admin/auth/logout', 'expired.or.invalid.token', {}, 'adminToken=expired.or.invalid.token');
    expect(res.status).toBe(200);
    expect(setCookies(res)).toMatch(/adminToken=;/);
  });

  test('admin logout with a live session records it and clears the cookie', async () => {
    const res = await call('post', '/api/admin/auth/logout', null, {}, `adminToken=${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(setCookies(res)).toMatch(/adminToken=;/);
    const res2 = await call('post', '/api/admin/auth/logout', null, {});
    expect(res2.status).toBe(200);
  });

  test('a database super admin gets the same 8-hour session as the master login', async () => {
    const email = `dbsuper.${Date.now()}@veraawell.test`;
    await User.create({ firstName: 'Db', lastName: 'Super', email, username: email, password: 'Super@12345', role: 'super_admin', approvalStatus: 'approved' });
    const res = await request(server).post('/api/admin/auth/login').send({ email, password: 'Super@12345' });
    expect(res.status).toBe(200);
    const jwt = require('jsonwebtoken');
    const { exp, iat } = jwt.decode(res.body.token);
    expect(exp - iat).toBe(8 * 3600);
  });

  test('signing out of a user account does not sign the admin out', async () => {
    const jwt = require('jsonwebtoken');
    const { getJWTSecret } = require('../../config/auth');
    const patient = jwt.sign({ userId: String(f.patientA._id), role: 'patient' }, getJWTSecret(), { expiresIn: '1h' });
    const res = await call('post', '/api/auth/logout', patient, {});
    expect(res.status).toBe(200);
    expect(setCookies(res)).not.toMatch(/adminToken=/);
  });

  test('the user-realm password reset does not work on admin accounts', async () => {
    const res = await request(server).post('/api/auth/forgot-password').send({ email: f.admin.email });
    expect(res.status).toBe(200); // same answer as for anyone, so nothing is enumerated
    expect(mockMail.sendPasswordResetEmail ? mockMail.sendPasswordResetEmail.mock.calls.length : 0).toBe(0);
  });

  test('a master ADMIN_ID that belongs to another account is a clear 409, not a 500', async () => {
    await User.create({
      firstName: 'Taken', lastName: 'Email', email: process.env.ADMIN_ID, username: 'taken.master',
      password: 'Patient@123', role: 'patient'
    });
    const res = await request(server).post('/api/admin/auth/login')
      .send({ email: process.env.ADMIN_ID, password: process.env.ADMIN_PASSWORD });
    expect(res.status).toBe(409);
    await User.deleteOne({ email: process.env.ADMIN_ID });
  });
});

describe('passwords', () => {
  test('a password that happens to start with "$2a$" is hashed like any other', async () => {
    // The hook skipped anything that looked like a bcrypt hash, so this was
    // stored in plain text and the account could never log in.
    const user = await User.create({
      firstName: 'Odd', lastName: 'Password', email: `odd.${Date.now()}@veraawell.test`,
      username: `odd.${Date.now()}`, password: '$2a$looks-like-a-hash', role: 'patient'
    });
    const stored = await User.findById(user._id).select('+password');
    expect(stored.password).not.toBe('$2a$looks-like-a-hash');
    expect(await stored.comparePassword('$2a$looks-like-a-hash')).toBe(true);
  });
});

describe('doctors', () => {
  test('a doctor with session history cannot be deleted — reject them instead', async () => {
    await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorB._id, startsAt: new Date(Date.now() + 864e5),
      duration: 55, price: 1000, status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_keep_records'
    });
    const res = await call('delete', `/api/admin/approvals/doctors/${f.doctorB._id}`, superAdminToken);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/reject/i);
    expect(await User.exists({ _id: f.doctorB._id })).toBeTruthy();
  });

  test('a rejection reason reaches the doctor', async () => {
    const doc = await User.create({
      firstName: 'New', lastName: 'Doctor', email: `newdoc.${Date.now()}@veraawell.test`,
      username: `newdoc.${Date.now()}`, password: 'Doctor@123', role: 'doctor', approvalStatus: 'pending'
    });
    await call('post', `/api/admin/approvals/doctors/${doc._id}/reject`, adminToken, { reason: 'Licence not readable' });
    expect(mockMail.sendDoctorRejectedEmail).toHaveBeenCalledWith(doc.email, 'New', 'Licence not readable');
  });
});

describe('analytics', () => {
  test('upcoming sessions are counted, and abandoned checkouts are not sessions', async () => {
    await Session.deleteMany({});
    await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id, startsAt: new Date(Date.now() + 2 * 864e5),
      duration: 55, price: 1500, status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_upcoming'
    });
    await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id, startsAt: new Date(Date.now() + 3 * 864e5),
      duration: 55, price: 1500, status: 'payment_pending', paymentStatus: 'pending', razorpayOrderId: 'order_abandoned'
    });
    const res = await call('get', '/api/admin/approvals/analytics', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.sessions.upcoming).toBe(1); // was always 0 — it filtered on a field Session does not have
    expect(res.body.sessions.total).toBe(1);
  });
});

describe('fees', () => {
  test('a blank fee is refused instead of becoming 0%', async () => {
    const res = await call('patch', '/api/admin/payments/settings/fee', superAdminToken, { defaultPlatformFeePercentage: '' });
    expect(res.status).toBe(400);
  });
});

describe('revenue', () => {
  test('a partially refunded session still counts the part the platform kept', async () => {
    await Session.deleteMany({});
    await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id, startsAt: new Date(Date.now() - 864e5),
      duration: 55, price: 1000, status: 'cancelled', paymentStatus: 'refunded', paymentId: 'pay_partial',
      refundId: 'rfnd_partial', refundAmount: 400, platformFee: 200, doctorEarnings: 800
    });
    const res = await call('get', '/api/admin/payments/revenue', superAdminToken);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).toMatch(/"totalRevenue":600/);
  });
});

describe('articles', () => {
  const base = { description: 'A short summary', content: '<p>Body <s>old</s> text</p>', category: 'Anxiety', author: 'Dr. A' };

  test('plain-text fields keep their characters instead of becoming HTML entities', async () => {
    const res = await call('post', '/api/articles/admin', superAdminToken, { ...base, title: 'Smith & Co <3 coping', status: 'draft' });
    expect(res.status).toBe(201);
    expect(res.body.article.title).toBe('Smith & Co <3 coping');
    // Strikethrough survives — the editor offers it and it used to be stripped.
    expect(res.body.article.content).toContain('<s>old</s>');
  });

  test('a title with no Latin characters still gets a reachable slug', async () => {
    const res = await call('post', '/api/articles/admin', superAdminToken, { ...base, title: 'चिंता से निपटना', status: 'draft' });
    expect(res.status).toBe(201);
    expect(res.body.article.slug).toMatch(/^article-/);
  });

  test('an archived article is not in the default admin list', async () => {
    const created = await call('post', '/api/articles/admin', superAdminToken, { ...base, title: `To archive ${Date.now()}`, status: 'draft' });
    const id = created.body.article._id;
    await call('delete', `/api/articles/admin/${id}`, superAdminToken);

    const all = await call('get', '/api/articles/admin/all', superAdminToken);
    const ids = JSON.stringify(all.body);
    expect(ids).not.toContain(id);
    const archived = await call('get', '/api/articles/admin/all?status=archived', superAdminToken);
    expect(JSON.stringify(archived.body)).toContain(id);
  });
});

describe('review moderation', () => {
  test('the admin list filters by type, and changing a status keeps the notes', async () => {
    const review = await Review.create({
      sessionId: (await Session.create({
        patientId: f.patientA._id, doctorId: f.doctorA._id, startsAt: new Date(Date.now() - 2 * 864e5),
        duration: 55, price: 1000, status: 'completed', paymentStatus: 'paid', paymentId: `pay_rev_${Date.now()}`
      }))._id,
      patientId: f.patientA._id, doctorId: f.doctorA._id, reviewType: 'platform', rating: 5,
      feedback: 'Great platform', adminNotes: 'Checked by ops'
    });

    const platform = await call('get', '/api/reviews/admin/all?reviewType=platform', adminToken);
    expect(platform.status).toBe(200);
    expect(platform.body.reviews.every((r) => r.reviewType === 'platform')).toBe(true);

    await call('patch', `/api/reviews/admin/${review._id}/status`, adminToken, { status: 'reviewed' });
    expect((await Review.findById(review._id)).adminNotes).toBe('Checked by ops');
  });
});
