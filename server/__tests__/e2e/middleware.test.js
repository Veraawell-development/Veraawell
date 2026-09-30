/**
 * The middleware stack, as actually mounted.
 *
 * app.js composes 20 middlewares in a specific order and several of them have
 * behaviour that only shows up at the seams: the CSRF exemption prefixes are
 * relative to the '/api' mount, the Razorpay webhook depends on req.rawBody
 * being stashed by express.json's verify hook, and the CORS allowedHeaders list
 * decides whether the client's own CSRF header can cross an origin boundary.
 *
 * The CORS test below is the reproduction for a production-only defect: it
 * cannot be seen locally, because Vite proxies /api and makes every request
 * same-origin, which skips preflight entirely.
 */

require('../support/env');

const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: jest.fn(), fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));
jest.mock('isomorphic-dompurify', () => ({ sanitize: (s) => s }));

let app;
let server;

beforeAll(async () => {
  await connectDb('middleware');
  app = require('../../app');
  server = await startServer(app);
}, 120000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

describe('CORS', () => {
  const FRONTEND = 'https://veraawell.vercel.app';

  test('the preflight allows X-CSRF-Token, which the client sends on every mutation', async () => {
    // client/src/utils/csrfFetchInterceptor.ts sets this header on every
    // POST/PUT/PATCH/DELETE.
    //
    // X-CSRF-Token is not a CORS-safelisted request header, so a real browser
    // must ask permission for it in the preflight and will refuse to send the
    // request when it is absent from Access-Control-Allow-Headers. In the
    // production topology (Vercel frontend -> api.veraawell.com) its absence
    // meant every state-changing request failed before it was issued.
    const res = await request(server)
      .options('/api/sessions/book')
      .set('Origin', FRONTEND)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-token');

    const allowed = String(res.headers['access-control-allow-headers'] || '').toLowerCase();

    expect(allowed).toContain('content-type');
    expect(allowed).toContain('authorization');
    expect(allowed).toContain('x-csrf-token');
  });

  test('credentials are allowed, so the cookie half of the double-submit pair would be sent', async () => {
    const res = await request(server)
      .options('/api/sessions/book')
      .set('Origin', FRONTEND)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('a request with no Origin header is always allowed through', async () => {
    // app.js:78 — deliberate, for curl and native clients. Worth pinning
    // because it means Origin-based reasoning is not a security boundary here.
    const res = await request(server).get('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('CSRF double-submit', () => {
  test('GET /api/csrf-token issues a readable cookie and echoes the value', async () => {
    const res = await request(server).get('/api/csrf-token');
    expect(res.status).toBe(200);
    const setCookie = String(res.headers['set-cookie'] || '');
    expect(setCookie).toMatch(/csrfToken=/);
    // Must NOT be httpOnly: the client has to read it to echo it back.
    expect(setCookie).not.toMatch(/csrfToken=[^;]*;[^]*HttpOnly/i);
  });

  test('a mutating request with no CSRF token is refused with category csrf', async () => {
    const res = await request(server).post('/api/session-tools/journal').send({ title: 'x', content: 'y' });
    expect(res.status).toBe(403);
    expect(res.body.category).toBe('csrf');
  });

  test('a GET is never blocked by CSRF', async () => {
    const res = await request(server).get('/api/sessions/doctors');
    expect(res.status).toBeLessThan(400);
  });

  test('the exemption prefixes are relative to the /api mount, not absolute', async () => {
    // app.js:182-190 spells this out: req.path inside app.use('/api', ...) has
    // the mount prefix stripped, so an entry written as '/api/auth/' would
    // never match and login would start demanding a CSRF token.
    // Reaching a non-403 here proves the prefix matches.
    const res = await request(server).post('/api/auth/login').send({ username: 'nobody@test.local', password: 'whatever123' });
    expect(res.status).not.toBe(403);
  });

  test('the webhook is exempt, so Razorpay never needs a CSRF token', async () => {
    const res = await request(server).post('/api/payments/webhook').send({ event: 'payment.captured' });
    // Refused for a missing signature, NOT for a missing CSRF token.
    expect(res.status).toBe(400);
    expect(res.body.category).not.toBe('csrf');
  });

  test('the public doctor-document upload is exempt', async () => {
    const res = await request(server).post('/api/upload/doctor-document').send({});
    expect(res.body.category).not.toBe('csrf');
  });
});

describe('body parsing and limits', () => {
  test('a payload over 1mb is rejected', async () => {
    const big = 'x'.repeat(1024 * 1024 + 2048);
    const res = await request(server)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'a@b.c', password: big }));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('express.json stashes the raw bytes on req.rawBody for signature checks', async () => {
    // The webhook fails CLOSED without it (payment.controller.js:260-266) and
    // must never fall back to re-serialising req.body, which is not
    // byte-identical to what Razorpay signed.
    const crypto = require('crypto');
    const payload = JSON.stringify({ event: 'payment.captured', payload: {} });
    const sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex');

    const res = await request(server)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sig)
      .send(payload);

    // The signature verified — anything but "invalid signature" proves rawBody
    // reached the handler.
    expect(String(res.body.message || '')).not.toMatch(/invalid signature/i);
  });
});

describe('input sanitisation', () => {
  test('a NoSQL operator in the body is stripped rather than reaching the query', async () => {
    const res = await request(server)
      .post('/api/auth/login')
      .send({ username: { $ne: null }, password: { $ne: null } });
    // With mongoSanitize the operator keys are replaced, so this cannot
    // degrade into "find any user".
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.token).toBeUndefined();
  });
});

describe('error handling', () => {
  test('an unknown route is a JSON 404, not an HTML error page', async () => {
    const res = await request(server).get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.success).toBe(false);
  });

  test('a malformed ObjectId is a clean 400, not a 500', async () => {
    const res = await request(server).get('/api/sessions/doctors/not-an-objectid');
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(500);
  });

  test('rate limiting is NOT mounted outside production', async () => {
    // app.js:122-137. In production the authLimiter allows 5 attempts per 15
    // minutes; here nothing is mounted, so twenty consecutive failures all
    // return 401. Pinned because it means local runs and any non-production
    // deployment have no brute-force protection at all.
    //
    // One long-lived server with keep-alive rather than supertest's
    // server-per-request: twenty ephemeral listeners in a tight loop
    // intermittently produced a "socket hang up" that had nothing to do with
    // the behaviour under test.
    const http = require('http');
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });

    const attempt = () => new Promise((resolve, reject) => {
      const body = JSON.stringify({ username: 'nobody@test.local', password: 'wrongpass1' });
      const req = http.request({
        host: '127.0.0.1', port, path: '/api/auth/login', method: 'POST', agent,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject);
      req.end(body);
    });

    const statuses = [];
    for (let i = 0; i < 20; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      statuses.push(await attempt());
    }

    agent.destroy();
    await new Promise((resolve) => server.close(resolve));

    expect(statuses).toHaveLength(20);
    expect(statuses.every((s) => s === 401)).toBe(true);
    expect(statuses).not.toContain(429);
  }, 60000);
});

describe('security headers', () => {
  test('helmet is applied but Content-Security-Policy is deliberately disabled', async () => {
    const res = await request(server).get('/api/health');
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
    // app.js:113 — "Disable for now to avoid breaking existing functionality".
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  test('the health endpoint publishes configuration presence without auth', async () => {
    const res = await request(server).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.envVars).toEqual(expect.objectContaining({
      hasJwtSecret: expect.any(Boolean),
      hasMongoUri: expect.any(Boolean)
    }));
  });
});
