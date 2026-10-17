/**
 * Regression test for the H10 CSRF fix. Builds a tiny Express app that wires
 * csrf.middleware.js the exact same way server/app.js does — same mount
 * pattern (app.use('/api', csrfProtection)) — because the exemption logic
 * depends on Express stripping the '/api' prefix from req.path inside that
 * mount, which is exactly the kind of easy-to-get-wrong behavior that's worth
 * locking in with a real test rather than trusting by inspection.
 *
 * It mounts the real `csrfProtection`, not a copy of app.js's exemption list.
 * The list used to be duplicated here, so the test kept passing against its
 * own copy while the real one exempted every /auth/ and /admin/auth/ route.
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { issueCsrfToken, csrfProtection, isCsrfExempt } = require('../middleware/csrf.middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', csrfProtection);
  app.get('/api/csrf-token', issueCsrfToken);

  // Any method, any path: the handler only proves the request got through.
  app.all(/^\/api\/.*/, (req, res) => res.json({ ok: true }));

  return app;
}

function csrfCookieFrom(res) {
  const all = res.headers['set-cookie'] || [];
  const c = all.find((x) => x.startsWith('csrfToken='));
  return c ? c.split(';')[0].split('=')[1] : null;
}

describe('CSRF middleware wiring (mirrors server/app.js)', () => {
  test('GET requests are never blocked, even with no token', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/sessions/mine');
    expect(res.status).toBe(200);
  });

  test('POST to a normal API route with NO csrf token is rejected', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/sessions/book').send({});
    expect(res.status).toBe(403);
  });

  test('POST with matching cookie + header csrf token succeeds', async () => {
    const app = buildApp();
    // The token endpoint establishes the cookie (what the client does before
    // its first mutation) and returns the same value in the body.
    const first = await request(app).get('/api/csrf-token');
    const token = csrfCookieFrom(first);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(first.body.csrfToken).toBe(token);

    const res = await request(app)
      .post('/api/sessions/book')
      .set('Cookie', `csrfToken=${token}`)
      .set('X-CSRF-Token', token)
      .send({});
    expect(res.status).toBe(200);
  });

  test('POST with a MISMATCHED header token is rejected, not silently accepted', async () => {
    const app = buildApp();
    const first = await request(app).get('/api/csrf-token');
    const token = csrfCookieFrom(first);

    const res = await request(app)
      .post('/api/sessions/book')
      .set('Cookie', `csrfToken=${token}`)
      .set('X-CSRF-Token', 'a-completely-different-token-value')
      .send({});
    expect(res.status).toBe(403);
  });

  // These are the exact regression case: the exemptions must be relative to
  // the '/api' mount point, not include it — get this wrong and
  // login/webhooks/public-uploads break for everyone.
  test('POST /api/auth/login is exempt (no session cookie exists yet to protect)', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(200);
  });

  test('POST /api/payments/webhook is exempt (Razorpay authenticates via HMAC signature, not cookies)', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/payments/webhook').send({});
    expect(res.status).toBe(200);
  });

  test('POST /api/upload/doctor-document is exempt (intentionally public, unauthenticated endpoint)', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/upload/doctor-document').send({});
    expect(res.status).toBe(200);
  });

  test('every pre-session endpoint is exempt', async () => {
    const app = buildApp();
    const preSession = [
      ['post', '/api/auth/login'],
      ['post', '/api/auth/register'],
      ['post', '/api/auth/validate-registration'],
      ['post', '/api/auth/verify-signup'],
      ['post', '/api/auth/resend-signup-otp'],
      ['post', '/api/auth/forgot-password'],
      ['post', '/api/auth/reset-password'],
      ['post', '/api/admin/auth/login'],
      ['post', '/api/admin/auth/setup'],
      ['post', '/api/admin/auth/forgot-password'],
      ['post', `/api/admin/auth/reset-password/${'a'.repeat(96)}`],
      ['post', '/api/upload/doctor-documents'],
      // Express routes '/auth/login/' to '/auth/login', so the exemption must too.
      ['post', '/api/auth/login/']
    ];
    for (const [method, path] of preSession) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)[method](path).send({});
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });

  test('session-bound endpoints under /auth and /admin/auth are NOT exempt', async () => {
    // Regression. The exemptions used to be the PREFIXES '/auth/' and
    // '/admin/auth/', which swept in every endpoint under them that runs on
    // an existing session — so a page on any origin could post a form that
    // deleted the visitor's account or changed their password, or had a
    // signed-in super admin mint a new admin.
    const app = buildApp();
    const sessionBound = [
      ['put', '/api/auth/update-password'],
      ['delete', '/api/auth/delete-account'],
      ['post', '/api/auth/logout'],
      ['post', '/api/auth/patient-profile'],
      ['post', '/api/admin/auth/change-password'],
      ['post', '/api/admin/auth/create'],
      ['post', '/api/admin/auth/logout'],
      // A prefix match on '/upload/doctor-document' also covered this.
      ['post', '/api/upload/doctor-document-anything']
    ];
    for (const [method, path] of sessionBound) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)[method](path).send({});
      expect({ path, status: res.status, category: res.body.category })
        .toEqual({ path, status: 403, category: 'csrf' });
    }
  });

  test('isCsrfExempt does not match the /api-prefixed form', () => {
    expect(isCsrfExempt('/auth/login')).toBe(true);
    expect(isCsrfExempt('/api/auth/login')).toBe(false);
  });
});

describe('the token is minted in one place, so concurrent requests cannot desync it', () => {
  // Regression for "Invalid CSRF token. Please refresh the page" right after
  // a successful payment. Every cookie-less request used to mint and set its
  // own token. A fresh page load (always, in a private window) fires several
  // credentialed calls at once; each set a different cookie, the last one to
  // land won, and the value the client had cached from /api/csrf-token no
  // longer matched it.

  test('an ordinary request without the cookie does not set one', async () => {
    const app = buildApp();
    const get = await request(app).get('/api/sessions/mine');
    expect(csrfCookieFrom(get)).toBeNull();

    const post = await request(app).post('/api/auth/login').send({});
    expect(csrfCookieFrom(post)).toBeNull();
  });

  test('/api/csrf-token returns the cookie the browser already holds, unchanged', async () => {
    const app = buildApp();
    const held = 'a'.repeat(64);
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/api/csrf-token').set('Cookie', `csrfToken=${held}`);
      expect(res.body.csrfToken).toBe(held);
      expect(csrfCookieFrom(res)).toBe(held);
    }
  });

  test('a malformed cookie is replaced rather than echoed', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/csrf-token').set('Cookie', 'csrfToken=not-a-token');
    expect(res.body.csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(csrfCookieFrom(res)).toBe(res.body.csrfToken);
  });

  test('a page load racing several requests still ends with the cookie the client cached', async () => {
    const { startServer, stopServer } = require('./support/server');
    const server = await startServer(buildApp());
    try {
      const browser = request.agent(server); // keeps a cookie jar, like a browser

      const [tokenRes] = await Promise.all([
        browser.get('/api/csrf-token'),
        ...Array.from({ length: 6 }, () => browser.get('/api/sessions/mine'))
      ]);
      const cached = tokenRes.body.csrfToken;

      const res = await browser.post('/api/sessions/book').set('X-CSRF-Token', cached).send({});
      expect(res.status).toBe(200);
    } finally {
      await stopServer(server);
    }
  });

  test('the cookie lives as long as the auth cookie, with the cross-site attributes', () => {
    const { csrfCookieOptions } = require('../middleware/csrf.middleware');
    const opts = csrfCookieOptions();
    expect(opts.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
    expect(opts.httpOnly).toBe(false);
    expect(opts.path).toBe('/');
  });
});
