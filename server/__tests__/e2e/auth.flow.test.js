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
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
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
    // PendingUser has `expires: 900` on createdAt, so rewriting createdAt on
    // every failed login extends the 15-minute window indefinitely.
    expect(new Date(after.createdAt).getTime()).toBeGreaterThan(new Date(createdBefore).getTime() - 1000);
    expect(after.otp).toMatch(/^\$2[aby]\$/);
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
});
