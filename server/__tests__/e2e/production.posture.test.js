/**
 * The application as it behaves with NODE_ENV=production.
 *
 * Every other suite runs in development, which is a materially different
 * application: rate limiting is not mounted, CORS accepts any origin, and
 * cookies are not marked secure. The CORS/CSRF header mismatch (now fixed) was
 * the shape of bug that lives only here — it cannot be reproduced locally,
 * because Vite proxies /api and makes every request same-origin, skipping
 * preflight.
 *
 * app.js reads isProduction() at module load for the rate limiters and the
 * morgan mount, so the flag has to be set before the app graph is required.
 * jest.isolateModules gives each case its own registry.
 */

require('../support/env');

const request = require('supertest');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(120000);

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: jest.fn(), fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));
jest.mock('isomorphic-dompurify', () => ({ sanitize: (s) => s }));

const FRONTEND = 'https://veraawell.vercel.app';
const HOSTILE = 'https://veraawell-clone.example.com';

let prodApp;
const saved = {};

/**
 * NODE_ENV has to stay 'production' for the whole file, not just while the app
 * is required. isProduction() is consulted at two different times:
 *
 *   - at MODULE LOAD, for the rate limiters and the morgan mount (app.js:122);
 *   - at REQUEST TIME, inside the CORS origin callback (app.js:86) and inside
 *     getCookieConfig()/getSessionCookieConfig() and sessionState's invariant
 *     check.
 *
 * Restoring the flag straight after require() therefore produces an app that
 * has production's middleware stack but development's origin and cookie policy
 * — which reads as "production allows any origin", a conclusion that is simply
 * an artefact of the test. afterAll puts everything back for the other suites.
 */
const PRODUCTION_ENV = {
  NODE_ENV: 'production',
  JWT_SECRET: 'prod-user-secret',
  SESSION_SECRET: 'prod-session-secret',
  ADMIN_JWT_SECRET: 'prod-admin-secret',
  FRONTEND_URL: FRONTEND,
  RAZORPAY_KEY_ID: 'rzp_live_x',
  RAZORPAY_KEY_SECRET: 'live_secret',
  RAZORPAY_WEBHOOK_SECRET: 'live_webhook',
  CLOUDINARY_CLOUD_NAME: 'c',
  CLOUDINARY_API_KEY: 'k',
  CLOUDINARY_API_SECRET: 's',
  RESEND: 're_live_x'
};

beforeAll(async () => {
  await connectDb('production.posture');

  for (const [k, v] of Object.entries(PRODUCTION_ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
  jest.isolateModules(() => { prodApp = require('../../app'); });
}, 180000);

afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  await disconnectDb();
});

describe('CORS under production settings', () => {
  test('the whitelisted frontend origin is allowed', async () => {
    const res = await request(prodApp)
      .options('/api/sessions/book')
      .set('Origin', FRONTEND)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBe(FRONTEND);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('an origin outside the whitelist is refused', async () => {
    const res = await request(prodApp)
      .options('/api/sessions/book')
      .set('Origin', HOSTILE)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('X-CSRF-Token is allowed by the preflight in production', async () => {
    // The one that matters. In development this is masked by Vite's proxy
    // making requests same-origin; in production the frontend and API are on
    // different origins, so the browser sends a preflight and asks permission
    // for X-CSRF-Token. When it was refused, every POST, PUT, PATCH and DELETE
    // from the app failed before it left the browser.
    const res = await request(prodApp)
      .options('/api/sessions/book')
      .set('Origin', FRONTEND)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-token');

    const allowed = String(res.headers['access-control-allow-headers'] || '').toLowerCase();
    expect(allowed).toContain('content-type');
    expect(allowed).toContain('authorization');
    expect(allowed).toContain('x-csrf-token');
  });

  test('and the server still demands that header on a mutating request', async () => {
    // The other half of the pair: the header the preflight now permits is
    // still required by the CSRF middleware. Allowing it is not waiving it.
    const res = await request(prodApp)
      .post('/api/session-tools/journal')
      .set('Origin', FRONTEND)
      .send({ title: 'x', content: 'y' });

    expect(res.status).toBe(403);
    expect(res.body.category).toBe('csrf');
  });

  test('a request with no Origin at all is still allowed through', async () => {
    // app.js:78 — deliberate for curl and native clients, but it means Origin
    // is not a security boundary even in production.
    const res = await request(prodApp).get('/api/health');
    expect(res.status).toBe(200);
  });
});

// Placed last: express-rate-limit's MemoryStore is shared for the whole file,
// so once this trips for the test client's IP every later /api/auth/login in
// this file is throttled.
describe('rate limiting is mounted in production', () => {
  test('repeated failed logins are eventually throttled', async () => {
    // config/constants.js RATE_LIMITS: auth is 5 attempts per 15 minutes in
    // production. Development mounts no limiter at all.
    const statuses = [];
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(prodApp)
        .post('/api/auth/login')
        .set('Origin', FRONTEND)
        .send({ username: 'nobody@test.local', password: 'wrongpass1' });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
    expect(statuses.indexOf(429)).toBeLessThanOrEqual(8);
  });

  test('the throttle does not leak across to an unrelated endpoint', async () => {
    const res = await request(prodApp).get('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('cookies under production settings', () => {
  test('the CSRF cookie is marked Secure and SameSite=None for cross-site use', async () => {
    const res = await request(prodApp).get('/api/csrf-token');
    const cookie = String(res.headers['set-cookie'] || '');

    expect(cookie).toMatch(/csrfToken=/);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=None/i);
    // It must remain readable to client JS — that is the whole double-submit
    // mechanism.
    expect(cookie).not.toMatch(/csrfToken=[^;]*;[^]*HttpOnly/i);
  });

  test('the auth cookie config is secure, cross-site and domain-scoped', () => {
    let cfg;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      cfg = require('../../config/auth').getCookieConfig();
    });

    expect(cfg.httpOnly).toBe(true);
    expect(cfg.secure).toBe(true);
    expect(cfg.sameSite).toBe('none');
    expect(cfg.domain).toBe('.veraawell.com');
  });

  test('the SESSION cookie is Secure and SameSite=None even in development', () => {
    // getSessionCookieConfig() sets both unconditionally (config/auth.js:114),
    // so a browser rejects it over plain http://localhost. That is why
    // req.session.oauthRole cannot survive a local Google sign-in, and it makes
    // the OAuth role intent untestable locally.
    let dev;
    process.env.NODE_ENV = 'development';
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      dev = require('../../config/auth').getSessionCookieConfig();
    });
    process.env.NODE_ENV = 'production';

    expect(dev.secure).toBe(true);
    expect(dev.sameSite).toBe('none');
  });
});

describe('production-only invariants in the domain layer', () => {
  test('a paid session carrying a synthetic payment id is refused', async () => {
    // sessionState.js:275 only enforces this in production, so it needs a
    // production-mode evaluation to exercise at all.
    let assertInvariants;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      ({ assertInvariants } = require('../../services/sessionState'));
    });

    expect(() => assertInvariants({
      status: 'scheduled', paymentStatus: 'paid',
      paymentId: 'mock_payment_1700000000', price: 1000, refundAmount: 0
    })).toThrow();

    // A genuine gateway id is fine.
    expect(() => assertInvariants({
      status: 'scheduled', paymentStatus: 'paid',
      paymentId: 'pay_realgatewayid01', price: 1000, refundAmount: 0
    })).not.toThrow();
  });

  test('but a stub-client account id is not caught by the same family of guards', () => {
    let payments;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      payments = require('../../config/payments');
    });

    expect(payments.isSyntheticAccountId('acc_mock_x')).toBe(true);
    expect(payments.isSyntheticAccountId('acc_stub_x')).toBe(false);
  });
});

describe('what production mode does NOT change', () => {
  test('the debug endpoints stay public', async () => {
    for (const path of ['/api/health', '/api/test-google-routes']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(prodApp).get(path);
      expect(res.status).toBe(200);
    }

    const health = await request(prodApp).get('/api/health');
    // Still publishes which secrets are configured, unauthenticated.
    expect(health.body.envVars).toBeDefined();
  });

  test('Content-Security-Policy remains disabled', async () => {
    const res = await request(prodApp).get('/api/health');
    expect(res.headers['content-security-policy']).toBeUndefined();
  });
});
