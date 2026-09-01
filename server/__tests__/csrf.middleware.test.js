/**
 * Regression test for the H10 CSRF fix. Builds a tiny Express app that wires
 * csrf.middleware.js the exact same way server/app.js does — same mount
 * pattern (app.use('/api', ...)), same exemption-prefix approach — because
 * the exemption logic depends on Express stripping the '/api' prefix from
 * req.path inside that mount, which is exactly the kind of easy-to-get-wrong
 * behavior that's worth locking in with a real test rather than trusting by
 * inspection.
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { issueCsrfToken, verifyCSRF } = require('../middleware/csrf.middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(issueCsrfToken);

  const CSRF_EXEMPT_PREFIXES = ['/payments/webhook', '/auth/', '/admin/auth/', '/upload/doctor-document'];
  app.use('/api', (req, res, next) => {
    if (CSRF_EXEMPT_PREFIXES.some(p => req.path.startsWith(p))) return next();
    return verifyCSRF(req, res, next);
  });

  app.get('/api/sessions/mine', (req, res) => res.json({ ok: true }));
  app.post('/api/sessions/book', (req, res) => res.json({ ok: true }));
  app.post('/api/auth/login', (req, res) => res.json({ ok: true }));
  app.post('/api/payments/webhook', (req, res) => res.json({ ok: true }));
  app.post('/api/upload/doctor-document', (req, res) => res.json({ ok: true }));

  return app;
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
    // First request establishes the cookie (mirrors a page load before any mutation)
    const first = await request(app).get('/api/sessions/mine');
    const setCookie = first.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const csrfCookie = setCookie.find(c => c.startsWith('csrfToken='));
    expect(csrfCookie).toBeDefined();
    const token = csrfCookie.split(';')[0].split('=')[1];

    const res = await request(app)
      .post('/api/sessions/book')
      .set('Cookie', `csrfToken=${token}`)
      .set('X-CSRF-Token', token)
      .send({});
    expect(res.status).toBe(200);
  });

  test('POST with a MISMATCHED header token is rejected, not silently accepted', async () => {
    const app = buildApp();
    const first = await request(app).get('/api/sessions/mine');
    const csrfCookie = first.headers['set-cookie'].find(c => c.startsWith('csrfToken='));
    const token = csrfCookie.split(';')[0].split('=')[1];

    const res = await request(app)
      .post('/api/sessions/book')
      .set('Cookie', `csrfToken=${token}`)
      .set('X-CSRF-Token', 'a-completely-different-token-value')
      .send({});
    expect(res.status).toBe(403);
  });

  // These four are the exact regression case: the exemption prefixes must be
  // relative to the '/api' mount point, not include it — get this wrong and
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
});
