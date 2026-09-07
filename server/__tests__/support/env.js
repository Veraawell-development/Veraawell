/**
 * Safe environment defaults for the e2e suites. Require this FIRST, before any
 * application module.
 *
 * Why it matters: config/environment.js runs dotenv.config(), which loads
 * server/.env — and that file's MONGO_URI points at the live Atlas cluster.
 * Nothing in a suite that builds its own Express app will dial it, but
 * app.js creates a connect-mongo session store at module load (app.js:253),
 * so any suite that requires the real app WOULD. dotenv does not overwrite
 * variables that are already set, so assigning here wins.
 *
 * The MONGO_URI below is a deliberately dead loopback port: if some code path
 * tries to use it instead of the in-memory server, it fails fast and loudly
 * rather than quietly reaching production.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
// MONGO_URI is supplied by __tests__/support/globalSetup.js — a real, empty,
// loopback mongod that backs app.js's connect-mongo session store. Only fall
// back to a scratch value if a suite is somehow run without globalSetup, so
// that the value in server/.env (a live Atlas cluster) is never inherited.
if (!process.env.__TEST_SESSION_STORE_URI__) {
  process.env.MONGO_URI = 'mongodb://127.0.0.1:27099/veraawell-e2e-scratch';
}
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

// Distinct on purpose. In non-production getAdminJWTSecret() falls back to
// getJWTSecret() (config/auth.js:37-50); with one value every assertion about
// the user/admin realm boundary would pass vacuously.
process.env.JWT_SECRET = 'e2e-user-realm-secret';
process.env.ADMIN_JWT_SECRET = 'e2e-admin-realm-secret-distinct';
process.env.SESSION_SECRET = 'e2e-session-secret';

process.env.RAZORPAY_KEY_ID = 'rzp_test_e2e';
process.env.RAZORPAY_KEY_SECRET = 'e2e_key_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'e2e_webhook_secret';
process.env.CLOUDINARY_CLOUD_NAME = 'stub';
process.env.CLOUDINARY_API_KEY = 'stub';
process.env.CLOUDINARY_API_SECRET = 'stub';
process.env.FRONTEND_URL = 'http://localhost:5173';
delete process.env.RESEND;

/** Fail a suite loudly if anything ever repoints MONGO_URI off loopback. */
function assertNotProduction() {
  const uri = process.env.MONGO_URI || '';
  if (!/(127\.0\.0\.1|localhost|0\.0\.0\.0)/.test(uri)) {
    throw new Error(`MONGO_URI escaped loopback during a test run: ${uri}`);
  }
}

module.exports = { assertNotProduction };
