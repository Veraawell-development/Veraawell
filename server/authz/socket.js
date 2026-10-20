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

/**
 * Rooms this socket has been authorized into. Server-side only. Kept in
 * `socket.data`, which connection-state recovery restores together with the
 * socket's rooms — on the socket object itself it was lost, so a recovered
 * socket would sit in its call room yet be refused every signal.
 */
function initRooms(socket) {
  if (!socket.data) socket.data = {};
  if (!(socket.data.authzRooms instanceof Set)) socket.data.authzRooms = new Set();
  return socket.data.authzRooms;
}

/** The party role a socket was granted a room as (patient-only events check it). */
function roomRoles(socket) {
  if (!socket.data) socket.data = {};
  if (!(socket.data.roomRoles instanceof Map)) socket.data.roomRoles = new Map();
  return socket.data.roomRoles;
}

function grantRoom(socket, roomId, { role } = {}) {
  initRooms(socket).add(String(roomId));
  if (role) roomRoles(socket).set(String(roomId), role);
}

function revokeRoom(socket, roomId) {
  initRooms(socket).delete(String(roomId));
  roomRoles(socket).delete(String(roomId));
}

const { createBucket } = require('../utils/tokenBucket');

/** Per-socket, per-event token buckets (spec.rate). */
function bucketFor(socket, event, rate) {
  if (!socket.data) socket.data = {};
  if (!socket.data.buckets) socket.data.buckets = new Map();
  let bucket = socket.data.buckets.get(event);
  if (!bucket) {
    bucket = createBucket(rate);
    socket.data.buckets.set(event, bucket);
  }
  return bucket;
}

/** Too many over-limit events in a minute: the socket is cut off. */
const MAX_VIOLATIONS_PER_MINUTE = 20;
function noteViolation(socket) {
  const now = Date.now();
  const v = socket.data.violations || { since: now, count: 0 };
  if (now - v.since > 60 * 1000) { v.since = now; v.count = 0; }
  v.count += 1;
  socket.data.violations = v;
  if (v.count > MAX_VIOLATIONS_PER_MINUTE) {
    logger.warn('Socket disconnected for flooding', { userId: socket.userId ? String(socket.userId).substring(0, 8) : null });
    socket.disconnect(true);
  }
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
  const message = [400, 403, 404].includes(err.statusCode)
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
   * @param {{mode:'policy'|'joined'|'open', action?:string, key?:string,
   *   validate?:(payload)=>string|null, rate?:{perSec:number, burst:number},
   *   partyRole?:'patient'|'doctor'}} spec
   *   validate  — shape check run first; a non-null message refuses the event.
   *   rate      — token bucket per socket and event; over it is refused.
   *   partyRole — 'joined' events only: the role the room was granted as.
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
        if (spec.rate && !bucketFor(socket, event, spec.rate).take()) {
          noteViolation(socket);
          throw new ForbiddenError(CODE.RATE_LIMITED, 'Too many messages — slow down');
        }
        if (spec.validate) {
          const problem = spec.validate(payload);
          if (problem) throw Object.assign(new ForbiddenError(CODE.INVALID_PAYLOAD, problem), { statusCode: 400 });
        }
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
          // A join still in flight on this socket: wait for it (bounded), so
          // a signal sent right behind call:join is not refused.
          if (socket.data && socket.data.joining && !initRooms(socket).has(String(subjectId))) {
            await Promise.race([socket.data.joining, new Promise((r) => setTimeout(r, 5000))]);
          }
          assertJoined(socket, subjectId);
          if (spec.partyRole && roomRoles(socket).get(String(subjectId)) !== spec.partyRole) {
            throw new ForbiddenError(CODE.WRONG_ROLE, `Only the ${spec.partyRole} can send this`);
          }
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

module.exports = { createGuardedRegistrar, grantRoom, revokeRoom, assertJoined, emitDenial, roomRoles };
