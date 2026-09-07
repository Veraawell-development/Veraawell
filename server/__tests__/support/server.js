/**
 * One listening HTTP server per suite, reused by every request.
 *
 * supertest's `request(app)` creates a fresh http.Server and binds a fresh
 * ephemeral port for EVERY request. Across a full run that is tens of
 * thousands of listeners, and under sustained load a small number of them are
 * reset — surfacing as an intermittent "socket hang up" on an arbitrary test,
 * which reads exactly like a flaky application and is not.
 *
 * Passing an already-listening server to `request()` makes supertest reuse it
 * (it only calls listen() when `address()` returns null), so a suite pays for
 * one port instead of one per request.
 */

const { once } = require('events');

/** Start `app` on an ephemeral port and return the server. */
async function startServer(app) {
  const server = app.listen(0);
  await once(server, 'listening');
  return server;
}

/** Close a server started by startServer. */
async function stopServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
}

module.exports = { startServer, stopServer };
