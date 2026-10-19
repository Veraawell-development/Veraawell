/**
 * Data Socket Namespace
 * Handles real-time data update events (doctor status, sessions, articles, etc.)
 * Separate from video call and chat namespaces
 */

const { createLogger } = require('../utils/logger');
const { createSocketAuthMiddleware } = require('./authMiddleware');
const presence = require('../services/presence');

const logger = createLogger('DATA-SOCKET');

// Authenticate socket connections — see socket/authMiddleware.js
const authenticateSocket = createSocketAuthMiddleware('DATA-AUTH');

/**
 * Initialize Data Socket Namespace
 * @param {Server} io - Socket.IO server instance
 * @returns {Namespace} Data namespace
 */
const initializeDataSocket = (io) => {
    // Create /data namespace
    const dataNamespace = io.of('/data');

    // Apply authentication middleware
    dataNamespace.use(authenticateSocket);

    dataNamespace.on('connection', (socket) => {
        const { userId, userRole, username } = socket;

        logger.info('User connected to data socket', {
            socketId: socket.id,
            userId: userId?.substring(0, 8) + '...',
            role: userRole,
            username
        });

        // A doctor's connections are their presence (services/presence.js).
        if (userRole === 'doctor') {
            presence.connected(userId, socket.id);
        }

        // Join user to their personal room for targeted events
        socket.join(`user:${userId}`);
        logger.debug(`User joined personal room: user:${userId.substring(0, 8)}...`);

        // Join role-based room (patient, doctor, admin)
        socket.join(`role:${userRole}`);
        logger.debug(`User joined role room: role:${userRole}`);

        // Handle disconnection
        socket.on('disconnect', async () => {
            logger.info('User disconnected from data socket', {
                userId: userId?.substring(0, 8) + '...',
                role: userRole
            });

            // The last connection gone starts a 2-minute grace; a refresh or a
            // blip reconnects well inside it, closing the app does not.
            if (userRole === 'doctor') {
                presence.disconnected(userId, socket.id, { io });
            }
        });

        // Optional: Handle client-side events if needed
        socket.on('ping', () => {
            socket.emit('pong', { timestamp: new Date() });
        });
    });

    logger.info('Data Socket.IO namespace initialized on /data');
    return dataNamespace;
};

module.exports = { initializeDataSocket };
