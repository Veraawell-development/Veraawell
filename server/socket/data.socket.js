/**
 * Data Socket Namespace
 * Handles real-time data update events (doctor status, sessions, articles, etc.)
 * Separate from video call and chat namespaces
 */

const { createLogger } = require('../utils/logger');
const { createSocketAuthMiddleware } = require('./authMiddleware');

const logger = createLogger('DATA-SOCKET');

// Authenticate socket connections — see socket/authMiddleware.js
const authenticateSocket = createSocketAuthMiddleware('DATA-AUTH');

// Track active doctor connections to prevent accidental offline status
// userId -> Set of socket IDs
const doctorConnections = new Map();

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

        // Track doctor connections
        if (userRole === 'doctor') {
            if (!doctorConnections.has(userId)) {
                doctorConnections.set(userId, new Set());
            }
            doctorConnections.get(userId).add(socket.id);
            logger.debug(`Doctor ${userId.substring(0, 8)} connection tracked. Total: ${doctorConnections.get(userId).size}`);
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

            if (userRole === 'doctor') {
                const connections = doctorConnections.get(userId);
                if (connections) {
                    connections.delete(socket.id);
                    logger.debug(`Doctor ${userId.substring(0, 8)} disconnected. Remaining: ${connections.size}`);

                    // Removed auto-offline on disconnect as per user request.
                    // Doctors stay online until they manually toggle off or log out.
                    if (connections.size === 0) {
                        doctorConnections.delete(userId);
                        logger.debug(`Doctor ${userId.substring(0, 8)} has no active connections, but staying online.`);
                    }
                }
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
