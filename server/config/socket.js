/**
 * Socket.IO server options — one place, used by server.js and by the tests,
 * so a test exercises the same transport settings production runs.
 *
 *  - Heartbeat 10 s / 10 s. The defaults (25 s / 20 s) took up to 45 s to
 *    notice a connection that died without closing (a phone losing signal),
 *    while the other person stared at a frozen call.
 *  - Connection-state recovery. A blip of up to 2 minutes resumes the same
 *    socket with its rooms and `socket.data` (which is why authorized rooms
 *    live in socket.data — authz/socket.js), instead of a brand-new socket
 *    that has to re-join from scratch. Middleware still runs on recovery, so
 *    a suspended account cannot ride a recovered session.
 *  - Origin check. Socket.IO's `cors` option covers only the HTTP polling
 *    transport, not the WebSocket upgrade, and the auth cookie is
 *    SameSite=None — so any website could open a signed-in user's sockets
 *    (read their live events, join their call). Requests that carry an
 *    Origin must come from our own sites; none (native clients, tests) is
 *    allowed, since a browser always sends one.
 *  - allowEIO3 removed: every client is socket.io-client 4.
 */

const { CORS_ORIGINS } = require('./constants');

const HEARTBEAT_MS = 10 * 1000;
const RECOVERY_WINDOW_MS = 2 * 60 * 1000;

function originAllowed(origin, allowed = CORS_ORIGINS) {
  if (!origin) return true;
  return allowed.includes(String(origin).replace(/\/$/, ''));
}

/** engine.io allowRequest: refuse a cross-site browser before the handshake. */
function originGuard(req, callback) {
  const origin = req.headers && req.headers.origin;
  callback(null, originAllowed(origin));
}

function buildIoOptions({ allowedOrigins = CORS_ORIGINS } = {}) {
  return {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    },
    transports: ['websocket', 'polling'],
    cookie: { name: 'io', httpOnly: true, sameSite: 'lax' },
    pingInterval: HEARTBEAT_MS,
    pingTimeout: HEARTBEAT_MS,
    // A signalling message is an SDP blob (a few KB) or a candidate; nothing
    // legitimate is anywhere near 100 KB.
    maxHttpBufferSize: 100 * 1000,
    serveClient: false,
    connectionStateRecovery: { maxDisconnectionDuration: RECOVERY_WINDOW_MS, skipMiddlewares: false },
    allowRequest: (req, callback) => callback(null, originAllowed(req.headers && req.headers.origin, allowedOrigins))
  };
}

module.exports = { buildIoOptions, originAllowed, originGuard, HEARTBEAT_MS, RECOVERY_WINDOW_MS };
