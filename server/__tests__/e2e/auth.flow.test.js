/**
 * The authentication lifecycle, end to end.
 *
 * Nothing in the existing suite touches /api/auth/* at all — not register, not
 * the OTP handshake, not login, not password reset. That is the single largest
 * untested surface in the codebase and it gates every other feature.
 *
 * Requests travel the real route chain (validateRegistration -> controller ->
 * service -> model hooks), so the bcrypt pre-save hook, the PendingUser TTL
 * field and the approval gate are all exercised for real.
 */

require('../support/env');

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

/**
 * The mail sink. registerUser persists only a bcrypt hash of the OTP
 * (services/auth.service.js:133) and hands the plaintext back as a transient
 * property, so intercepting the send is the only way to learn the code.
 */
const mockSendOtp = jest.fn().mockResolvedValue({ id: 'sink' });
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: (_t, name) => (name === 'sendOTPEmail'
    ? (...a) => mockSendOtp(...a)
    : jest.fn().mockResolvedValue({ id: 'sink' }))
}));

let User, PendingUser;
let app;
let server;

/** The real /api/auth/* surface, mounted exactly as app.js mounts it. */
function buildApp() {
  const { validateRegistration, validateLogin, validatePasswordReset } = require('../../middleware/validation.middleware');
  const { verifyToken } = require('../../middleware/auth.middleware');
  const authController = require('../../controllers/auth.controller');
  const { errorHandler } = require('../../middleware/error.middleware');

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.post('/api/auth/register', validateRegistration, authController.register);
  app.post('/api/auth/verify-signup', authController.verifySignup);
  app.post('/api/auth/resend-signup-otp', authController.resendSignupOtp);
  app.post('/api/auth/login', validateLogin, authController.login);
  app.post('/api/auth/logout', verifyToken, authController.logout);
  app.post('/api/auth/forgot-password', authController.forgotPassword);
  app.post('/api/auth/reset-password', validatePasswordReset, authController.resetPassword);
  app.put('/api/auth/update-password', verifyToken, authController.updatePassword);
  app.delete('/api/auth/delete-account', verifyToken, authController.deleteAccount);
  app.get('/api/auth/profile', verifyToken, authController.getProfile);
  app.get('/api/protected', verifyToken, authController.getProtected);
  app.use(errorHandler);
  return app;
}

beforeAll(async () => {
  await connectDb('auth.flow');
  User = require('../../models/user');
  PendingUser = require('../../models/pendingUser');

  // One app and one listening server for the suite. buildApp() used to run per
  // test, and supertest then bound a fresh port for every request.
  app = buildApp();
  server = await startServer(app);
}, 60000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), PendingUser.deleteMany({})]);
  mockSendOtp.mockReset();
  mockSendOtp.mockResolvedValue({ id: 'sink' });
});

const PATIENT = {
  firstName: 'Asha', lastName: 'Rao',
  email: 'asha@test.local', username: 'asha@test.local',
  password: 'password123', phoneNo: '9000000010', role: 'patient'
};
const DOCTOR = {
  firstName: 'Dev', lastName: 'Mehta',
  email: 'dev@test.local', username: 'dev@test.local',
  password: 'password123', phoneNo: '9000000011', role: 'doctor',
  jobRole: 'Psychologist', specialization: 'Clinical Psychologist'
};

/** Read the OTP straight out of the PendingUser row's transient counterpart. */
async function registerAndGetOtp(app, body) {
  const spy = jest.spyOn(require('../../services/auth.service'), 'registerUser');
  const res = await request(server).post('/api/auth/register').send(body);
  const pending = await spy.mock.results[spy.mock.results.length - 1].value;
  spy.mockRestore();
  return { res, otp: pending.plainOtp, pending };
}

describe('signup: register -> PendingUser -> OTP -> verify-signup -> User', () => {
  test('register creates a PendingUser, not a User, and returns requiresVerification', async () => {
    const res = await request(server).post('/api/auth/register').send(PATIENT);

    expect(res.status).toBe(201);
    expect(res.body.requiresVerification).toBe(true);
    // The property the broken e2e seeder assumed: there is no User yet.
    expect(await User.countDocuments({})).toBe(0);
    expect(await PendingUser.countDocuments({ email: PATIENT.email })).toBe(1);
  });

  test('only a bcrypt hash of the OTP is persisted — the code itself is never stored', async () => {
    const { otp, pending } = await registerAndGetOtp(app, PATIENT);

    expect(otp).toMatch(/^\d{6}$/);
    const stored = await PendingUser.findById(pending._id).lean();
    expect(stored.otp).not.toBe(otp);
    expect(stored.otp).toMatch(/^\$2[aby]\$/);
  });

  test('the password in PendingUser is already hashed, and survives the transfer without double-hashing', async () => {
    const { otp } = await registerAndGetOtp(app, PATIENT);

    const verify = await request(server)
      .post('/api/auth/verify-signup')
      .send({ email: PATIENT.email, otp });
    expect(verify.status).toBe(200);

    // The real proof of no double-hash: the original password still logs in.
    const login = await request(server)
      .post('/api/auth/login')
      .send({ username: PATIENT.email, password: PATIENT.password });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });

  test('verify-signup promotes to User, deletes the PendingUser and issues a token + cookie', async () => {
    const { otp } = await registerAndGetOtp(app, PATIENT);

    const res = await request(server).post('/api/auth/verify-signup').send({ email: PATIENT.email, otp });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.headers['set-cookie'].join(';')).toMatch(/token=/);
    expect(await PendingUser.countDocuments({})).toBe(0);
    const user = await User.findOne({ email: PATIENT.email });
    expect(user.isVerified).toBe(true);
    expect(user.approvalStatus).toBe('approved');
  });

  test('a wrong OTP counts down attemptsLeft and locks out at 5 with 429', async () => {
    await registerAndGetOtp(app, PATIENT);

    for (let i = 1; i <= 5; i += 1) {
      const res = await request(server)
        .post('/api/auth/verify-signup')
        .send({ email: PATIENT.email, otp: '000000' });
      expect(res.status).toBe(400);
      expect(res.body.attemptsLeft).toBe(5 - i);
    }

    const locked = await request(server)
      .post('/api/auth/verify-signup')
      .send({ email: PATIENT.email, otp: '000000' });
    expect(locked.status).toBe(429);
    expect(locked.body.maxAttemptsReached).toBe(true);
    expect(await User.countDocuments({})).toBe(0);
  });

  test('a doctor signs up as approvalStatus pending and cannot log in until approved', async () => {
    const { otp } = await registerAndGetOtp(app, DOCTOR);
    await request(server).post('/api/auth/verify-signup').send({ email: DOCTOR.email, otp });

    const doctor = await User.findOne({ email: DOCTOR.email });
    expect(doctor.approvalStatus).toBe('pending');
    // doctorDetails is spread onto the User; these ARE declared on the schema.
    expect(doctor.jobRole).toBe('Psychologist');

    const blocked = await request(server)
      .post('/api/auth/login')
      .send({ username: DOCTOR.email, password: DOCTOR.password });
    expect(blocked.status).toBe(403);

    doctor.approvalStatus = 'approved';
    await doctor.save();
    const ok = await request(server)
      .post('/api/auth/login')
      .send({ username: DOCTOR.email, password: DOCTOR.password });
    expect(ok.status).toBe(200);
  });

  test('registering an email that already belongs to a verified User is a 409', async () => {
    const { otp } = await registerAndGetOtp(app, PATIENT);
    await request(server).post('/api/auth/verify-signup').send({ email: PATIENT.email, otp });

    const again = await request(server).post('/api/auth/register').send(PATIENT);
    expect(again.status).toBe(409);
  });

  test('re-registering while still pending replaces the row rather than duplicating it', async () => {
    const first = await registerAndGetOtp(app, PATIENT);
    const second = await registerAndGetOtp(app, PATIENT);

    expect(await PendingUser.countDocuments({ email: PATIENT.email })).toBe(1);
    expect(second.otp).not.toBe(first.otp);
    // The superseded code must no longer work.
    const stale = await request(server)
      .post('/api/auth/verify-signup')
      .send({ email: PATIENT.email, otp: first.otp });
    expect(stale.status).toBe(400);
  });
});

describe('login', () => {
  async function verifiedPatient(app) {
    const { otp } = await registerAndGetOtp(app, PATIENT);
    await request(server).post('/api/auth/verify-signup').send({ email: PATIENT.email, otp });
    return User.findOne({ email: PATIENT.email });
  }

  test('logs in by email or by username, and rejects a wrong password', async () => {
    await verifiedPatient(app);

    expect((await request(server).post('/api/auth/login').send({ username: PATIENT.email, password: PATIENT.password })).status).toBe(200);
    expect((await request(server).post('/api/auth/login').send({ username: PATIENT.username, password: PATIENT.password })).status).toBe(200);
    expect((await request(server).post('/api/auth/login').send({ username: PATIENT.email, password: 'wrongwrong' })).status).toBe(401);
  });

  test('an unverified account gets 403 requiresVerification and a fresh OTP whose TTL clock is reset', async () => {
    const { otp: original, pending } = await registerAndGetOtp(app, PATIENT);
    const createdBefore = (await PendingUser.findById(pending._id).lean()).createdAt;

    // Force the row to look old so the createdAt reset is observable.
    await PendingUser.updateOne({ _id: pending._id }, { $set: { createdAt: new Date(Date.now() - 10 * 60000), attempts: 3 } });

    const res = await request(server)
      .post('/api/auth/login')
      .send({ username: PATIENT.email, password: PATIENT.password });

    expect(res.status).toBe(403);
    expect(res.body.requiresVerification).toBe(true);

    const after = await PendingUser.findById(pending._id).lean();
    expect(after.attempts).toBe(0);
    // PendingUser has `expires: 900` on createdAt, so the fresh code gets a
    // fresh 15 minutes. That used to be unbounded; resendCount is what caps
    // it now (see the next test).
    expect(new Date(after.createdAt).getTime()).toBeGreaterThan(new Date(createdBefore).getTime() - 1000);
    expect(after.otp).toMatch(/^\$2[aby]\$/);
    expect(after.resendCount).toBe(1);
    expect(mockSendOtp).toHaveBeenCalledTimes(2);
  });

  test('login-triggered codes are capped, so the per-code guess limit means something', async () => {
    // Regression. Each login by a pending account minted a new code and
    // reset `attempts` to 0 — five guesses, log in, five more, forever (and
    // every login pushed the TTL out again). Now a signup gets at most
    // MAX_SIGNUP_OTP_RESENDS replacement codes.
    const { MAX_SIGNUP_OTP_RESENDS } = require('../../services/auth.service');
    const { pending } = await registerAndGetOtp(app, PATIENT);

    for (let i = 0; i < MAX_SIGNUP_OTP_RESENDS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await PendingUser.updateOne({ _id: pending._id }, { $set: { attempts: 5 } });
      // eslint-disable-next-line no-await-in-loop
      const res = await request(server).post('/api/auth/login').send({ username: PATIENT.email, password: PATIENT.password });
      expect(res.status).toBe(403);
    }

    await PendingUser.updateOne({ _id: pending._id }, { $set: { attempts: 5 } });
    const capped = await request(server).post('/api/auth/login').send({ username: PATIENT.email, password: PATIENT.password });
    expect(capped.status).toBe(429);
    expect(capped.body.maxResendsReached).toBe(true);

    // No fresh guesses were handed out by the refused request.
    expect((await PendingUser.findById(pending._id).lean()).attempts).toBe(5);
    expect(mockSendOtp).toHaveBeenCalledTimes(1 + MAX_SIGNUP_OTP_RESENDS);
  });

  test('registering again draws on the same budget', async () => {
    const { MAX_SIGNUP_OTP_RESENDS } = require('../../services/auth.service');
    for (let i = 0; i <= MAX_SIGNUP_OTP_RESENDS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await request(server).post('/api/auth/register').send(PATIENT)).status).toBe(201);
    }
    const capped = await request(server).post('/api/auth/register').send(PATIENT);
    expect(capped.status).toBe(429);
    expect(mockSendOtp).toHaveBeenCalledTimes(1 + MAX_SIGNUP_OTP_RESENDS);
  });

  test('only the registrant can ask for a new code: a wrong password sends nothing', async () => {
    // Regression. The pending branch ignored the password, so anyone who
    // knew an address that was mid-signup could make the server mail it.
    const { pending } = await registerAndGetOtp(app, PATIENT);
    mockSendOtp.mockClear();

    const res = await request(server).post('/api/auth/login').send({ username: PATIENT.email, password: 'not-their-password' });
    expect(res.status).toBe(401);
    expect(res.body.requiresVerification).toBeUndefined();
    expect(mockSendOtp).not.toHaveBeenCalled();
    expect((await PendingUser.findById(pending._id).lean()).resendCount).toBe(0);
  });

  test('a suspended account is refused by verifyToken even with a valid token', async () => {
    const user = await verifiedPatient(app);
    const login = await request(server).post('/api/auth/login').send({ username: PATIENT.email, password: PATIENT.password });
    const token = login.body.token;

    expect((await request(server).get('/api/auth/profile').set('Authorization', `Bearer ${token}`)).status).toBe(200);

    await User.updateOne({ _id: user._id }, { $set: { status: 'suspended' } });
    const after = await request(server).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(403);
  });

  test('GET /api/protected echoes the httpOnly auth cookie back in the response body', async () => {
    // F6. Documented as "Send token to client for WebSocket auth"
    // (auth.controller.js:308). It means an XSS can read a 30-day JWT with one
    // fetch, which is the exact property httpOnly exists to prevent.
    await verifiedPatient(app);
    const login = await request(server).post('/api/auth/login').send({ username: PATIENT.email, password: PATIENT.password });
    const cookie = login.headers['set-cookie'];

    const res = await request(server).get('/api/protected').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(cookie.join(';')).toContain('HttpOnly');
  });
});

describe('password reset', () => {
  async function verifiedPatient(app) {
    const { otp } = await registerAndGetOtp(app, PATIENT);
    await request(server).post('/api/auth/verify-signup').send({ email: PATIENT.email, otp });
    return User.findOne({ email: PATIENT.email });
  }

  test('forgot-password returns the same response for a real and an unknown address', async () => {
    await verifiedPatient(app);

    const known = await request(server).post('/api/auth/forgot-password').send({ email: PATIENT.email });
    const unknown = await request(server).post('/api/auth/forgot-password').send({ email: 'nobody@test.local' });

    expect(known.status).toBe(unknown.status);
    expect(known.body.message).toBe(unknown.body.message);
  });

  test('the reset token is stored in plaintext and is single-use', async () => {
    const user = await verifiedPatient(app);
    await request(server).post('/api/auth/forgot-password').send({ email: PATIENT.email });

    const withToken = await User.findById(user._id).select('+resetToken');
    const token = withToken.resetToken;
    expect(token).toBeTruthy();
    // A database read yields a usable token: it is not hashed at rest.
    expect(token).toMatch(/^[0-9a-f]{96}$/);

    const first = await request(server)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'brandnew123' });
    expect(first.status).toBe(200);

    const replay = await request(server)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'another123' });
    expect(replay.status).toBeGreaterThanOrEqual(400);

    expect((await request(server).post('/api/auth/login').send({ username: PATIENT.email, password: 'brandnew123' })).status).toBe(200);
    expect((await request(server).post('/api/auth/login').send({ username: PATIENT.email, password: PATIENT.password })).status).toBe(401);
  });

  test('an expired reset token is refused', async () => {
    const user = await verifiedPatient(app);
    await request(server).post('/api/auth/forgot-password').send({ email: PATIENT.email });
    const token = (await User.findById(user._id).select('+resetToken')).resetToken;

    await User.updateOne({ _id: user._id }, { $set: { resetTokenExpiry: new Date(Date.now() - 60000) } });

    const res = await request(server)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'brandnew123' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('reusing the current password as the new password is refused', async () => {
    const user = await verifiedPatient(app);
    await request(server).post('/api/auth/forgot-password').send({ email: PATIENT.email });
    const token = (await User.findById(user._id).select('+resetToken')).resetToken;

    const res = await request(server)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: PATIENT.password });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('update-password requires the current password and re-hashes on success', async () => {
    await verifiedPatient(app);
    const login = await request(server).post('/api/auth/login').send({ username: PATIENT.email, password: PATIENT.password });
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const wrong = await request(server).put('/api/auth/update-password').set(auth)
      .send({ currentPassword: 'nottherightone', newPassword: 'changed12345' });
    expect(wrong.status).toBeGreaterThanOrEqual(400);

    const ok = await request(server).put('/api/auth/update-password').set(auth)
      .send({ currentPassword: PATIENT.password, newPassword: 'changed12345' });
    expect(ok.status).toBe(200);

    expect((await request(server).post('/api/auth/login').send({ username: PATIENT.email, password: 'changed12345' })).status).toBe(200);
  });
});

describe('account deletion', () => {
  test('delete-account removes the user and invalidates the token', async () => {
    const { otp } = await registerAndGetOtp(app, PATIENT);
    await request(server).post('/api/auth/verify-signup').send({ email: PATIENT.email, otp });
    const login = await request(server).post('/api/auth/login').send({ username: PATIENT.email, password: PATIENT.password });
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const res = await request(server).delete('/api/auth/delete-account').set(auth).send({ password: PATIENT.password });
    expect(res.status).toBe(200);
    expect(await User.countDocuments({ email: PATIENT.email })).toBe(0);

    // The JWT is still cryptographically valid; verifyToken must fail on the
    // missing user, because there is no revocation list anywhere.
    const after = await request(server).get('/api/auth/profile').set(auth);
    expect(after.status).toBeGreaterThanOrEqual(401);
  });

  test('a doctor with session history cannot delete themselves, and nothing is removed', async () => {
    // Regression. The cascade deletes by doctorId as well as patientId, so a
    // doctor deleting their account erased every patient's sessions, reports,
    // notes and tasks with them — clinical and payment records that are not
    // the doctor's to destroy.
    const { makeUser, makeSession, tokenFor } = require('../helpers/harness');
    const doctor = await makeUser('doctor');
    const patient = await makeUser('patient');
    const Session = require('../../models/session');
    await makeSession({ patient, doctor });

    const res = await request(server).delete('/api/auth/delete-account')
      .set('Authorization', `Bearer ${tokenFor(doctor)}`).send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/support/i);

    expect(await User.countDocuments({ _id: doctor._id })).toBe(1);
    expect(await Session.countDocuments({ doctorId: doctor._id })).toBe(1);
    await Session.deleteMany({ doctorId: doctor._id });
  });

  test('a patient\'s paid sessions survive their deletion; the account becomes an anonymous tombstone', async () => {
    // Regression. Patient deletion cascade-deleted every session with their
    // patientId — including paid ones, the rows the payout ledger pays the
    // doctor from and the only record of the charge.
    const { makeUser, makeSession, tokenFor } = require('../helpers/harness');
    const Session = require('../../models/session');
    const patient = await makeUser('patient', { phoneNumber: '9000000123' });
    const doctor = await makeUser('doctor');
    const paid = await makeSession({ patient, doctor, hoursFromNow: -48, status: 'completed', sessionNotes: 'occupation: teacher, issue: grief' });
    const unpaid = await makeSession({
      patient, doctor, status: 'payment_pending', paymentStatus: 'pending', paymentId: null
    });
    const token = tokenFor(patient);

    const res = await request(server).delete('/api/auth/delete-account').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(200);

    const kept = await Session.findById(paid._id).lean();
    expect(kept).not.toBeNull();
    expect(kept.paymentStatus).toBe('paid');
    expect(kept.sessionNotes).toBe('');
    expect(await Session.countDocuments({ _id: unpaid._id })).toBe(0);

    const tombstone = await User.findById(patient._id).lean();
    expect(tombstone.deletedAt).toBeInstanceOf(Date);
    expect(tombstone.email).not.toBe(patient.email);
    expect(tombstone.firstName).toBe('Deleted');
    expect(tombstone.phoneNumber).toBeNull();
    expect(await User.countDocuments({ email: patient.email })).toBe(0);

    // Nothing signs in as it, and the token it had is dead.
    expect((await request(server).get('/api/auth/profile').set('Authorization', `Bearer ${token}`)).status).toBeGreaterThanOrEqual(401);
    await Session.deleteMany({ doctorId: doctor._id });
  });

  test('a patient with an upcoming paid session must cancel it before deleting', async () => {
    // Deleting around it left a paid session scheduled for an account that no
    // longer existed: the doctor turned up for nobody, and the refund the
    // patient was owed (which depends on how early they cancel) was never
    // decided.
    const { makeUser, makeSession, tokenFor } = require('../helpers/harness');
    const Session = require('../../models/session');
    const patient = await makeUser('patient');
    const doctor = await makeUser('doctor');
    await makeSession({ patient, doctor, hoursFromNow: 24 });

    const res = await request(server).delete('/api/auth/delete-account')
      .set('Authorization', `Bearer ${tokenFor(patient)}`).send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/cancel/i);
    expect(await User.countDocuments({ _id: patient._id })).toBe(1);
    await Session.deleteMany({ doctorId: doctor._id });
  });

  test('a doctor with no sessions can still delete their account', async () => {
    const { makeUser, tokenFor } = require('../helpers/harness');
    const doctor = await makeUser('doctor');
    const res = await request(server).delete('/api/auth/delete-account')
      .set('Authorization', `Bearer ${tokenFor(doctor)}`).send({});
    expect(res.status).toBe(200);
    expect(await User.countDocuments({ _id: doctor._id })).toBe(0);
  });

  test('the auth cookie is cleared on the domain it was set on (production)', async () => {
    // Regression. delete-account called a bare res.clearCookie('token'),
    // which targets the API host; in production the cookie lives on
    // .veraawell.com, so the browser kept it.
    const { makeUser, tokenFor } = require('../helpers/harness');
    const patient = await makeUser('patient');
    const token = tokenFor(patient);

    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let res;
    try {
      res = await request(server).delete('/api/auth/delete-account').set('Authorization', `Bearer ${token}`).send({});
    } finally {
      process.env.NODE_ENV = previous;
    }
    expect(res.status).toBe(200);
    const cleared = (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='));
    expect(cleared).toBeDefined();
    expect(cleared).toMatch(/Domain=\.veraawell\.com/i);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cleared).not.toMatch(/Max-Age=[1-9]/);
  });
});

describe('login says nothing about an account before the password checks out', () => {
  // Regressions. Role mismatch, pending approval and the admin's free-text
  // rejection reason were all reported before the password was compared.
  async function doctorWith(extra) {
    const { makeUser } = require('../helpers/harness');
    return makeUser('doctor', extra);
  }

  test('a pending doctor with the wrong password is told only that the credentials are wrong', async () => {
    const doc = await doctorWith({ approvalStatus: 'pending' });
    const res = await request(server).post('/api/auth/login').send({ username: doc.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/pending|approval/i);

    const right = await request(server).post('/api/auth/login').send({ username: doc.email, password: 'password123' });
    expect(right.status).toBe(403);
    expect(right.body.message).toMatch(/pending/i);
  });

  test('a rejected doctor\'s rejection reason is not read out to a stranger', async () => {
    const doc = await doctorWith({ approvalStatus: 'rejected', rejectionReason: 'licence number did not verify' });
    const res = await request(server).post('/api/auth/login').send({ username: doc.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/licence|rejected/i);
  });

  test('a role mismatch is not disclosed without the password', async () => {
    const doc = await doctorWith({});
    const res = await request(server).post('/api/auth/login').send({ username: doc.email, password: 'wrong-password', role: 'patient' });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/doctor/i);
  });
});

describe('tokens end when they should', () => {
  const jwt = require('jsonwebtoken');
  const { getJWTSecret } = require('../../config/auth');
  /** A token issued a minute ago, as one from an earlier sign-in would be. */
  const olderToken = (u) => jwt.sign(
    { userId: String(u._id), role: u.role, iat: Math.floor(Date.now() / 1000) - 60 },
    getJWTSecret(), { expiresIn: '1h' }
  );

  test('a password reset retires every token issued before it', async () => {
    // Regression. A reset changed the password and left every existing
    // 30-day token working — including one held by whoever the reset was
    // meant to lock out.
    const { makeUser } = require('../helpers/harness');
    const user = await makeUser('patient');
    const stolen = olderToken(user);
    expect((await request(server).get('/api/auth/profile').set('Authorization', `Bearer ${stolen}`)).status).toBe(200);

    await request(server).post('/api/auth/forgot-password').send({ email: user.email });
    const resetToken = (await User.findById(user._id)).resetToken;
    expect((await request(server).post('/api/auth/reset-password').send({ token: resetToken, newPassword: 'a-new-password-1' })).status).toBe(200);

    expect((await request(server).get('/api/auth/profile').set('Authorization', `Bearer ${stolen}`)).status).toBe(401);
  });

  test('update-password retires older tokens but re-issues the session that made the change', async () => {
    const { makeUser } = require('../helpers/harness');
    const user = await makeUser('patient');
    const current = olderToken(user);
    const otherDevice = olderToken(user);

    const res = await request(server).put('/api/auth/update-password').set('Authorization', `Bearer ${current}`)
      .send({ currentPassword: 'password123', newPassword: 'changed-password-1' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect((res.headers['set-cookie'] || []).join(';')).toMatch(/token=/);

    expect((await request(server).get('/api/auth/profile').set('Authorization', `Bearer ${otherDevice}`)).status).toBe(401);
    expect((await request(server).get('/api/auth/profile').set('Authorization', `Bearer ${res.body.token}`)).status).toBe(200);
  });

  test('a rejected doctor\'s existing token stops working', async () => {
    // Regression. Login refused a rejected doctor, but a token issued before
    // the rejection kept full access for the rest of its 30 days.
    const { makeUser, tokenFor } = require('../helpers/harness');
    const doc = await makeUser('doctor', { approvalStatus: 'pending' });
    const token = tokenFor(doc);
    // A pending doctor keeps access, to finish their profile.
    expect((await request(server).get('/api/auth/profile').set('Authorization', `Bearer ${token}`)).status).toBe(200);

    await User.updateOne({ _id: doc._id }, { $set: { approvalStatus: 'rejected' } });
    expect((await request(server).get('/api/auth/profile').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });
});

describe('signup is validated before a code is sent', () => {
  // Regression. PendingUser accepts nearly anything; the User schema did not
  // run until verify-signup, so a bad value surfaced as a 400 only after the
  // person had fetched and typed in a correct code.
  test('a value the User schema rejects fails registration, and no code is sent', async () => {
    const bad = [
      { ...DOCTOR, specialization: 'Astrologer' },
      { ...PATIENT, phoneNo: '12345' }
    ];
    for (const body of bad) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(server).post('/api/auth/register').send(body);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toContain(body.password);
    }
    expect(await PendingUser.countDocuments({})).toBe(0);
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  test('a doctor\'s verification documents must be files uploaded to our Cloudinary account', async () => {
    const own = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/raw/upload/v1/docs/licence.pdf`;
    const foreign = [
      'https://evil.example/licence.pdf',
      'http://res.cloudinary.com/' + process.env.CLOUDINARY_CLOUD_NAME + '/raw/upload/licence.pdf',
      'https://res.cloudinary.com/someone-else/raw/upload/licence.pdf'
    ];
    for (const fileUrl of foreign) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(server).post('/api/auth/register')
        .send({ ...DOCTOR, documents: [{ fileName: 'licence.pdf', fileUrl, fileType: 'application/pdf' }] });
      expect({ fileUrl, status: res.status }).toEqual({ fileUrl, status: 400 });
    }
    expect(mockSendOtp).not.toHaveBeenCalled();

    const ok = await request(server).post('/api/auth/register')
      .send({ ...DOCTOR, documents: [{ fileName: 'licence.pdf', fileUrl: own, fileType: 'application/pdf' }] });
    expect(ok.status).toBe(201);
  });

  test('a username that is taken — as a username or as someone\'s email — is refused up front', async () => {
    const { makeUser } = require('../helpers/harness');
    const existing = await makeUser('patient');

    for (const username of [existing.username, existing.email]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(server).post('/api/auth/register').send({ ...PATIENT, username });
      expect(res.status).toBe(409);
    }
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  test('if the code cannot be emailed, registration fails and leaves nothing behind', async () => {
    // Before the mail helper checked Resend's `error`, this answered 201
    // "check your email" for a code that never left.
    mockSendOtp.mockRejectedValueOnce(new Error('Email provider refused the signup OTP email'));
    const res = await request(server).post('/api/auth/register').send(PATIENT);
    expect(res.status).toBe(502);
    expect(await PendingUser.countDocuments({ email: PATIENT.email })).toBe(0);
  });

  test('a code posted as a JSON number verifies instead of crashing', async () => {
    const { otp } = await registerAndGetOtp(app, PATIENT);
    // Codes are drawn from [100000, 999999], so there is never a leading zero
    // to lose in the conversion. bcrypt used to throw on the number: a 500.
    const res = await request(server).post('/api/auth/verify-signup').send({ email: PATIENT.email, otp: Number(otp) });
    expect(res.status).toBe(200);
  });

  test('codes come from crypto.randomInt', () => {
    const crypto = require('crypto');
    const spy = jest.spyOn(crypto, 'randomInt');
    try {
      const code = require('../../utils/otpGenerator').generateOTP();
      expect(code).toMatch(/^\d{6}$/);
      expect(spy).toHaveBeenCalledWith(100000, 1000000);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('POST /api/auth/resend-signup-otp', () => {
  const resend = (email) => request(server).post('/api/auth/resend-signup-otp').send({ email });

  test('replaces the code, restarts its window and keeps the guess budget bounded', async () => {
    const { otp: original, pending } = await registerAndGetOtp(app, PATIENT);
    await PendingUser.updateOne({ _id: pending._id }, { $set: { attempts: 4, createdAt: new Date(Date.now() - 10 * 60000) } });
    mockSendOtp.mockClear();

    const res = await resend(PATIENT.email.toUpperCase());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSendOtp).toHaveBeenCalledTimes(1);
    const fresh = mockSendOtp.mock.calls[0][1];
    expect(fresh).toMatch(/^\d{6}$/);

    const after = await PendingUser.findById(pending._id).lean();
    expect(after.resendCount).toBe(1);
    expect(after.attempts).toBe(0);
    expect(Date.now() - new Date(after.createdAt).getTime()).toBeLessThan(60000);

    if (fresh !== original) {
      const stale = await request(server).post('/api/auth/verify-signup').send({ email: PATIENT.email, otp: original });
      expect(stale.status).toBe(400);
    }
    const ok = await request(server).post('/api/auth/verify-signup').send({ email: PATIENT.email, otp: fresh });
    expect(ok.status).toBe(200);
  });

  test('an address with no signup in progress gets the same answer, and no mail', async () => {
    const { pending } = await registerAndGetOtp(app, PATIENT);
    mockSendOtp.mockClear();
    const known = await resend(pending.email);
    const unknown = await resend('nobody.signing.up@test.local');

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(mockSendOtp).toHaveBeenCalledTimes(1);
  });

  test('is capped per signup, sharing the budget with login-triggered codes', async () => {
    const { MAX_SIGNUP_OTP_RESENDS } = require('../../services/auth.service');
    await registerAndGetOtp(app, PATIENT);

    // One from logging in while unverified...
    expect((await request(server).post('/api/auth/login').send({ username: PATIENT.email, password: PATIENT.password })).status).toBe(403);
    // ...and the rest from the button.
    for (let i = 1; i < MAX_SIGNUP_OTP_RESENDS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await resend(PATIENT.email)).status).toBe(200);
    }
    mockSendOtp.mockClear();

    const capped = await resend(PATIENT.email);
    expect(capped.status).toBe(429);
    expect(capped.body.maxResendsReached).toBe(true);
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  test('an email is required', async () => {
    expect((await request(server).post('/api/auth/resend-signup-otp').send({})).status).toBe(400);
  });
});

describe('the resend limiter, as production mounts it', () => {
  function buildLimited() {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let limiter;
    let errorHandler;
    jest.isolateModules(() => {
      ({ signupOtpResendLimiter: limiter } = require('../../middleware/rateLimit.middleware'));
      ({ errorHandler } = require('../../middleware/error.middleware'));
    });
    process.env.NODE_ENV = previous;

    const limited = express();
    limited.use(express.json());
    limited.post('/resend', limiter, (req, res) => res.json({ ok: true }));
    limited.use(errorHandler);
    return limited;
  }

  test('allows five requests per email and IP, then answers 429', async () => {
    const limited = buildLimited();
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      statuses.push((await request(limited).post('/resend').send({ email: 'Someone@test.local' })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);

    // Keyed on the address: another one from the same IP is unaffected.
    expect((await request(limited).post('/resend').send({ email: 'someone.else@test.local' })).status).toBe(200);
  });
});
