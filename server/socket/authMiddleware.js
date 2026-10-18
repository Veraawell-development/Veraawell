/**
 * Shared Socket.IO JWT-auth middleware factory.
 *
 * All three socket namespaces (chat, data, video) independently implemented
 * the same "read token from handshake.auth, else parse from the cookie
 * header, verify with getJWTSecret(), attach userId/role to the socket"
 * logic. One of the three copies (chat.socket.js) logged the full raw cookie
 * header, 30-character token previews, and decoded claims via console.log —
 * a different, looser logging standard than its siblings, which used
 * createLogger with 8-char-truncated IDs and never logged token material.
 * Same logic, one copy leaked more than the others — and a fix to auth logic
 * (e.g. supporting refresh tokens) had to be applied three times by hand.
 */

const jwt = require('jsonwebtoken');
const { getJWTSecret } = require('../config/auth');
const { createLogger } = require('../utils/logger');
const { normalizeActor, CHANNEL } = require('../authz/actor');
const cache = require('../services/cache.service');
const { tokenPredatesPasswordChange, accountProblem } = require('../middleware/auth.middleware');

/**
 * Load the user behind a socket handshake, cached for a few seconds.
 *
 * The cache exists because a page with four namespaces open reconnects all of
 * them on every network blip; without it each blip is four identical queries.
 * The TTL is deliberately short — it is the upper bound on how long a
 * suspended or demoted account can still open a socket.
 */
const ACTOR_CACHE_TTL_SECONDS = 30;
async function loadActorUser(userId) {
  if (!userId) return null;
  const key = `authz:socket-user:${userId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const User = require('../models/user');
  // .lean() deliberately: node-cache clones values it stores, and cloning a
  // hydrated Mongoose document strips its internals — the clone then throws
  // on any document method. A plain object is all the caller needs, and
  // normalizeActor accepts either shape.
  const user = await User.findById(userId)
    .select('_id role status username approvalStatus passwordChangedAt')
    .lean();
  const value = user || null;
  cache.set(key, value, ACTOR_CACHE_TTL_SECONDS);
  return value;
}

/**
 * @param {string} namespaceTag - logger context tag, e.g. 'CHAT-AUTH'
 * @returns {(socket, next) => void} Socket.IO middleware
 */
function createSocketAuthMiddleware(namespaceTag) {
  const logger = createLogger(namespaceTag);

  /**
   * Resolve one credential to an authenticated user, or explain why not.
   * @returns {Promise<{user:object}|{error:string, reason:string}>}
   */
  async function authenticate(token) {
    let decoded;
    try {
      decoded = jwt.verify(token, getJWTSecret());
    } catch (error) {
      return { error: 'Authentication error: Invalid token', reason: error.message };
    }

    // The handshake used to trust the token's claims outright — no database
    // read at all. With a 30-day token lifetime that meant a suspended or
    // demoted account kept full real-time access (chat, live calls, session
    // events) for up to a month after the change was supposed to take
    // effect. The HTTP side checks status; the socket side did not.
    //
    // Cached briefly so a burst of reconnects doesn't become a burst of
    // queries, while still bounding the stale-privilege window to seconds
    // rather than weeks.
    const user = await loadActorUser(decoded.userId);
    if (!user) return { error: 'Authentication error: account not found', reason: 'user no longer exists' };
    // The same two checks verifyToken makes, from the same helpers, so the
    // HTTP and socket sides cannot drift apart again: a token retired by a
    // password change, and an account that is suspended or a rejected
    // practitioner, are refused here too.
    if (tokenPredatesPasswordChange(user, decoded)) {
      return { error: 'Authentication error: password changed', reason: 'token predates a password change' };
    }
    const problem = accountProblem(user);
    if (problem) {
      return {
        error: user.status !== 'active' ? 'Authentication error: account suspended' : 'Authentication error: account rejected',
        reason: problem.message
      };
    }
    return { user };
  }

  return async (socket, next) => {
    // Both credentials, in order, and the first that works wins — the same
    // rule verifyToken applies over HTTP. This used to take the handshake
    // token if there was one and never look at the cookie, so a stale
    // in-memory token (left over from before a password change or a secret
    // rotation) failed the connection even though the browser held a valid
    // session cookie: chat, live calls and session notifications all died
    // while every page still loaded.
    const candidates = [];
    const handshakeToken = socket.handshake.auth && socket.handshake.auth.token;
    if (handshakeToken) candidates.push(handshakeToken);
    const cookies = socket.handshake.headers.cookie;
    if (cookies) {
      const tokenCookie = cookies.split('; ').find(c => c.startsWith('token='));
      const cookieToken = tokenCookie && tokenCookie.slice('token='.length);
      if (cookieToken && cookieToken !== handshakeToken) candidates.push(cookieToken);
    }

    if (candidates.length === 0) {
      logger.warn('Socket auth failed: no token provided', { socketId: socket.id });
      return next(new Error('Authentication error: No token provided'));
    }

    let failure = null;
    for (const token of candidates) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await authenticate(token);
        if (result.user) {
          const user = result.user;
          // Role comes from the database, not the claim.
          socket.actor = normalizeActor(user, CHANNEL.SOCKET);
          socket.userId = socket.actor.id;
          socket.userRole = socket.actor.role;
          socket.username = user.username;
          // Kept for callers that read socket.user.{id,role,username} (video.socket.js)
          // rather than the flat socket.userId/userRole fields (chat/data sockets).
          socket.user = { id: socket.actor.id, role: socket.actor.role, username: user.username };

          logger.debug('Socket authenticated', {
            userId: socket.actor.id ? socket.actor.id.substring(0, 8) + '...' : undefined,
            role: socket.actor.role
          });
          return next();
        }
        failure = failure || result;
      } catch (error) {
        failure = failure || { error: 'Authentication error: Invalid token', reason: error.message };
      }
    }

    logger.warn('Socket auth failed', { reason: failure.reason });
    return next(new Error(failure.error));
  };
}

module.exports = { createSocketAuthMiddleware };
