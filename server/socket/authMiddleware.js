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
  const user = await User.findById(userId).select('_id role status username').lean();
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

  return async (socket, next) => {
    let token = socket.handshake.auth && socket.handshake.auth.token;

    if (!token) {
      const cookies = socket.handshake.headers.cookie;
      if (cookies) {
        const tokenCookie = cookies.split('; ').find(c => c.startsWith('token='));
        if (tokenCookie) token = tokenCookie.split('=')[1];
      }
    }

    if (!token) {
      logger.warn('Socket auth failed: no token provided', { socketId: socket.id });
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, getJWTSecret());

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
      if (!user) {
        logger.warn('Socket auth failed: user no longer exists', { userId: decoded.userId });
        return next(new Error('Authentication error: account not found'));
      }
      if (user.status !== 'active') {
        logger.warn('Socket auth failed: account suspended', { userId: decoded.userId });
        return next(new Error('Authentication error: account suspended'));
      }

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
      next();
    } catch (error) {
      logger.warn('Socket auth failed: invalid token', { error: error.message });
      next(new Error('Authentication error: Invalid token'));
    }
  };
}

module.exports = { createSocketAuthMiddleware };
