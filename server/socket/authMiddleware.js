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

/**
 * @param {string} namespaceTag - logger context tag, e.g. 'CHAT-AUTH'
 * @returns {(socket, next) => void} Socket.IO middleware
 */
function createSocketAuthMiddleware(namespaceTag) {
  const logger = createLogger(namespaceTag);

  return (socket, next) => {
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
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      socket.username = decoded.username;
      // Kept for callers that read socket.user.{id,role,username} (video.socket.js)
      // rather than the flat socket.userId/userRole fields (chat/data sockets).
      socket.user = { id: decoded.userId, role: decoded.role, username: decoded.username };

      logger.debug('Socket authenticated', {
        userId: decoded.userId ? decoded.userId.substring(0, 8) + '...' : undefined,
        role: decoded.role
      });
      next();
    } catch (error) {
      logger.warn('Socket auth failed: invalid token', { error: error.message });
      next(new Error('Authentication error: Invalid token'));
    }
  };
}

module.exports = { createSocketAuthMiddleware };
