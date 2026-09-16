/**
 * Shared test harness.
 *
 * Extracted because the mongodb-memory-server lifecycle, the user factory and
 * the "build an app" idiom were copy-pasted across four test files, each with
 * hand-uniquified emails (`pat@test.com`, `pat2@test.com`, ...) that had to be
 * kept distinct by hand.
 *
 * It also fixes a more important weakness. The previous idiom stubbed
 * authentication with `app.use((req,res,next) => { req.user = {_id, role} })`
 * and mounted a controller function directly. That meant no test in the suite
 * ever exercised verifyToken, and — more to the point — no test exercised the
 * route's middleware chain, which is where authorization is declared. A test
 * that bypasses the route cannot catch a missing check on the route.
 *
 * `mountRoutes` mounts the real router, so requests travel the real path:
 * verifyToken -> validateObjectIdParam -> authorize/withScope -> controller.
 */

const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

/**
 * These suites share the one mongod that globalSetup.js starts, each on its
 * own database — the arrangement __tests__/support/db.js already uses and
 * explains.
 *
 * They used to call `MongoMemoryServer.create()` each, so a full run started
 * a mongod per suite on top of the shared one. The symptom is precisely the
 * one support/db.js's docblock describes: under load a suite that takes four
 * seconds takes minutes and then times out, and it presents as flaky
 * application code. It was reliably reproducible here — `authz.matrix`,
 * `cancelSession.idempotency`, `completeSession.idempotency` and
 * `production.posture` each failed in some full runs and passed alone, a
 * different pair almost every time.
 *
 * The e2e suites were migrated to the shared server; these four were missed.
 */
function baseUri() {
  const uri = process.env.__TEST_MONGO_URI__;
  if (!uri) {
    throw new Error(
      'No shared test MongoDB. __tests__/support/globalSetup.js must run first — '
      + 'check the jest globalSetup entry in package.json.'
    );
  }
  if (!/(127\.0\.0\.1|localhost)/.test(uri)) {
    throw new Error(`refusing to connect: shared test URI is not loopback (${uri})`);
  }
  return uri.replace(/\/?$/, '/');
}

/**
 * Connect mongoose to this suite's own database. Call from beforeAll.
 *
 * The database name is derived from the calling test file, so two suites can
 * never share state even though they share a server.
 */
async function startDb(suiteName) {
  const name = suiteName
    || (expect.getState && expect.getState().testPath
      ? require('path').basename(expect.getState().testPath, '.test.js')
      : `anon_${Date.now()}`);
  const db = `h_${String(name).replace(/[^a-zA-Z0-9_]/g, '_')}`;
  await mongoose.connect(`${baseUri()}${db}`);
  return mongoose.connection;
}

/** Drop this suite's database and disconnect. Call from afterAll. */
async function stopDb() {
  if (mongoose.connection.readyState === 1) {
    try { await mongoose.connection.dropDatabase(); } catch (e) { /* best effort */ }
  }
  await mongoose.disconnect();
}

/** Wipe every collection. Cheaper and less error-prone than listing models. */
async function clearDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

/**
 * Build an app from real routers.
 * @param {Record<string,string>} mounts  mountPath -> router module path
 */
function mountRoutes(mounts) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  for (const [path, modulePath] of Object.entries(mounts)) {
    app.use(path, require(modulePath));
  }
  app.use(require('../../middleware/error.middleware').errorHandler);
  return app;
}

/** A genuine user-realm JWT, so verifyToken runs for real. */
function tokenFor(user) {
  const { getJWTSecret } = require('../../config/auth');
  return jwt.sign(
    { userId: user._id.toString(), username: user.username, role: user.role },
    getJWTSecret(),
    { expiresIn: '1h' }
  );
}

/** A genuine admin-realm JWT (verified with ADMIN_JWT_SECRET). */
function adminTokenFor(user) {
  const { getAdminJWTSecret } = require('../../config/auth');
  return jwt.sign(
    { userId: user._id.toString(), role: user.role },
    getAdminJWTSecret(),
    { expiresIn: '1h' }
  );
}

let seq = 0;
/** Unique-by-construction user factory — no more hand-numbered emails. */
async function makeUser(role = 'patient', extra = {}) {
  const User = require('../../models/user');
  seq += 1;
  return User.create({
    firstName: role,
    lastName: `T${seq}`,
    email: `${role}.${seq}.${Date.now()}@test.local`,
    username: `${role}_${seq}_${Date.now()}`,
    password: 'password123',
    role,
    approvalStatus: 'approved',
    ...extra
  });
}

/**
 * A session in a realistic paid state.
 * @param {number} hoursFromNow  negative for the past
 */
async function makeSession({ patient, doctor, hoursFromNow = 72, ...overrides }) {
  const Session = require('../../models/session');
  const when = new Date(Date.now() + hoursFromNow * 3600 * 1000);

  // `startsAt` is the authoritative instant; the model derives sessionDate,
  // sessionTime, endsAt and the local fields from it.
  //
  // This fixture used to set only the legacy (sessionDate, sessionTime) pair
  // and let resolveStartsAt work backwards. That derivation asks "does this
  // date carry a time component?" to tell a real instant from a UTC-midnight
  // calendar date — so whenever `now + hoursFromNow` happened to land on
  // exactly 00:00 UTC, the fixture was read as a legacy calendar date and its
  // time string re-interpreted as IST wall clock, moving the session 5h30m
  // earlier than intended. A session seeded "10 hours out" became 3.9 hours
  // out, which silently crossed the 4-hour refund boundary. The result was a
  // test that failed for roughly half an hour a day and passed the rest of
  // the time — and looked like flaky infrastructure.
  return Session.create({
    patientId: patient._id,
    doctorId: doctor._id,
    startsAt: when,
    duration: 60,
    price: 1000,
    status: 'scheduled',
    paymentStatus: 'paid',
    // Not a synthetic prefix, so the refund path treats it as a real payment.
    paymentId: 'pay_realpaymentid123',
    ...overrides
  });
}

module.exports = {
  startDb, stopDb, clearDb,
  mountRoutes, tokenFor, adminTokenFor,
  makeUser, makeSession
};
