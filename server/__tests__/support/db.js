/**
 * One MongoDB for the whole run, one database per suite.
 *
 * Each of the new suites used to start its own MongoMemoryServer, which meant
 * roughly twenty mongod processes per `npm test` — fine once, but on repeated
 * back-to-back runs the machine starts thrashing and suites that normally take
 * four seconds take thirty minutes and then time out. That looks exactly like
 * flaky application code and is not.
 *
 * globalSetup.js now starts a single server; every suite connects to its own
 * database name on it, so the suites stay isolated without paying for a
 * process each.
 */

const mongoose = require('mongoose');

function baseUri() {
  const uri = process.env.__TEST_MONGO_URI__;
  if (!uri) {
    throw new Error(
      'No shared test MongoDB. __tests__/support/globalSetup.js must run first — ' +
      'check the jest globalSetup entry in package.json.'
    );
  }
  if (!/(127\.0\.0\.1|localhost)/.test(uri)) {
    throw new Error(`refusing to connect: shared test URI is not loopback (${uri})`);
  }
  return uri.replace(/\/?$/, '/');
}

/** Connect mongoose to this suite's own database. */
async function connectDb(suiteName) {
  const db = `t_${String(suiteName).replace(/[^a-zA-Z0-9_]/g, '_')}`;
  await mongoose.connect(`${baseUri()}${db}`);
  return mongoose.connection;
}

/** Drop this suite's database and disconnect. */
async function disconnectDb() {
  if (mongoose.connection.readyState === 1) {
    try { await mongoose.connection.dropDatabase(); } catch (_) { /* best effort */ }
  }
  await mongoose.disconnect();
}

module.exports = { connectDb, disconnectDb };
