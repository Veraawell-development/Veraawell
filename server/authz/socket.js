/**
 * Guarded Socket.IO event registration.
 *
 * Socket.IO has no per-event middleware, so authorization has to be applied
 * by hand in each handler — and 13 of the 16 application events had none.
 * `offer`, `answer`, `ice-candidate`, `call-ended`, `request-end-session`,
 * `confirm-end-session`, `media-state-change`, `patient-ready`,
 * `patient-prep-data`, `leave-room`, `typing:start` and `typing:stop` all took
 * a `sessionId`/`conversationId` straight from the client payload and acted on
 * it. Verified against a running server: an authenticated account that had
 * never joined the room emitted `call-ended` for a stranger's in-progress
 * therapy session and set it to `completed`.
 *
 * Making registration itself the enforcement point is the same trick the HTTP
 * side uses: you cannot add an event without stating its policy, and a raw
 * `socket.on(...)` is detectable by a test.
 *
 * TWO TIERS, because a DB read per event is not viable here. WebRTC
 * negotiation fires `ice-candidate` dozens of times in a few seconds, so
 * loading the Session for each one would add a query per candidate.
 *
 *   mode 'policy' — state-changing, low frequency (join, end-call). Loads the
 *                   record and runs the same policy the HTTP routes use.
 *   mode 'joined' — high-frequency signaling. An O(1) check against the room
 *                   set, which is only ever populated by a successful
 *                   'policy'-mode join. Cheap, and it cannot be forged: the
 *                   set lives on the server's socket object.
 */

const { assertCan } = require('./can');
const { ForbiddenError, CODE } = require('./errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SOCKET-AUTHZ');

/** Rooms this socket has been authorized into. Server-side only. */
function initRooms(socket) {
  if (!socket.authzRooms) socket.authzRooms = new Set();
  return socket.authzRooms;
}

function grantRoom(socket, roomId) {
  initRooms(socket).add(String(roomId));
}

function revokeRoom(socket, roomId) {
  initRooms(socket).delete(String(roomId));
}

function assertJoined(socket, roomId) {
  if (!roomId || !initRooms(socket).has(String(roomId))) {
    throw new ForbiddenError(CODE.NOT_IN_ROOM, 'You are not a participant in this call');
  }
}

/**
 * Deliver a denial to the client.
 *
 * Two client behaviours constrain the wording and the channel:
 *
 *  - client/src/hooks/useDataSocket.ts stops reconnecting FOREVER if an error
 *    message contains 'Authentication error' or 'No token'. An authorization
 *    denial must not trip that; only a genuinely dead credential should.
 *  - client/src/pages/VideoCallRoom.tsx redirects to /auth when a
 *    connect_error message contains 'Authentication'.
 *
 * So: never emit connect_error, and never use those substrings. The existing
 * `error` event is reused because VideoCallRoom already renders it, and a new
 * structured `authz:denied` is added for clients to adopt later.
 */
function emitDenial(socket, event, err, ack) {
  const code = err.code || (err.statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL');
  const message = err.statusCode === 403 || err.statusCode === 404
    ? err.message
    : 'Request failed';

  logger.warn('Socket event denied', {
    event,
    code,
    // The message is logged for anything that is not a clean policy denial,
    // so an unexpected throw inside a handler is diagnosable rather than
    // appearing as a bare 'INTERNAL'.
    ...(code === 'INTERNAL' ? { error: err.message, stack: err.stack } : {}),
    userId: socket.userId ? String(socket.userId).substring(0, 8) : null
  });

  socket.emit('authz:denied', { event, code, message });
  socket.emit('error', { message, code });
  if (typeof ack === 'function') ack({ ok: false, code, message });
}

/**
 * @param {object} socket
 * @param {object} [opts]
 * @returns {{on: Function, declared: string[]}}
 */
function createGuardedRegistrar(socket, opts = {}) {
  const declared = [];
  initRooms(socket);

  /**
   * @param {string} event
   * @param {{mode:'policy'|'joined'|'open', action?:string, key?:string}} spec
   * @param {Function} handler (payload, ctx) => void, ctx = {socket, actor, resource, ack}
   */
  function on(event, spec, handler) {
    if (!spec || !spec.mode) throw new Error(`socket authz: event "${event}" must declare a mode`);
    if (spec.mode === 'policy' && !spec.action) {
      throw new Error(`socket authz: event "${event}" is mode 'policy' but declares no action`);
    }
    declared.push(event);

    socket.on(event, async (payload = {}, ack) => {
      try {
        const key = spec.key || 'sessionId';
        // Some events are emitted with a bare id rather than an object —
        // SessionChat.tsx and MessagesPage.tsx both do
        // `emit('conversation:join', conversationId)`. Accept either shape so
        // adding authorization does not require changing the client protocol.
        const subjectId = typeof payload === 'string' ? payload : (payload && payload[key]);
        let resource = null;

        if (spec.mode === 'policy') {
          if (!subjectId) throw new ForbiddenError(CODE.MISSING_SUBJECT, 'Missing the id of the record to act on');
          resource = await assertCan(socket.actor, spec.action, String(subjectId));
        } else if (spec.mode === 'joined') {
          assertJoined(socket, subjectId);
        }
        // 'open' — lifecycle events (disconnect, ping) that carry no subject.

        await handler(payload, { socket, actor: socket.actor, resource, ack });
      } catch (err) {
        emitDenial(socket, event, err, ack);
      }
    });
  }

  return { on, declared };
}

module.exports = { createGuardedRegistrar, grantRoom, revokeRoom, assertJoined, emitDenial };
