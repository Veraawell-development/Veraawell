/**
 * Google sign-in, end to end, against a stubbed Google.
 *
 * The real strategy, the real route handlers and a real session run; only
 * the two calls that would leave the machine — exchanging the code for a
 * token, and fetching the profile — are replaced. That is enough to check
 * what the callback does with every kind of account Google can vouch for,
 * and that it refuses a callback the browser never started (login CSRF).
 */

require('../support/env');

process.env.GOOGLE_CLIENT_ID = 'test-google-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';

const express = require('express');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const { connectDb, disconnectDb } = require('../support/db');

let User;
let server;
let oauthService;
let googleProfile;

function profileFor(email, { verified = true, id = `g-${email}` } = {}) {
  return {
    id,
    displayName: 'Google Person',
    name: { givenName: 'Google', familyName: 'Person' },
    emails: [{ value: email, verified }]
  };
}

/**
 * Mounted as app.js mounts them — and, like app.js, with no session
 * middleware: the round trip must survive on its own cookie. Production's
 * session store never saved anything, which is how Google sign-in broke.
 */
function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(passport.initialize());
  app.get('/api/auth/google', oauthService.startGoogleSignIn);
  app.get('/api/auth/google/callback', oauthService.finishGoogleSignIn);
  app.get('/unavailable', oauthService.googleUnavailable);
  return app;
}

beforeAll(async () => {
  await connectDb('oauth.google');
  User = require('../../models/user');
  oauthService = require('../../services/oauth.service');
  expect(oauthService.initializeGoogleStrategy()).toBe(true);

  // The two network calls. Everything else is the real strategy.
  const strategy = passport._strategy('google');
  strategy._oauth2.getOAuthAccessToken = (code, params, cb) => cb(null, 'access-token', 'refresh-token', {});
  strategy.userProfile = (accessToken, done) => done(null, googleProfile);

  server = await startServer(buildApp());
}, 60000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

beforeEach(async () => {
  await User.deleteMany({});
  googleProfile = profileFor('new.person@test.local');
});

/** Click the Google button, come back from Google. Returns the final response. */
async function signInWithGoogle({ role = 'patient', tamperState = false, query = '' } = {}) {
  const agent = request.agent(server);
  const start = await agent.get(`/api/auth/google?role=${role}`);
  expect(start.status).toBe(302);
  const google = new URL(start.headers.location);
  expect(google.hostname).toBe('accounts.google.com');
  const state = google.searchParams.get('state');
  expect(state).toBeTruthy();

  const sentState = tamperState ? `${state}x` : state;
  return agent.get(`/api/auth/google/callback?code=from-google&state=${encodeURIComponent(sentState)}${query}`);
}

function errorCode(res) {
  const url = new URL(res.headers.location);
  return url.pathname === '/login' ? url.searchParams.get('error') : null;
}

function setsSession(res) {
  return (res.headers['set-cookie'] || []).some((c) => /^token=[^;]+/.test(c));
}

describe('a successful Google sign-in', () => {
  test('creates a patient, signs them in by cookie, and keeps the token out of the URL', async () => {
    const res = await signInWithGoogle();

    expect(res.status).toBe(302);
    const back = new URL(res.headers.location);
    expect(back.searchParams.get('auth')).toBe('success');
    expect(back.searchParams.get('role')).toBe('patient');
    // It used to carry the 30-day token, into the frontend's access logs.
    expect(back.searchParams.get('token')).toBeNull();
    expect(setsSession(res)).toBe(true);

    const user = await User.findOne({ email: 'new.person@test.local' });
    expect(user.role).toBe('patient');
    expect(user.approvalStatus).toBe('approved');
  });

  test('signs in an existing password account WITHOUT taking its password away', async () => {
    // Linking used to write googleId onto the account, after which password
    // login and "forgot password" both refused it for good.
    await User.create({
      firstName: 'Asha', email: 'asha@test.local', username: 'asha@test.local',
      password: 'password123', role: 'patient', approvalStatus: 'approved'
    });
    googleProfile = profileFor('asha@test.local');

    const res = await signInWithGoogle();
    expect(new URL(res.headers.location).searchParams.get('auth')).toBe('success');
    expect(setsSession(res)).toBe(true);

    const after = await User.findOne({ email: 'asha@test.local' });
    expect(after.googleId).toBeUndefined();
    const { authenticateUser } = require('../../services/auth.service');
    await expect(authenticateUser('asha@test.local', 'password123', 'patient')).resolves.toBeTruthy();
  });

  test('an approved doctor who uses Google lands as a doctor, whatever the button said', async () => {
    await User.create({
      firstName: 'Dev', email: 'dev@test.local', username: 'dev@test.local',
      password: 'password123', role: 'doctor', approvalStatus: 'approved'
    });
    googleProfile = profileFor('dev@test.local');

    const res = await signInWithGoogle({ role: 'patient' });
    expect(new URL(res.headers.location).searchParams.get('role')).toBe('doctor');
    expect(setsSession(res)).toBe(true);
  });

  test('a returning Google user is found by their Google id', async () => {
    await signInWithGoogle();
    const again = await signInWithGoogle();
    expect(new URL(again.headers.location).searchParams.get('auth')).toBe('success');
    expect(await User.countDocuments({ email: 'new.person@test.local' })).toBe(1);
  });
});

describe('a Google sign-in that must not succeed', () => {
  test('a callback whose state does not match the one this browser started is refused (login CSRF)', async () => {
    const res = await signInWithGoogle({ tamperState: true });
    expect(errorCode(res)).toBe('google-expired');
    expect(setsSession(res)).toBe(false);
    expect(await User.countDocuments({})).toBe(0);
  });

  test('a callback the browser never started is refused', async () => {
    // An attacker's link: their own authorization code, the victim's browser.
    const res = await request(server).get('/api/auth/google/callback?code=attackers-code&state=whatever');
    expect(errorCode(res)).toBe('google-expired');
    expect(setsSession(res)).toBe(false);
  });

  test('a state cookie that was tampered with, or is too old, is refused', async () => {
    const agent = request.agent(server);
    const start = await agent.get('/api/auth/google?role=patient');
    const state = new URL(start.headers.location).searchParams.get('state');
    const cookie = start.headers['set-cookie'].find((c) => c.startsWith(`${oauthService.STATE_COOKIE}=`));
    const value = decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='));
    const [body] = value.split('.');

    // Re-signed with the wrong key: the intent cannot be forged to 'doctor'.
    const forged = Buffer.from(JSON.stringify({ n: state, r: 'doctor', t: Date.now() })).toString('base64url');
    const tampered = await request(server)
      .get(`/api/auth/google/callback?code=c&state=${encodeURIComponent(state)}`)
      .set('Cookie', `${oauthService.STATE_COOKIE}=${forged}.${value.split('.')[1]}`);
    expect(errorCode(tampered)).toBe('google-expired');

    // Genuine, but from more than ten minutes ago.
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60 * 1000;
    try {
      const stale = await request(server)
        .get(`/api/auth/google/callback?code=c&state=${encodeURIComponent(state)}`)
        .set('Cookie', `${oauthService.STATE_COOKIE}=${body}.${value.split('.')[1]}`);
      expect(errorCode(stale)).toBe('google-expired');
      expect(setsSession(stale)).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  test('the state cookie is HttpOnly, Lax, scoped to the Google routes, and used once', async () => {
    const agent = request.agent(server);
    const start = await agent.get('/api/auth/google?role=patient');
    const cookie = start.headers['set-cookie'].find((c) => c.startsWith(`${oauthService.STATE_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/auth\/google/);
    expect(cookie).toMatch(/Max-Age=600/);

    const state = new URL(start.headers.location).searchParams.get('state');
    const done = await agent.get(`/api/auth/google/callback?code=c&state=${encodeURIComponent(state)}`);
    expect(new URL(done.headers.location).searchParams.get('auth')).toBe('success');
    // Cleared on the way back, so the same state cannot be replayed.
    expect((done.headers['set-cookie'] || []).join(';')).toMatch(new RegExp(`${oauthService.STATE_COOKIE}=;`));
    const replay = await agent.get(`/api/auth/google/callback?code=c&state=${encodeURIComponent(state)}`);
    expect(errorCode(replay)).toBe('google-expired');
  });

  test('in production the state cookie is Secure', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(oauthService.stateCookieOptions()).toMatchObject({ secure: true, sameSite: 'lax', httpOnly: true });
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  test.each([
    ['a pending practitioner', { role: 'doctor', approvalStatus: 'pending' }, 'account-pending'],
    ['a rejected practitioner', { role: 'doctor', approvalStatus: 'rejected' }, 'account-rejected'],
    ['a suspended patient', { role: 'patient', approvalStatus: 'approved', status: 'suspended' }, 'account-suspended'],
    ['an admin', { role: 'admin', approvalStatus: 'approved' }, 'admin-account']
  ])('%s is refused with a reason, and gets no session', async (_label, extra, code) => {
    await User.create({
      firstName: 'X', email: 'x@test.local', username: 'x@test.local',
      password: 'password123', ...extra
    });
    googleProfile = profileFor('x@test.local');

    const res = await signInWithGoogle();
    expect(errorCode(res)).toBe(code);
    expect(setsSession(res)).toBe(false);
    // Refusing must not change the account either.
    expect((await User.findOne({ email: 'x@test.local' })).googleId).toBeUndefined();
  });

  test('an existing account is not handed over on an address Google has not verified', async () => {
    await User.create({
      firstName: 'Asha', email: 'asha@test.local', username: 'asha@test.local',
      password: 'password123', role: 'patient', approvalStatus: 'approved'
    });
    googleProfile = profileFor('asha@test.local', { verified: false });

    const res = await signInWithGoogle();
    expect(errorCode(res)).toBe('google-email-unverified');
    expect(setsSession(res)).toBe(false);
  });

  test('?role=doctor does not create an empty practitioner application', async () => {
    const res = await signInWithGoogle({ role: 'doctor' });
    expect(errorCode(res)).toBe('google-doctor-signup');
    expect(setsSession(res)).toBe(false);
    expect(await User.countDocuments({})).toBe(0);
  });

  test('a role that is not patient or doctor goes back to the login page', async () => {
    const res = await request(server).get('/api/auth/google?role=admin');
    expect(errorCode(res)).toBe('google-auth-failed');
  });

  test('cancelling on Google\'s screen comes back as "cancelled", not as a failure', async () => {
    const agent = request.agent(server);
    const start = await agent.get('/api/auth/google?role=patient');
    const state = new URL(start.headers.location).searchParams.get('state');
    const res = await agent.get(`/api/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`);
    expect(errorCode(res)).toBe('google-cancelled');
    expect(setsSession(res)).toBe(false);
  });

  test('without Google configured, the button leads back to the login page with a message', async () => {
    const res = await request(server).get('/unavailable');
    expect(errorCode(res)).toBe('google-unavailable');
  });
});
