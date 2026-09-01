/**
 * Every route must state its authorization on the route line.
 *
 * This is the test that makes the authorization work durable. Fixing four
 * missing checks was necessary; stopping the fifth from being written is what
 * actually changes the outcome. `POST /api/sessions/:sessionId/missed` shipped
 * with no ownership check at all, and its route declaration was
 * indistinguishable from the neighbouring routes that had one — so nobody
 * could have spotted it in review.
 *
 * Every middleware from server/authz carries a `__authz` tag, so the set of
 * routes with no declared policy is computable from Express's own router
 * stack. This test pins that set:
 *
 *   - a NEW route with no policy fails immediately;
 *   - the legacy backlog in authz/UNDECLARED.js may only shrink.
 *
 * When you convert a route, delete its line from UNDECLARED.js. If you forget,
 * the staleness check below tells you.
 */

process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';
// app.js builds the connect-mongo session store at module load, which dials
// MONGO_URI. Point it at a scratch database so requiring the app cannot reach
// a real one.
process.env.MONGO_URI = 'mongodb://127.0.0.1:27099/authz-route-coverage-test';

// isomorphic-dompurify pulls in jsdom, which depends on an ESM-only package
// that jest cannot parse from node_modules. This test only walks the router
// stack, so a stub is sufficient — and it is the reason no previous test could
// require app.js at all.
jest.mock('isomorphic-dompurify', () => ({ sanitize: (v) => v }));

const { enumerateUndeclaredRoutes, enumerateRoutes, coverageSummary } = require('../authz/audit');
const KNOWN_UNDECLARED = require('../authz/UNDECLARED');

let app;
beforeAll(() => {
  app = require('../app');
});

describe('authorization route coverage', () => {
  test('the router stack is walkable and finds every route', () => {
    const routes = enumerateRoutes(app);
    // A sanity floor: if the walker silently stops finding routes, the two
    // assertions below would pass vacuously.
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.some((r) => r.path === '/api/sessions/:sessionId/missed')).toBe(true);
  });

  test('no route outside the known backlog is missing an authorization declaration', () => {
    const undeclared = enumerateUndeclaredRoutes(app);
    const unexpected = undeclared.filter((r) => !KNOWN_UNDECLARED.has(r));

    // If this fails you added a route (or removed its policy) without stating
    // who may call it. Add authorize(...)/withScope(...)/requireRole(...), or
    // publicRoute('<why>') if it is deliberately open.
    expect(unexpected).toEqual([]);
  });

  test('the backlog only shrinks — no stale entries', () => {
    const undeclared = new Set(enumerateUndeclaredRoutes(app));
    const stale = [...KNOWN_UNDECLARED].filter((r) => !undeclared.has(r));

    // A stale entry means a route was converted (good) but its line was left
    // in UNDECLARED.js, which would let a future regression on that route slip
    // back in unnoticed. Delete the listed lines.
    expect(stale).toEqual([]);
  });

  test('the routes converted so far stay converted', () => {
    const undeclared = new Set(enumerateUndeclaredRoutes(app));

    // The endpoints behind the verified vulnerabilities. Losing a declaration
    // here is a direct regression of a known hole.
    const mustBeDeclared = [
      'POST /api/sessions/:sessionId/missed',
      'POST /api/sessions/:sessionId/cancel',
      'POST /api/sessions/:sessionId/complete',
      'GET /api/sessions/:sessionId',
      'GET /api/session-reports/patient/:patientId',
      'POST /api/session-tools/notes',
      'GET /api/session-tools/notes/patient/:patientId',
      'GET /api/session-tools/reports/patient/:patientId',
      'GET /api/session-tools/journal/patient/:patientId',
      'PATCH /api/admin/payments/settings/fee',
      'POST /api/admin/payments/sessions/:sessionId/refund'
    ];
    const regressed = mustBeDeclared.filter((r) => undeclared.has(r));
    expect(regressed).toEqual([]);
  });

  test('coverage summary is reportable', () => {
    const summary = coverageSummary(app);
    expect(summary.total).toBe(summary.declared + summary.undeclared);
    // eslint-disable-next-line no-console
    console.log(
      `authz coverage: ${summary.declared}/${summary.total} routes declared ` +
      `(${summary.undeclared} in the conversion backlog)`
    );
  });
});
