/**
 * Socket Bootstrapper
 * Initializes all Socket.IO namespaces in one place.
 * Called once from server.js — never instantiated per-request.
 */

const { createLogger } = require('../utils/logger');
const logger = createLogger('SOCKET');

function initializeSockets(io) {
    logger.info('Initializing all socket namespaces...');

    // Video calling (WebRTC signaling)
    const videoSocket = require('./video.socket');
    videoSocket(io);

    // Real-time chat
    const { initializeChatSocket } = require('./chat.socket');
    initializeChatSocket(io);

    // Data sync (live session/status updates)
    const { initializeDataSocket } = require('./data.socket');
    initializeDataSocket(io);

    logger.info('All socket namespaces initialized ✅');
}

module.exports = { initializeSockets };
