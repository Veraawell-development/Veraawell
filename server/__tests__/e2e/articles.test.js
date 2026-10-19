/**
 * Articles: 8.6% covered before this file, and the largest single-purpose
 * controller after session.controller. Full admin CRUD, slug generation,
 * publishing, the public read path, node-cache invalidation and the
 * unauthenticated like/view counters.
 *
 * A note on sanitisation: isomorphic-dompurify pulls an ESM-only dependency
 * that jest cannot parse, which is why every suite that requires app.js stubs
 * it (the same reason given at authz.routeCoverage.test.js:33). The stub below
 * is a real tag-stripper for the ALLOWED_TAGS: [] case, so these tests verify
 * that the controller CALLS sanitisation with the right allowlist on the right
 * fields. They do not exercise DOMPurify itself — that library's own correctness
 * is out of scope here and would need an unmocked integration test.
 */

require('../support/env');

const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const mongoose = require('mongoose');
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

const mockSanitizeCalls = [];
jest.mock('isomorphic-dompurify', () => ({
  sanitize: (input, opts) => {
    mockSanitizeCalls.push({ input, opts });
    const allowed = opts && opts.ALLOWED_TAGS;
    if (Array.isArray(allowed) && allowed.length === 0) {
      return String(input).replace(/<[^>]*>/g, '');
    }
    // Rich-text path: strip only the tags the allowlist omits that matter here.
    return String(input).replace(/<\/?(script|style|object|embed)[^>]*>/gi, '');
  }
}));

let app, f;
let server;
let superAdminToken, adminToken, patientToken;
let Article, cache;

beforeAll(async () => {
  await connectDb('articles');
  app = require('../../app');
  server = await startServer(app);
  Article = require('../../models/article');
  cache = require('../../services/cache.service');

  const { seedAll } = require('../support/seed');
  f = await seedAll();

  const jwt = require('jsonwebtoken');
  const { getJWTSecret, getAdminJWTSecret } = require('../../config/auth');
  superAdminToken = jwt.sign({ userId: String(f.superAdmin._id), role: 'super_admin' }, getAdminJWTSecret(), { expiresIn: '1h' });
  adminToken = jwt.sign({ userId: String(f.admin._id), role: 'admin' }, getAdminJWTSecret(), { expiresIn: '1h' });
  patientToken = jwt.sign({ userId: String(f.patientA._id), username: f.patientA.username, role: 'patient' }, getJWTSecret(), { expiresIn: '1h' });
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

beforeEach(async () => {
  await Article.deleteMany({});
  mockSanitizeCalls.length = 0;
  if (cache && cache.flush) cache.flush();
});

async function call(method, path, token, body) {
  const t = await request(server).get('/api/csrf-token');
  let req = request(server)[method](path)
    .set('Cookie', t.headers['set-cookie'])
    .set('X-CSRF-Token', t.body.csrfToken);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return body === undefined ? req.send() : req.send(body);
}

const draft = (over = {}) => ({
  title: 'Managing Anxiety at Work',
  description: 'Practical steps for the workplace.',
  content: '<p>Breathe, and take breaks.</p>',
  category: 'Anxiety',
  author: 'Dr Dev Mehta',
  ...over
});

async function createArticle(over) {
  return call('post', '/api/articles/admin', superAdminToken, draft(over));
}

describe('admin CRUD', () => {
  test('a super admin can create an article and it starts unpublished', async () => {
    const res = await createArticle();
    expect(res.status).toBeLessThan(300);

    const saved = await Article.findOne({});
    expect(saved.title).toBe('Managing Anxiety at Work');
    expect(saved.status).not.toBe('published');
    expect(String(saved.authorId)).toBe(String(f.superAdmin._id));
  });

  test('a slug is generated from the title', async () => {
    await createArticle();
    const saved = await Article.findOne({});
    expect(saved.slug).toBe('managing-anxiety-at-work');
  });

  test('two articles with the same title cannot collide on slug', async () => {
    const first = await createArticle();
    expect(first.status).toBeLessThan(300);
    const second = await createArticle();

    if (second.status < 300) {
      const slugs = (await Article.find({}).lean()).map((a) => a.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    } else {
      // Rejecting the duplicate outright is also a valid contract.
      expect(second.status).toBeGreaterThanOrEqual(400);
      expect(await Article.countDocuments({})).toBe(1);
    }
  });

  test('every required field is enforced', async () => {
    for (const missing of ['title', 'description', 'content', 'category', 'author']) {
      const body = draft();
      delete body[missing];
      const res = await call('post', '/api/articles/admin', superAdminToken, body);
      expect(res.status).toBe(400);
    }
    expect(await Article.countDocuments({})).toBe(0);
  });

  test('a non-URL image is refused', async () => {
    const res = await createArticle({ image: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
    expect(await Article.countDocuments({})).toBe(0);
  });

  test('a valid absolute image URL is accepted', async () => {
    const res = await createArticle({ image: 'https://cdn.example.com/a.jpg' });
    expect(res.status).toBeLessThan(300);
  });

  test('update is restricted to a field whitelist', async () => {
    await createArticle();
    const article = await Article.findOne({});
    const originalAuthorId = String(article.authorId);

    const res = await call('put', `/api/articles/admin/${article._id}`, superAdminToken, {
      title: 'Edited title',
      authorId: String(f.patientA._id),  // not on the whitelist
      views: 999999,                     // not on the whitelist
      slug: 'hijacked-slug'              // not on the whitelist
    });
    expect(res.status).toBeLessThan(300);

    const after = await Article.findById(article._id);
    expect(after.title).toBe('Edited title');
    expect(String(after.authorId)).toBe(originalAuthorId);
    expect(after.views).not.toBe(999999);
  });

  test('publishing flips status and the article becomes publicly visible', async () => {
    await createArticle();
    const article = await Article.findOne({});

    const before = await request(server).get('/api/articles/');
    const beforeList = before.body.articles || before.body.data || [];
    expect(beforeList).toHaveLength(0);

    const res = await call('post', `/api/articles/admin/${article._id}/publish`, superAdminToken, {});
    expect(res.status).toBeLessThan(300);
    expect((await Article.findById(article._id)).status).toBe('published');

    const after = await request(server).get('/api/articles/');
    const afterList = after.body.articles || after.body.data || [];
    expect(afterList.length).toBeGreaterThan(0);
  });

  test('featuring toggles the flag', async () => {
    await createArticle();
    const article = await Article.findOne({});
    const wasFeatured = article.featured;

    await call('post', `/api/articles/admin/${article._id}/feature`, superAdminToken, {});
    expect((await Article.findById(article._id)).featured).not.toBe(wasFeatured);
  });

  test('delete removes it from the public list', async () => {
    await createArticle();
    const article = await Article.findOne({});
    await call('post', `/api/articles/admin/${article._id}/publish`, superAdminToken, {});

    const res = await call('delete', `/api/articles/admin/${article._id}`, superAdminToken);
    expect(res.status).toBeLessThan(300);

    const list = await request(server).get('/api/articles/');
    const items = list.body.articles || list.body.data || [];
    expect(items.map((a) => a.title)).not.toContain('Managing Anxiety at Work');
  });

  test('a malformed article id is a clean 400', async () => {
    const res = await call('get', '/api/articles/admin/not-an-objectid', superAdminToken);
    expect(res.status).toBe(400);
  });
});

describe('sanitisation wiring', () => {
  test('title, description and author are sanitised with an empty tag allowlist', async () => {
    await createArticle({
      title: 'Anxiety <script>alert(1)</script>',
      description: 'Help <img src=x onerror=alert(1)>',
      author: 'Dr <b>Dev</b>'
    });

    const saved = await Article.findOne({});
    expect(saved.title).not.toMatch(/<script>/i);
    expect(saved.description).not.toMatch(/<img/i);
    expect(saved.author).toBe('Dr Dev');

    // The plain-text fields must be sanitised with ALLOWED_TAGS: [].
    const plainCalls = mockSanitizeCalls.filter((c) => c.opts && Array.isArray(c.opts.ALLOWED_TAGS) && c.opts.ALLOWED_TAGS.length === 0);
    expect(plainCalls.length).toBeGreaterThanOrEqual(3);
  });

  test('content keeps safe rich-text tags but is passed through an allowlist', async () => {
    await createArticle({ content: '<p>Fine</p><script>bad()</script>' });

    const saved = await Article.findOne({});
    expect(saved.content).toContain('<p>');
    expect(saved.content).not.toMatch(/<script>/i);

    const richCall = mockSanitizeCalls.find((c) => c.opts && Array.isArray(c.opts.ALLOWED_TAGS) && c.opts.ALLOWED_TAGS.includes('p'));
    expect(richCall).toBeDefined();
    expect(richCall.opts.ALLOWED_TAGS).not.toContain('script');
  });

  test('tags accept both a single string and an array, and are sanitised', async () => {
    await createArticle({ title: 'Single tag piece', tags: 'stress<b>y</b>' });
    let saved = await Article.findOne({ title: 'Single tag piece' });
    // Markup is removed; the text it wrapped survives, which is what
    // ALLOWED_TAGS: [] means.
    expect(saved.tags).toEqual(['stressy']);

    await Article.deleteMany({});
    await createArticle({ title: 'Array tag piece', tags: ['stress', '  ', 'sleep'] });
    saved = await Article.findOne({ title: 'Array tag piece' });
    // Blank entries are filtered out.
    expect(saved.tags).toEqual(['stress', 'sleep']);
  });
});

describe('the public read path', () => {
  async function published(over) {
    await createArticle(over);
    const a = await Article.findOne(over && over.title ? { title: over.title } : {});
    await call('post', `/api/articles/admin/${a._id}/publish`, superAdminToken, {});
    return Article.findById(a._id);
  }

  test('an article is readable by slug once published', async () => {
    const a = await published();
    const res = await request(server).get(`/api/articles/${a.slug}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('Managing Anxiety at Work');
  });

  test('an unpublished article is not readable by slug', async () => {
    await createArticle();
    const a = await Article.findOne({});
    const res = await request(server).get(`/api/articles/${a.slug}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('read time counts words joined by &nbsp; — pasted articles said "1 min read"', async () => {
    const words = Array.from({ length: 450 }, (_, i) => `word${i}`).join('&nbsp;');
    const a = await published({ title: 'Pasted From An Editor', content: `<p>${words}</p>` });
    const one = await request(server).get(`/api/articles/${a.slug}`);
    expect(one.body.readTime).toBe('3 mins read');
    const list = await request(server).get('/api/articles');
    const row = list.body.articles.find((x) => x.slug === a.slug);
    expect(row.readTime).toBe('3 mins read');
    expect(row.content).toBeUndefined(); // the list still doesn't send bodies
    expect(Article.readTimeOf('')).toBe('1 min read');
  });

  test('an unknown slug is a 404, not a 500', async () => {
    const res = await request(server).get('/api/articles/no-such-article-anywhere');
    expect(res.status).toBe(404);
  });

  test('the list can be filtered by category', async () => {
    await published({ title: 'Anxiety piece', category: 'Anxiety' });
    await published({ title: 'Sleep piece', category: 'Sleep' });

    const res = await request(server).get('/api/articles/?category=Sleep');
    expect(res.status).toBe(200);
    const items = res.body.articles || res.body.data || [];
    expect(items.map((a) => a.title)).toEqual(['Sleep piece']);
  });

  test('a page is at most 50 articles, whatever ?limit= asks for', async () => {
    await Article.insertMany(Array.from({ length: 55 }, (_, i) => ({
      title: `Bulk ${i}`, slug: `bulk-${i}`, description: 'd', content: 'c', category: 'Bulk',
      author: 'A', authorId: f.superAdmin._id, status: 'published', publishedDate: new Date()
    })));
    const res = await request(server).get('/api/articles/?limit=100000');
    expect(res.status).toBe(200);
    expect(res.body.articles).toHaveLength(50);
    expect(res.body.pagination).toMatchObject({ limit: 50, total: 55, pages: 2 });

    // Garbage paging falls back to sane defaults rather than NaN.
    const odd = await request(server).get('/api/articles/?limit=abc&page=-3');
    expect(odd.body.pagination).toMatchObject({ page: 1, limit: 10 });
  });

  test('unread query parameters do not mint new cache entries', async () => {
    // The key was JSON.stringify(req.query), so varying a parameter nobody
    // reads grew the in-process cache without bound.
    await published({ title: 'Cache key piece' });
    cache.flush();
    const spy = jest.spyOn(cache, 'set');
    try {
      for (let i = 0; i < 5; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        expect((await request(server).get(`/api/articles/?junk=${i}`)).status).toBe(200);
      }
      // The first request misses and stores; the other four hit that entry.
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  test('featuring an article shows up in the public list immediately', async () => {
    // toggleFeatured was the one write that did not invalidate the cache, so
    // the landing page kept the old featured article for up to five minutes.
    const a = await published({ title: 'Feature me' });
    const before = await request(server).get('/api/articles/?featured=true');
    expect(before.body.articles).toHaveLength(0);

    const res = await call('post', `/api/articles/admin/${a._id}/feature`, superAdminToken, {});
    expect(res.status).toBeLessThan(300);

    const after = await request(server).get('/api/articles/?featured=true');
    expect(after.body.articles.map((x) => x.title)).toEqual(['Feature me']);
  });

  test('a server failure does not echo the internal error message', async () => {
    const spy = jest.spyOn(Article, 'countDocuments').mockRejectedValueOnce(new Error('internal-db-detail-marker'));
    try {
      const res = await request(server).get('/api/articles/?page=7');
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/internal-db-detail-marker/);
    } finally {
      spy.mockRestore();
    }
  });

  test('the cache is invalidated when an article changes', async () => {
    const a = await published({ title: 'Cached piece' });

    const first = await request(server).get('/api/articles/');
    expect(JSON.stringify(first.body)).toContain('Cached piece');

    const renamed = await call('put', `/api/articles/admin/${a._id}`, superAdminToken, { title: 'Renamed piece' });
    // Assert the write landed before blaming the cache: an unchecked PUT makes
    // an auth failure look identical to a stale read.
    expect(renamed.status).toBeLessThan(300);
    expect((await Article.findById(a._id)).title).toBe('Renamed piece');

    const second = await request(server).get('/api/articles/');
    expect(JSON.stringify(second.body)).toContain('Renamed piece');
    expect(JSON.stringify(second.body)).not.toContain('Cached piece');
  });
});

describe('the unauthenticated like and view counters', () => {
  async function publishedArticle() {
    await createArticle();
    const a = await Article.findOne({});
    await call('post', `/api/articles/admin/${a._id}/publish`, superAdminToken, {});
    return a;
  }

  test('a view can be recorded with no account, though a CSRF token is still required', async () => {
    const a = await publishedArticle();
    const before = (await Article.findById(a._id)).views || 0;

    const res = await call('post', `/api/articles/${a._id}/view`, null, {});
    expect(res.status).toBeLessThan(300);
    expect((await Article.findById(a._id)).views).toBe(before + 1);
  });

  test('a like is a per-caller toggle, not an unbounded counter', async () => {
    // article.controller.js:135 keys likedBy on req.user?._id || req.ip, so an
    // anonymous caller is identified by IP and a repeat call un-likes rather
    // than incrementing again. Five calls from one caller therefore net to +1,
    // not +5 — the counter cannot be inflated by replay from a single source.
    const a = await publishedArticle();
    const before = (await Article.findById(a._id)).likes || 0;

    for (let i = 0; i < 5; i += 1) {
      const res = await call('post', `/api/articles/${a._id}/like`, null, {});
      expect(res.status).toBeLessThan(300);
    }

    const after = await Article.findById(a._id);
    expect(after.likes).toBe(before + 1);
    expect(after.likedBy).toHaveLength(1);
  });

  test('an even number of likes from one caller returns to the starting count', async () => {
    const a = await publishedArticle();
    const before = (await Article.findById(a._id)).likes || 0;

    await call('post', `/api/articles/${a._id}/like`, null, {});
    await call('post', `/api/articles/${a._id}/like`, null, {});

    const after = await Article.findById(a._id);
    expect(after.likes).toBe(before);
    expect(after.likedBy).toHaveLength(0);
  });

  test('no public response carries likedBy — the IPs of everyone who liked it', async () => {
    // The like toggle remembers an anonymous visitor by IP, and both public
    // reads returned that array. The count is `likes`.
    const a = await publishedArticle();
    await call('post', `/api/articles/${a._id}/like`, null, {});
    expect((await Article.findById(a._id)).likedBy).toHaveLength(1);

    const list = await request(server).get('/api/articles/');
    const detail = await request(server).get(`/api/articles/${a.slug}`);
    for (const res of [list, detail]) {
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/likedBy|authorId/);
      expect(JSON.stringify(res.body)).not.toMatch(/127\.0\.0\.1|::1/);
    }
    expect(detail.body.likes).toBe(1);
    expect(list.body.articles[0].likes).toBe(1);
  });

  test('a draft cannot be liked or viewed by id', async () => {
    await createArticle();
    const draftDoc = await Article.findOne({});
    expect((await call('post', `/api/articles/${draftDoc._id}/like`, null, {})).status).toBe(404);
    expect((await call('post', `/api/articles/${draftDoc._id}/view`, null, {})).status).toBe(404);
    const after = await Article.findById(draftDoc._id);
    expect(after.likes).toBe(0);
    expect(after.views).toBe(0);
  });

  test('simultaneous likes from different visitors are all counted', async () => {
    // The toggle was load / edit / save, writing `likes` back as an absolute
    // number, so concurrent likes overwrote each other.
    const a = await publishedArticle();
    const ids = ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4'];
    let n = 0;
    // Give each request a distinct client identity without touching the
    // network stack: the controller keys on req.ip. Mounted bare because the
    // real route's rate limiter also keys on the IP.
    const bare = require('express')();
    bare.use((req, res, next) => { Object.defineProperty(req, 'ip', { value: ids[n++ % ids.length] }); next(); });
    bare.post('/like/:id', require('../../controllers/article.controller').incrementLikes);
    await Promise.all(ids.map(() => request(bare).post(`/like/${a._id}`)));

    const after = await Article.findById(a._id);
    expect(after.likes).toBe(4);
    expect(after.likedBy).toHaveLength(4);
  });

  test('a malformed id on the counters is a clean 400', async () => {
    expect((await call('post', '/api/articles/not-an-id/view', null, {})).status).toBe(400);
    expect((await call('post', '/api/articles/not-an-id/like', null, {})).status).toBe(400);
  });
});

describe('authorization', () => {
  test('every admin article route refuses a plain admin — super admin only', async () => {
    await createArticle();
    const a = await Article.findOne({});

    const cases = [
      ['get', '/api/articles/admin/all'],
      ['get', `/api/articles/admin/${a._id}`],
      ['post', '/api/articles/admin'],
      ['put', `/api/articles/admin/${a._id}`],
      ['delete', `/api/articles/admin/${a._id}`],
      ['post', `/api/articles/admin/${a._id}/publish`],
      ['post', `/api/articles/admin/${a._id}/feature`]
    ];
    for (const [method, path] of cases) {
      const res = await call(method, path, adminToken, {});
      expect(res.status).toBe(403);
    }
  });

  test('a patient user-realm token reaches none of them', async () => {
    const res = await call('get', '/api/articles/admin/all', patientToken);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('anonymous callers reach none of them', async () => {
    const res = await call('get', '/api/articles/admin/all', null);
    expect(res.status).toBe(401);
  });
});
