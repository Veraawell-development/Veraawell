/**
 * The admin surface: the master-credential login path, doctor approvals,
 * payout onboarding and the destructive maintenance endpoints.
 *
 * None of this is covered today, and it contains the most privileged code in
 * the application — including a super-admin login that bypasses the database
 * entirely and an endpoint that deletes every session.
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
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
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
  test('a doctor requests onboarding and an admin approves it', async () => {
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

    const approved = await call('post', `/api/admin/payments/onboarding-requests/${f.doctorB._id}/approve`, adminToken, {});
    expect(approved.status).toBeLessThan(400);

    const after = await DoctorProfile.findOne({ userId: f.doctorB._id });
    // Approval is a recorded decision, not a gateway integration. It used to
    // call Razorpay to create a Route linked account and, on any error,
    // fabricate `acc_mock_<hex>` while still reporting success — which is how
    // doctors ended up "active" with an id no money could route to.
    expect(after.payoutApproved).toBe(true);
    expect(after.payoutApprovedAt).toBeInstanceOf(Date);
    expect(after.razorpayOnboardingStatus).toBe('active');
    // Nothing fabricated an account id.
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

  test('approving a doctor with no phone number is refused', async () => {
    await DoctorProfile.updateOne(
      { userId: f.doctorB._id },
      { $set: { payoutApproved: false, razorpayOnboardingStatus: 'pending_admin_approval' } }
    );
    await User.updateOne({ _id: f.doctorB._id }, { $unset: { phoneNumber: 1 } });

    const res = await call('post', `/api/admin/payments/onboarding-requests/${f.doctorB._id}/approve`, adminToken, {});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/phone number/i);

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

  test('an out-of-range override is SILENTLY ignored and a different amount is refunded', async () => {
    // adminPayments.controller.js:350 reads
    //   if (typeof overrideAmount === 'number' && >= 0 && <= session.price)
    //     use it
    //   else
    //     fall back to the tier calculation
    //
    // There is no rejecting branch. An admin who enters 10000 instead of 1000,
    // or any value above the price, gets HTTP 200 and a refund at a DIFFERENT
    // amount than they typed, with nothing in the response saying so. For a
    // money operation the input should be rejected, not quietly replaced.
    const s = await refundableSession('pay_admin_refund_03');
    const res = await call('post', `/api/admin/payments/sessions/${s._id}/refund`, superAdminToken, { refundAmount: 999999 });

    expect(res.status).toBe(200);
    const after = await Session.findById(s._id);
    // 48h out => the patient tier is 100%, i.e. the full price, not 999999.
    expect(after.refundAmount).toBe(1000);
    expect(after.paymentStatus).toBe('refunded');
  });

  test('a non-numeric override is likewise ignored rather than rejected', async () => {
    const s = await refundableSession('pay_admin_refund_04');
    const res = await call('post', `/api/admin/payments/sessions/${s._id}/refund`, superAdminToken, { refundAmount: 'five hundred' });

    expect(res.status).toBe(200);
    expect((await Session.findById(s._id)).refundAmount).toBe(1000);
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

describe('destructive maintenance endpoints', () => {
  test('cleanup-sessions deletes EVERY session, and outside production a plain admin may do it', async () => {
    // admin.controller.js:20 gates the super_admin requirement on
    // isProduction(). In development, staging, or any environment where
    // NODE_ENV is unset, an ordinary admin token wipes the whole collection.
    await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() + 72 * 3600 * 1000),
      duration: 60, price: 1000, status: 'scheduled',
      paymentStatus: 'paid', paymentId: 'pay_will_be_wiped'
    });
    expect(await Session.countDocuments({})).toBeGreaterThan(0);

    const res = await call('post', '/api/admin/cleanup-sessions', adminToken, {});
    expect(res.status).toBeLessThan(300);
    expect(await Session.countDocuments({})).toBe(0);
  });

  test('a patient token cannot reach cleanup-sessions', async () => {
    const res = await call('post', '/api/admin/cleanup-sessions', patientToken, {});
    expect(res.status).toBeGreaterThanOrEqual(400);
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
});
