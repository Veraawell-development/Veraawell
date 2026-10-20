/**
 * Socket Bootstrapper
 * Initializes all Socket.IO namespaces in one place.
 * Called once from server.js — never instantiated per-request.
 */

const { createLogger } = require('../utils/logger');
const logger = createLogger('SOCKET');

function initializeSockets(io) {
    logger.info('Initializing all socket namespaces...');

    // The default namespace: who is connecting (the same handshake check as
    // /data), then call signalling (call.socket.js).
    const { createSocketAuthMiddleware } = require('./authMiddleware');
    io.use(createSocketAuthMiddleware('CALL-AUTH'));
    require('./call.socket')(io);

    // Real-time chat
    const { initializeChatSocket } = require('./chat.socket');
    initializeChatSocket(io);

    // Data sync (live session/status updates)
    const { initializeDataSocket } = require('./data.socket');
    initializeDataSocket(io);

    logger.info('All socket namespaces initialized');
}

module.exports = { initializeSockets };
