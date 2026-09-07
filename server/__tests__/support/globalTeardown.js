/**
 * Stop the shared MongoDB, best-effort.
 *
 * A throw here replaces the real test results with a teardown error, and a
 * leftover process is a nuisance rather than a failure — it just needs to be
 * visible, because the next run collides on its port.
 */
module.exports = async function globalTeardown() {
  const mongod = globalThis.__SESSION_STORE_MONGOD__;
  if (!mongod) return;
  try {
    await mongod.stop();
  } catch (err) {
    console.warn(`globalTeardown: could not stop the shared MongoDB (${err.message})`);
  }
};
