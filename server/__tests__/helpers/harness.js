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
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

let mongod = null;

/** Start an in-memory MongoDB and connect mongoose. Call from beforeAll. */
async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  return mongod;
}

/** Call from afterAll. */
async function stopDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  mongod = null;
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
  const h = when.getHours();
  const sessionTime = `${String(h % 12 || 12).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  return Session.create({
    patientId: patient._id,
    doctorId: doctor._id,
    sessionDate: when,
    sessionTime,
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
