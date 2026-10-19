/**
 * Runs in every test file. Presence keeps a 2-minute "switch offline" timer
 * per disconnected doctor; left running, it fires minutes later inside some
 * other test file, after this file's modules are torn down, and fails that
 * suite. Clear it when each file ends.
 */
afterAll(() => {
  require('../../services/presence')._reset();
});
