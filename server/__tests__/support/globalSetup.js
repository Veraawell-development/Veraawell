/**
 * One in-memory MongoDB for the whole jest run, used ONLY as the target of
 * process.env.MONGO_URI.
 *
 * Why this exists: app.js builds a connect-mongo session store at module load
 * (app.js:253) using MONGO_URI, and that client keeps retrying in the
 * background for the rest of the process. With `--runInBand` every test file
 * shares one process, so:
 *
 *   - left at the value in server/.env, requiring app.js dials the live Atlas
 *     cluster from a test run;
 *   - pointed at a dead port (the pre-existing convention in
 *     authz.routeCoverage.test.js:27), the retries raise ECONNREFUSED that jest
 *     attributes to whichever unrelated suite happens to be running.
 *
 * A real, empty, loopback mongod satisfies the store, reaches no network, and
 * keeps the suites independent. Individual suites still create their OWN
 * MongoMemoryServer for their data and connect mongoose to that.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');

/**
 * mongodb-memory-server picks a random port and fails outright if it is taken.
 * A previous run that was interrupted can leave a mongod holding one, and the
 * whole suite then dies at startup with `Port "NNNNN" already in use` — which
 * reads as a broken test setup rather than a stale process. Retrying past a
 * collision makes the run survive it.
 */
async function createWithRetry(attempts = 5) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await MongoMemoryServer.create();
    } catch (err) {
      lastError = err;
      if (!/already in use/i.test(String(err && err.message))) throw err;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 250); });
    }
  }
  throw lastError;
}

module.exports = async function globalSetup() {
  const mongod = await createWithRetry();
  const uri = mongod.getUri();
  if (!/(127\.0\.0\.1|localhost)/.test(uri)) {
    throw new Error(`refusing to run: session-store URI is not loopback (${uri})`);
  }
  globalThis.__SESSION_STORE_MONGOD__ = mongod;
  process.env.MONGO_URI = uri;
  process.env.__TEST_SESSION_STORE_URI__ = uri;
  // The same instance backs every suite's own database (see support/db.js), so
  // one mongod serves the whole run instead of one per suite file.
  process.env.__TEST_MONGO_URI__ = uri;
};
