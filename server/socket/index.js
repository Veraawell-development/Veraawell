/**
 * Socket Bootstrapper
 * Initializes all Socket.IO namespaces in one place.
 * Called once from server.js — never instantiated per-request.
 */

const { createLogger } = require('../utils/logger');
const logger = createLogger('SOCKET');

function initializeSockets(io) {
    logger.info('Initializing all socket namespaces...');

    // Calls (WebRTC signalling). CALL_ENGINE=v1 rolls back to the first
    // version only; otherwise the new engine (call.socket.js) runs, with the
    // v1 events still served for call pages already open on an old build.
    const videoSocket = require('./video.socket');
    videoSocket(io);
    const { callEngine } = require('../config/features');
    if (callEngine() === 'v2') require('./call.socket')(io);
    logger.info('Call engine', { engine: callEngine() });

    // Real-time chat
    const { initializeChatSocket } = require('./chat.socket');
    initializeChatSocket(io);

    // Data sync (live session/status updates)
    const { initializeDataSocket } = require('./data.socket');
    initializeDataSocket(io);

    logger.info('All socket namespaces initialized');
}

module.exports = { initializeSockets };
