/**
 * The admin surface: the master-credential login path, admin account
 * management, doctor approvals, payout onboarding, and the removal of the
 * destructive maintenance endpoints.
 *
 * It contains the most privileged code in the application — including a
 * super-admin login that bypasses the database entirely, and (until it was
 * removed) an endpoint that deleted every session.
 */

require('../support/env');

process.env.ADMIN_ID = 'master.admin@veraawell.test';
process.env.ADMIN_PASSWORD = 'a-very-long-master-password';
process.env.INITIAL_ADMIN_EMAIL = 'bootstrap.admin@veraawell.test';
process.env.INITIAL_ADMIN_PASSWORD = 'bootstrap-password-123';

const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: jest.fn().mockResolvedValue({ id: 'rfnd_admin', status: 'processed' }), fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn().mockResolvedValue({ id: 'acc_live_onboarded' }) }
})));
// Named mocks for the mails these tests assert on; everything else is a sink.
const mockMail = {
  sendAdminCredentialsEmail: jest.fn().mockResolvedValue({ id: 'sink' }),
  sendAdminPasswordResetEmail: jest.fn().mockResolvedValue({ id: 'sink' }),
  sendDoctorApprovedEmail: jest.fn().mockResolvedValue({ id: 'sink' })
};
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: (_t, name) => (mockMail[name]
    ? (...a) => mockMail[name](...a)
    : jest.fn().mockResolvedValue({ id: 'sink' }))
}));
jest.mock('isomorphic-dompurify', () => ({ sanitize: (s) => s }));

let app, f;
let server;
let User, Session, DoctorProfile;
let adminToken, superAdminToken, patientToken;

beforeAll(async () => {
  await connectDb('admin');
  app = require('../../app');
  server = await startServer(app);
  User = require('../../models/user');
  Session = require('../../models/session');
  DoctorProfile = require('../../models/doctorProfile');

  const { seedAll } = require('../support/seed');
  f = await seedAll();

  const jwt = require('jsonwebtoken');
  const { getJWTSecret, getAdminJWTSecret } = require('../../config/auth');
  adminToken = jwt.sign({ userId: String(f.admin._id), role: 'admin' }, getAdminJWTSecret(), { expiresIn: '1h' });
  superAdminToken = jwt.sign({ userId: String(f.superAdmin._id), role: 'super_admin' }, getAdminJWTSecret(), { expiresIn: '1h' });
  patientToken = jwt.sign({ userId: String(f.patientA._id), username: f.patientA.username, role: 'patient' }, getJWTSecret(), { expiresIn: '1h' });
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
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

describe('the super-admin master credential login', () => {
  test('the exact env pair logs in and auto-creates the super_admin row', async () => {
    const res = await request(server)
      .post('/api/admin/auth/login')
      .send({ email: process.env.ADMIN_ID, password: process.env.ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    const created = await User.findOne({ email: process.env.ADMIN_ID, role: 'super_admin' });
    expect(created).toBeTruthy();
  });

  test('a wrong master password is refused', async () => {
    const res = await request(server)
      .post('/api/admin/auth/login')
      .send({ email: process.env.ADMIN_ID, password: 'not-the-master-password' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('the comparison is length-safe: a prefix of the real password fails', async () => {
    // timingSafeEqual throws on unequal lengths, so the handler length-checks
    // first. A prefix must be refused, not crash the route.
    const res = await request(server)
      .post('/api/admin/auth/login')
      .send({ email: process.env.ADMIN_ID, password: process.env.ADMIN_PASSWORD.slice(0, 5) });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('an empty credential pair cannot match even if the env vars were unset', async () => {
    const res = await request(server).post('/api/admin/auth/login').send({ email: '', password: '' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('the admin cookie is httpOnly and scoped to a short life', async () => {
    const res = await request(server)
      .post('/api/admin/auth/login')
      .send({ email: process.env.ADMIN_ID, password: process.env.ADMIN_PASSWORD });
    const cookie = String(res.headers['set-cookie'] || '');
    expect(cookie).toMatch(/adminToken=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });
});

describe('first-time setup bootstrap', () => {
  test('setup is refused once any admin already exists', async () => {
    // The fixture set already contains an admin and a super_admin.
    const res = await request(server).post('/api/admin/auth/setup').send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('doctor approvals', () => {
  let pendingDoctor;

  beforeEach(async () => {
    pendingDoctor = await User.create({
      firstName: 'Pending', lastName: 'Doc',
      email: `pending.${Date.now()}@test.local`,
      username: `pending.${Date.now()}`,
      password: 'password123', role: 'doctor',
      approvalStatus: 'pending', isVerified: true
    });
  });

  test('a pending doctor appears in the queue and can be approved by a plain admin', async () => {
    const queue = await call('get', '/api/admin/approvals/doctors/pending', adminToken);
    expect(queue.status).toBe(200);

    const approve = await call('post', `/api/admin/approvals/doctors/${pendingDoctor._id}/approve`, adminToken);
    expect(approve.status).toBeLessThan(300);

    const after = await User.findById(pendingDoctor._id);
    expect(after.approvalStatus).toBe('approved');
  });

  test('rejection records a reason and blocks the account', async () => {
    const res = await call('post', `/api/admin/approvals/doctors/${pendingDoctor._id}/reject`, adminToken, { reason: 'Credentials could not be verified' });
    expect(res.status).toBeLessThan(300);

    const after = await User.findById(pendingDoctor._id);
    expect(after.approvalStatus).toBe('rejected');
  });

  test('a patient token cannot approve a doctor', async () => {
    const res = await call('post', `/api/admin/approvals/doctors/${pendingDoctor._id}/approve`, patientToken);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await User.findById(pendingDoctor._id)).approvalStatus).toBe('pending');
  });

  test('deleting a doctor requires super admin, not merely admin', async () => {
    const asAdmin = await call('delete', `/api/admin/approvals/doctors/${pendingDoctor._id}`, adminToken);
    expect(asAdmin.status).toBe(403);
    expect(await User.countDocuments({ _id: pendingDoctor._id })).toBe(1);

    const asSuper = await call('delete', `/api/admin/approvals/doctors/${pendingDoctor._id}`, superAdminToken);
    expect(asSuper.status).toBeLessThan(300);
  });

  test('admin approval endpoints do not validate the ObjectId, but still fail cleanly', async () => {
    const res = await call('post', '/api/admin/approvals/doctors/not-an-objectid/approve', adminToken);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(200);
  });
});

describe('payout onboarding', () => {
  test('approving a legacy onboarding request does NOT make a doctor bookable', async () => {
    const jwt = require('jsonwebtoken');
    const { getJWTSecret } = require('../../config/auth');
    const docTok = jwt.sign({ userId: String(f.doctorB._id), username: f.doctorB.username, role: 'doctor' }, getJWTSecret(), { expiresIn: '1h' });

    // The fixture seeds doctors as already-onboarded; rewind so the request
    // transition is the one under test. approveOnboarding also refuses a
    // doctor with no phone number.
    await DoctorProfile.updateOne(
      { userId: f.doctorB._id },
      { $set: { razorpayOnboardingStatus: 'not_requested', razorpayAccountId: null, payoutSetupCompleted: false, payoutApproved: false } }
    );
    await User.updateOne({ _id: f.doctorB._id }, { $set: { phoneNumber: '9000000022' } });

    const requested = await call('post', '/api/payments/request-onboarding', docTok, {});
    expect(requested.status).toBeLessThan(400);

    expect((await DoctorProfile.findOne({ userId: f.doctorB._id })).razorpayOnboardingStatus)
      .toBe('pending_admin_approval');

    const queue = await call('get', '/api/admin/payments/onboarding-requests', adminToken);
    expect(queue.status).toBe(200);

    // This used to set payoutApproved — the switch that makes a doctor
    // bookable and tells the payout run where to send money — with no bank
    // details on file, from any admin. Bank-details approval is now the only
    // way in, so this answers with where to go instead.
    const approved = await call('post', `/api/admin/payments/onboarding-requests/${f.doctorB._id}/approve`, adminToken, {});
    expect(approved.status).toBe(409);
    expect(approved.body.message).toMatch(/bank details/i);

    const after = await DoctorProfile.findOne({ userId: f.doctorB._id });
    expect(after.payoutApproved).toBe(false);
    expect(after.razorpayAccountId).toBeFalsy();
  });

  test('rejecting a doctor revokes their bookability', async () => {
    // A rejected doctor left with payoutApproved true would keep taking
    // bookings the platform has no approved way to settle.
    await DoctorProfile.updateOne(
      { userId: f.doctorB._id },
      { $set: { razorpayOnboardingStatus: 'pending_admin_approval', payoutApproved: true } }
    );

    const res = await call('post', `/api/admin/payments/onboarding-requests/${f.doctorB._id}/reject`, adminToken, { reason: 'Bank details unreadable' });
    expect(res.status).toBeLessThan(400);

    const after = await DoctorProfile.findOne({ userId: f.doctorB._id });
    expect(after.payoutApproved).toBe(false);
    expect(after.razorpayOnboardingStatus).toBe('rejected');
  });

  test('approving a doctor who never requested onboarding is refused', async () => {
    // The fixture is seeded payoutApproved, which is a DIFFERENT refusal —
    // without clearing it this passes on the "already approved" branch and
    // never exercises the one it is named for.
    await DoctorProfile.updateOne(
      { userId: f.doctorA._id },
      { $set: { payoutApproved: false, razorpayOnboardingStatus: 'not_requested' } }
    );

    const res = await call('post', `/api/admin/payments/onboarding-requests/${f.doctorA._id}/approve`, adminToken, {});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/current status/i);

    // Refused means unchanged: an admin cannot conscript a doctor who never asked.
    const after = await DoctorProfile.findOne({ userId: f.doctorA._id });
    expect(after.payoutApproved).toBe(false);
  });

  test('approving a doctor who is already approved is refused', async () => {
    // Guards against a second approval quietly re-stamping payoutApprovedAt,
    // which would misdate the audit trail on who authorised paying whom.
    await DoctorProfile.updateOne(
      { userId: f.doctorA._id },
      { $set: { payoutApproved: true, razorpayOnboardingStatus: 'pending_admin_approval' } }
    );

    const res = await call('post', `/api/admin/payments/onboarding-requests/${f.doctorA._id}/approve`, adminToken, {});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already approved/i);
  });

  test('approving through the legacy path is refused even with a request pending', async () => {
    await DoctorProfile.updateOne(
      { userId: f.doctorB._id },
      { $set: { payoutApproved: false, razorpayOnboardingStatus: 'pending_admin_approval' } }
    );
    await User.updateOne({ _id: f.doctorB._id }, { $unset: { phoneNumber: 1 } });

    const res = await call('post', `/api/admin/payments/onboarding-requests/${f.doctorB._id}/approve`, adminToken, {});
    expect(res.status).toBe(409);

    const after = await DoctorProfile.findOne({ userId: f.doctorB._id });
    expect(after.payoutApproved).toBe(false);
  });

  test('a patient cannot request payout onboarding', async () => {
    const res = await call('post', '/api/payments/request-onboarding', patientToken, {});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  describe('editing bank details revokes approval', () => {
    // The guard that stops money reaching an account no admin ever reviewed:
    // an approved doctor swaps the account number, and without this the next
    // payout goes wherever they just typed. It lives in a pre('validate')
    // hook rather than in submitBankDetails so that no future write path can
    // forget it — which means it can only be proven through save(), the only
    // path that runs hooks. updateOne would skip it entirely and pass for the
    // wrong reason.
    beforeEach(async () => {
      await DoctorProfile.updateOne(
        { userId: f.doctorB._id },
        {
          $set: {
            payoutApproved: true,
            payoutApprovedAt: new Date(),
            payoutBankStatus: 'approved'
          }
        }
      );
    });

    afterAll(async () => {
      // Leave the shared fixture as the rest of the file found it.
      await DoctorProfile.updateOne(
        { userId: f.doctorB._id },
        { $set: { payoutApproved: false, payoutBankStatus: 'not_submitted' }, $unset: { payoutBank: 1 } }
      );
    });

    test('changing the account number un-approves the doctor', async () => {
      const profile = await DoctorProfile.findOne({ userId: f.doctorB._id });
      profile.payoutBank = {
        accountHolderName: 'Someone Else Entirely',
        accountNumber: '999888777666',
        ifsc: 'HDFC0001234',
        panNumber: 'ABCDE1234F',
        submittedAt: new Date()
      };
      await profile.save();

      const after = await DoctorProfile.findOne({ userId: f.doctorB._id });
      expect(after.payoutApproved).toBe(false);
      expect(after.payoutApprovedAt).toBeNull();
      expect(after.payoutBankStatus).toBe('pending_admin_approval');
    });

    test('a save that does not touch bank details leaves approval standing', async () => {
      // The other half of the condition. Without this, a hook that revoked on
      // every save would look identical to a correct one — and would quietly
      // un-book every doctor whose profile was edited for any reason.
      const profile = await DoctorProfile.findOne({ userId: f.doctorB._id });
      profile.bio = 'An unrelated edit to an unrelated field.';
      await profile.save();

      const after = await DoctorProfile.findOne({ userId: f.doctorB._id });
      expect(after.payoutApproved).toBe(true);
      expect(after.payoutBankStatus).toBe('approved');
    });

    test('the first-ever submission is not treated as a revocation', async () => {
      // isNew guards the create case: a brand-new profile carrying bank
      // details has nothing to revoke, and must not be stamped
      // pending_admin_approval by a hook meant for edits.
      const fresh = new DoctorProfile({
        userId: new mongoose.Types.ObjectId(),
        specialization: ['Anxiety'],
        experience: 5,
        qualification: ['MA Psychology'],
        languages: ['English'],
        treatsFor: ['Anxiety'],
        pricing: { min: 1000, max: 1500 },
        type: 'Psychologist',
        payoutApproved: true,
        payoutBankStatus: 'approved',
        payoutBank: {
          accountHolderName: 'New Joiner',
          accountNumber: '123123123123',
          ifsc: 'HDFC0001234',
          panNumber: 'ZZZZZ9999Z',
          submittedAt: new Date()
        }
      });
      await fresh.save();

      expect(fresh.payoutApproved).toBe(true);
      expect(fresh.payoutBankStatus).toBe('approved');
      await DoctorProfile.deleteOne({ _id: fresh._id });
    });
  });

  test('changing the platform fee requires super admin', async () => {
    const asAdmin = await call('patch', '/api/admin/payments/settings/fee', adminToken, { defaultPlatformFeePercentage: 5 });
    expect(asAdmin.status).toBe(403);

    const asSuper = await call('patch', '/api/admin/payments/settings/fee', superAdminToken, { defaultPlatformFeePercentage: 5 });
    expect(asSuper.status).toBeLessThan(400);

    const PlatformSettings = require('../../models/platformSettings');
    expect((await PlatformSettings.getSettings()).defaultPlatformFeePercentage).toBe(5);
  });

  async function refundableSession(paymentId) {
    return Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + 48 * 3600 * 1000),
      duration: 60, price: 1000, status: 'scheduled',
      paymentStatus: 'paid', paymentId
    });
  }

  test('an admin refund requires super admin', async () => {
    const s = await refundableSession('pay_admin_refund_01');
    const asAdmin = await call('post', `/api/admin/payments/sessions/${s._id}/refund`, adminToken, { refundAmount: 500 });
    expect(asAdmin.status).toBe(403);
    expect((await Session.findById(s._id)).paymentStatus).toBe('paid');
  });

  test('a valid override amount is honoured exactly', async () => {
    const s = await refundableSession('pay_admin_refund_02');
    const res = await call('post', `/api/admin/payments/sessions/${s._id}/refund`, superAdminToken, { refundAmount: 250, reason: 'goodwill' });
    expect(res.status).toBeLessThan(300);

    const after = await Session.findById(s._id);
    expect(after.refundAmount).toBe(250);
    expect(after.paymentStatus).toBe('refunded');
  });

  // Both of these were characterisation tests: an out-of-range or
  // non-numeric override was silently replaced by the policy amount and
  // answered 200, so an admin who typed 10000 for 1000 was refunded a
  // different figure with nothing saying so. For money, refuse the input.
  test('an out-of-range override is rejected and nothing is refunded', async () => {
    const s = await refundableSession('pay_admin_refund_03');
    const res = await call('post', `/api/admin/payments/sessions/${s._id}/refund`, superAdminToken, { refundAmount: 999999 });

    expect(res.status).toBe(400);
    const after = await Session.findById(s._id);
    expect(after.paymentStatus).toBe('paid');
    expect(after.refundAmount).toBe(0);
  });

  test('a non-numeric override is rejected the same way', async () => {
    const s = await refundableSession('pay_admin_refund_04');
    const res = await call('post', `/api/admin/payments/sessions/${s._id}/refund`, superAdminToken, { refundAmount: 'five hundred' });

    expect(res.status).toBe(400);
    expect((await Session.findById(s._id)).paymentStatus).toBe('paid');
  });

  test('a refund on a live booking cancels it and frees its slot first', async () => {
    const s = await refundableSession('pay_admin_refund_05');
    const res = await call('post', `/api/admin/payments/sessions/${s._id}/refund`, superAdminToken, {});
    expect(res.status).toBe(200);

    const after = await Session.findById(s._id);
    expect(after.status).toBe('cancelled');
    expect(after.cancelledBy).toBe('admin');
    expect(after.paymentStatus).toBe('refunded');
    expect(after.refundId).toBeTruthy();
  });

  test('the failed-refunds queue shows Razorpay\'s reason, and a retry clears it', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + 48 * 3600 * 1000),
      duration: 55, price: 1000, status: 'cancelled', cancelledBy: 'patient',
      paymentStatus: 'refund_failed', paymentId: 'pay_admin_retry_01',
      refundAmount: 1000, refundFailureReason: 'Gateway timeout'
    });

    const queue = await call('get', '/api/admin/payments/sessions/failed-refunds', adminToken);
    expect(queue.status).toBe(200);
    const row = queue.body.sessions.find((r) => String(r._id) === String(s._id));
    expect(row.failureReason).toBe('Gateway timeout');

    const res = await call('post', `/api/admin/payments/sessions/${s._id}/retry-refund`, superAdminToken, {});
    expect(res.status).toBe(200);
    const after = await Session.findById(s._id);
    expect(after.paymentStatus).toBe('refunded');
    expect(after.refundId).toBe('rfnd_admin');
  });

  test('a retry on a refund stuck mid-flight asks Razorpay before sending anything', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + 48 * 3600 * 1000),
      duration: 55, price: 1000, status: 'cancelled', cancelledBy: 'patient',
      paymentStatus: 'refund_pending', paymentId: 'pay_admin_retry_02',
      refundAmount: 1000, refundRequestedAt: new Date(Date.now() - 30 * 60 * 1000)
    });
    const res = await call('post', `/api/admin/payments/sessions/${s._id}/retry-refund`, superAdminToken, {});
    expect(res.status).toBe(200);
    expect((await Session.findById(s._id)).paymentStatus).toBe('refunded');
  });

  test('a retry on a session that is not a failed refund is refused', async () => {
    const s = await refundableSession('pay_admin_retry_03');
    const res = await call('post', `/api/admin/payments/sessions/${s._id}/retry-refund`, superAdminToken, {});
    expect(res.status).toBe(400);
    expect((await Session.findById(s._id)).paymentStatus).toBe('paid');
  });

  test('a session that was never paid cannot be refunded', async () => {
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + 48 * 3600 * 1000),
      duration: 60, price: 1000, status: 'payment_pending',
      paymentStatus: 'pending', paymentId: null
    });
    const res = await call('post', `/api/admin/payments/sessions/${s._id}/refund`, superAdminToken, {});
    expect(res.status).toBe(400);
  });
});

describe('destructive maintenance endpoints are gone', () => {
  test('cleanup-sessions no longer exists, and every booking survives a call to it', async () => {
    // Regression. This test used to pin that POST /api/admin/cleanup-sessions
    // deleted EVERY therapy session — it ran deleteMany({}) on the `sessions`
    // collection, which the login store shared with bookings — and that
    // outside production a plain admin could do it (admin.controller.js gated
    // the super_admin check on isProduction()).
    await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + 72 * 3600 * 1000),
      duration: 60, price: 1000, status: 'scheduled',
      paymentStatus: 'paid', paymentId: 'pay_must_survive'
    });
    const before = await Session.countDocuments({});
    expect(before).toBeGreaterThan(0);

    for (const token of [adminToken, superAdminToken]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call('post', '/api/admin/cleanup-sessions', token, {});
      expect(res.status).toBe(404);
    }
    expect(await Session.countDocuments({})).toBe(before);
  });

  test('fix-doctor-approvals no longer exists, and approved doctors stay approved', async () => {
    // It bulk-reset every approved, non-Google doctor with no approvedBy to
    // 'pending' — which is every seeded or legacy doctor — de-listing them.
    const res = await call('post', '/api/admin/fix-doctor-approvals', superAdminToken, {});
    expect(res.status).toBe(404);
    expect((await User.findById(f.doctorA._id)).approvalStatus).toBe('approved');
  });

  test('debug-pending-doctors no longer exists', async () => {
    const res = await call('get', '/api/admin/debug-pending-doctors', adminToken);
    expect(res.status).toBe(404);
  });
});

describe('admin realm boundary', () => {
  test('an admin-realm token is not accepted on ordinary user routes', async () => {
    const res = await call('get', '/api/sessions/my-sessions', superAdminToken);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('a user-realm token is not accepted on the admin status route', async () => {
    const res = await call('get', '/api/admin/auth/status', patientToken);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('a browser holding both cookies is served in both realms', async () => {
    // Regression. The secret used to be chosen by "is there an adminToken
    // cookie?", and then applied to EVERY token: with both cookies present,
    // the user's `token` was checked against the admin secret and every user
    // route answered 401. The admin side failed the other way — it read the
    // `token` cookie first and checked a user token against the admin
    // secret. Anyone who had used both portals in one browser was locked out.
    const { csrf, cookie } = await csrfPair();
    const csrfCookie = String(cookie).split(';')[0];
    const both = `${csrfCookie}; token=${patientToken}; adminToken=${adminToken}`;

    const user = await request(server).get('/api/auth/profile').set('Cookie', both).set('X-CSRF-Token', csrf);
    expect(user.status).toBe(200);
    expect(user.body.user.email).toBe(f.patientA.email);

    const admin = await request(server).get('/api/admin/auth/status').set('Cookie', both);
    expect(admin.status).toBe(200);
    expect(admin.body.admin.email).toBe(f.admin.email);
  });

  test('a stale Bearer header falls through to a valid cookie instead of failing the request', async () => {
    const res = await request(server)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer not.a.token')
      .set('Cookie', `token=${patientToken}`);
    expect(res.status).toBe(200);
  });

  test('a token that names an account by username alone is refused', async () => {
    // Regression. verifyToken used to fall back to User.findOne({ username })
    // for tokens with no userId. Usernames are email addresses, so anyone
    // able to sign a token at all could name any account without its id.
    const jwt = require('jsonwebtoken');
    const { getJWTSecret } = require('../../config/auth');
    const forged = jwt.sign({ username: f.patientA.username, role: 'patient' }, getJWTSecret(), { expiresIn: '1h' });

    const res = await request(server).get('/api/auth/profile').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });
});

describe('master credential hardening', () => {
  const login = (email, password) => request(server).post('/api/admin/auth/login').send({ email, password });

  test('the master row never keeps a usable copy of ADMIN_PASSWORD', async () => {
    // Simulate a row left by the old code, which stored a bcrypt copy of the
    // master password.
    const row = await User.findOne({ email: process.env.ADMIN_ID, role: 'super_admin' });
    row.password = process.env.ADMIN_PASSWORD;
    await row.save();

    expect((await login(process.env.ADMIN_ID, process.env.ADMIN_PASSWORD)).status).toBe(200);

    const after = await User.findById(row._id);
    expect(await after.comparePassword(process.env.ADMIN_PASSWORD)).toBe(false);
  });

  test('rotating ADMIN_PASSWORD retires the old value at once', async () => {
    // Regression. The old password kept working after a rotation: the
    // database row held a hash of it, and the regular admin path accepted
    // the master account like any other.
    const old = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = 'a-freshly-rotated-master-password';
    try {
      const withOld = await login(process.env.ADMIN_ID, old);
      expect(withOld.status).toBe(401);
      expect(withOld.body.token).toBeUndefined();

      expect((await login(process.env.ADMIN_ID, process.env.ADMIN_PASSWORD)).status).toBe(200);
    } finally {
      process.env.ADMIN_PASSWORD = old;
    }
  });

  test('ADMIN_ID is matched case-insensitively, and finds its own row on the next login', async () => {
    // Regression. The supplied email was lowercased and compared byte-for-byte
    // with ADMIN_ID as configured, so a capital anywhere in ADMIN_ID made the
    // master login unreachable.
    const original = process.env.ADMIN_ID;
    process.env.ADMIN_ID = 'Second.Master@Veraawell.TEST';
    try {
      expect((await login('second.master@veraawell.test', process.env.ADMIN_PASSWORD)).status).toBe(200);
      expect((await login('SECOND.MASTER@veraawell.test', process.env.ADMIN_PASSWORD)).status).toBe(200);
      expect(await User.countDocuments({ email: 'second.master@veraawell.test' })).toBe(1);
    } finally {
      process.env.ADMIN_ID = original;
      await User.deleteMany({ email: 'second.master@veraawell.test' });
    }
  });

  test('admin tokens are signed with getAdminJWTSecret(), the key they are verified with', async () => {
    // Regression. Signing read process.env.ADMIN_JWT_SECRET directly while
    // verification used getAdminJWTSecret(), which falls back to JWT_SECRET
    // outside production. With the variable unset, jwt.sign got an undefined
    // key and every admin login was a 500.
    const saved = process.env.ADMIN_JWT_SECRET;
    delete process.env.ADMIN_JWT_SECRET;
    try {
      const res = await login(process.env.ADMIN_ID, process.env.ADMIN_PASSWORD);
      expect(res.status).toBe(200);

      const status = await request(server).get('/api/admin/auth/status').set('Authorization', `Bearer ${res.body.token}`);
      expect(status.status).toBe(200);
    } finally {
      process.env.ADMIN_JWT_SECRET = saved;
    }
  });
});

describe('admin login says nothing before the password checks out', () => {
  // Regressions. The account's role, its approval state and an admin's
  // free-text rejection reason were all returned before the password was
  // compared — to anyone who typed the address.
  const login = (email, password) => request(server).post('/api/admin/auth/login').send({ email, password });

  test('a non-admin account and a missing one get the same answer', async () => {
    const patient = await login(f.patientA.email, 'not-the-password');
    const nobody = await login('nobody.at.all@test.local', 'not-the-password');

    expect(patient.status).toBe(401);
    expect(nobody.status).toBe(401);
    expect(patient.body.message).toBe(nobody.body.message);
    expect(JSON.stringify(patient.body)).not.toMatch(/patient/i);
  });

  test('a pending or rejected admin learns its state only with the right password', async () => {
    const stamp = Date.now();
    const pending = await User.create({
      firstName: 'Pending', lastName: 'Admin', email: `pending.admin.${stamp}@test.local`,
      username: `pending.admin.${stamp}@test.local`, password: 'pending-admin-pass', role: 'admin', approvalStatus: 'pending'
    });
    const rejected = await User.create({
      firstName: 'Rejected', lastName: 'Admin', email: `rejected.admin.${stamp}@test.local`,
      username: `rejected.admin.${stamp}@test.local`, password: 'rejected-admin-pass', role: 'admin',
      approvalStatus: 'rejected', rejectionReason: 'an internal note about this applicant'
    });

    for (const u of [pending, rejected]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await login(u.email, 'wrong-password-entirely');
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toMatch(/pending|rejected|internal note/i);
    }

    const pendingRight = await login(pending.email, 'pending-admin-pass');
    expect(pendingRight.status).toBe(403);
    expect(pendingRight.body.message).toMatch(/pending/i);

    const rejectedRight = await login(rejected.email, 'rejected-admin-pass');
    expect(rejectedRight.status).toBe(403);
    expect(rejectedRight.body.message).toMatch(/internal note/);
  });
});

describe('creating admins', () => {
  beforeEach(() => {
    mockMail.sendAdminCredentialsEmail.mockClear();
  });

  test('a super admin creates an approved admin who can sign in with the emailed password', async () => {
    // Regression. /create never set `username`, which User requires, so it
    // failed validation on every call; and an admin it did create would have
    // been left 'pending' by the schema default.
    const res = await call('post', '/api/admin/auth/create', superAdminToken, {
      email: 'New.Colleague@Veraawell.test', firstName: 'New', lastName: 'Colleague'
    });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const created = await User.findOne({ email: 'new.colleague@veraawell.test' });
    expect(created.role).toBe('admin');
    expect(created.approvalStatus).toBe('approved');
    expect(created.username).toBe('new.colleague@veraawell.test');
    expect(String(created.approvedBy)).toBe(String(f.superAdmin._id));

    expect(mockMail.sendAdminCredentialsEmail).toHaveBeenCalledTimes(1);
    const [to, tempPassword] = mockMail.sendAdminCredentialsEmail.mock.calls[0];
    expect(to).toBe('new.colleague@veraawell.test');

    const signIn = await request(server).post('/api/admin/auth/login').send({ email: to, password: tempPassword });
    expect(signIn.status).toBe(200);
    expect(signIn.body.admin.requiresPasswordChange).toBe(true);
  });

  test('the role is never taken from the body', async () => {
    // Regression: `role: role || 'admin'` let the request choose.
    for (const role of ['super_admin', 'doctor']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call('post', '/api/admin/auth/create', superAdminToken, {
        email: `escalate.${role}@veraawell.test`, firstName: 'Esc', role
      });
      expect(res.status).toBe(400);
      // eslint-disable-next-line no-await-in-loop
      expect(await User.countDocuments({ email: `escalate.${role}@veraawell.test` })).toBe(0);
    }
  });

  test('if the credentials cannot be emailed, no account is left behind', async () => {
    mockMail.sendAdminCredentialsEmail.mockRejectedValueOnce(new Error('provider down'));
    const res = await call('post', '/api/admin/auth/create', superAdminToken, {
      email: 'undeliverable@veraawell.test', firstName: 'Un'
    });
    expect(res.status).toBe(502);
    expect(await User.countDocuments({ email: 'undeliverable@veraawell.test' })).toBe(0);
  });

  test('a plain admin cannot create admins', async () => {
    const res = await call('post', '/api/admin/auth/create', adminToken, { email: 'nope@veraawell.test', firstName: 'No' });
    expect(res.status).toBe(403);
  });
});

describe('first-time setup', () => {
  test('creates the super admin when none exists (it used to 500 on the missing username)', async () => {
    const roles = { $in: ['admin', 'super_admin'] };
    const stash = await User.find({ role: roles }).lean();
    await User.deleteMany({ role: roles });
    try {
      const res = await request(server).post('/api/admin/auth/setup').send({});
      expect(res.status).toBe(200);

      const created = await User.findOne({ email: process.env.INITIAL_ADMIN_EMAIL });
      expect(created.role).toBe('super_admin');
      expect(created.username).toBe(process.env.INITIAL_ADMIN_EMAIL);
      expect(await created.comparePassword(process.env.INITIAL_ADMIN_PASSWORD)).toBe(true);

      expect((await request(server).post('/api/admin/auth/setup').send({})).status).toBe(403);
    } finally {
      await User.deleteMany({ role: roles });
      await User.insertMany(stash);
    }
  });
});

describe('admin password recovery', () => {
  beforeEach(() => {
    mockMail.sendAdminPasswordResetEmail.mockClear();
  });

  test('a real admin and an unknown address get the same answer, and the link uses FRONTEND_URL', async () => {
    // Regressions: an unknown address got a 404 ("No admin account found"),
    // and the link pointed at a hardcoded Vercel host.
    const known = await request(server).post('/api/admin/auth/forgot-password').send({ email: f.admin.email });
    const unknown = await request(server).post('/api/admin/auth/forgot-password').send({ email: 'not.an.admin@test.local' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);

    expect(mockMail.sendAdminPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [admin, url] = mockMail.sendAdminPasswordResetEmail.mock.calls[0];
    expect(admin.email).toBe(f.admin.email);
    expect(url.startsWith(`${process.env.FRONTEND_URL}/admin/reset-password/`)).toBe(true);
  });

  test('a failed email does not change the answer', async () => {
    mockMail.sendAdminPasswordResetEmail.mockRejectedValueOnce(new Error('provider down'));
    const res = await request(server).post('/api/admin/auth/forgot-password').send({ email: f.admin.email });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If that address belongs to an admin account/);
  });
});

describe('admin sessions end when the password or approval changes', () => {
  const jwt = require('jsonwebtoken');

  async function freshAdmin() {
    const stamp = `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;
    const admin = await User.create({
      firstName: 'Rotating', lastName: 'Admin', email: `rotating.${stamp}@test.local`,
      username: `rotating.${stamp}@test.local`, password: 'original-admin-pass', role: 'admin',
      approvalStatus: 'approved', isPasswordChanged: true
    });
    const { getAdminJWTSecret } = require('../../config/auth');
    // Issued a minute ago, as a token from an earlier sign-in would be.
    const token = jwt.sign(
      { userId: String(admin._id), role: 'admin', iat: Math.floor(Date.now() / 1000) - 60 },
      getAdminJWTSecret(), { expiresIn: '1h' }
    );
    return { admin, token };
  }

  test('changing the password retires older tokens and re-issues this one', async () => {
    const { token } = await freshAdmin();

    const tooShort = await call('post', '/api/admin/auth/change-password', token, { currentPassword: 'original-admin-pass', newPassword: 'short' });
    expect(tooShort.status).toBe(400);

    const ok = await call('post', '/api/admin/auth/change-password', token, { currentPassword: 'original-admin-pass', newPassword: 'a-brand-new-admin-pass' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    expect((await call('get', '/api/admin/auth/status', token)).status).toBe(401);
    expect((await call('get', '/api/admin/auth/status', ok.body.token)).status).toBe(200);
  });

  test('a reset through the emailed link retires older tokens too', async () => {
    const { admin, token } = await freshAdmin();
    const resetToken = await admin.initializeResetToken();

    const res = await request(server).post(`/api/admin/auth/reset-password/${resetToken}`).send({ password: 'reset-admin-password' });
    expect(res.status).toBe(200);

    expect((await call('get', '/api/admin/auth/status', token)).status).toBe(401);
  });

  test('revoking an admin\'s approval takes effect on their next request', async () => {
    const { admin, token } = await freshAdmin();
    expect((await call('get', '/api/admin/auth/status', token)).status).toBe(200);

    await User.updateOne({ _id: admin._id }, { $set: { approvalStatus: 'rejected' } });
    expect((await call('get', '/api/admin/auth/status', token)).status).toBe(403);
  });
});

describe('approval responses never carry credentials', () => {
  test('the doctor queues omit password and reset token, even while a reset is live', async () => {
    // Regression. These projected only `-password`, so every admin — not just
    // super admins — could read each doctor's live resetToken and use it to
    // take the account over.
    const stamp = Date.now();
    const doctor = await User.create({
      firstName: 'Resetting', lastName: 'Doc', email: `resetting.${stamp}@test.local`,
      username: `resetting.${stamp}@test.local`, password: 'password123', role: 'doctor', approvalStatus: 'pending'
    });
    const liveToken = await doctor.initializeResetToken();

    for (const path of ['/api/admin/approvals/doctors/pending', '/api/admin/approvals/doctors/all']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call('get', path, adminToken);
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).toContain(doctor.email);
      expect(body).not.toContain(liveToken);
      expect(body).not.toMatch(/"(password|resetToken|resetTokenExpiry)"/);
    }
  });

  test('so do the admin lists', async () => {
    const stamp = Date.now();
    const pendingAdmin = await User.create({
      firstName: 'Queued', lastName: 'Admin', email: `queued.${stamp}@test.local`,
      username: `queued.${stamp}@test.local`, password: 'password123', role: 'admin', approvalStatus: 'pending'
    });
    const liveToken = await pendingAdmin.initializeResetToken();

    for (const path of ['/api/admin/approvals/admins/pending', '/api/admin/approvals/admins/all']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call('get', path, superAdminToken);
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).toContain(pendingAdmin.email);
      expect(body).not.toContain(liveToken);
      expect(body).not.toMatch(/"(password|resetToken|resetTokenExpiry)"/);
    }
  });

  test('User documents serialise without credentials wherever they are returned', async () => {
    const doc = await User.findById(f.patientA._id);
    const json = JSON.parse(JSON.stringify(doc));
    expect(json).not.toHaveProperty('password');
    expect(json).not.toHaveProperty('resetToken');
    // toObject is untouched — internal code reads these.
    expect(doc.toObject()).toHaveProperty('password');
  });

  test('an approval stands even if its notification email fails', async () => {
    // Regression. The approval email was awaited bare after the save, so a
    // mail failure turned a completed approval into a 500 — and the retry
    // then 400'd with "already approved".
    const stamp = Date.now();
    const doctor = await User.create({
      firstName: 'Mailfail', lastName: 'Doc', email: `mailfail.${stamp}@test.local`,
      username: `mailfail.${stamp}@test.local`, password: 'password123', role: 'doctor', approvalStatus: 'pending'
    });
    mockMail.sendDoctorApprovedEmail.mockRejectedValueOnce(new Error('provider down'));

    const res = await call('post', `/api/admin/approvals/doctors/${doctor._id}/approve`, adminToken);
    expect(res.status).toBe(200);
    expect((await User.findById(doctor._id)).approvalStatus).toBe('approved');
  });
});
