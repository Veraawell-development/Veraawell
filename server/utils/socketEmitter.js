/**
 * Socket Emitter Utility
 * Helper class for emitting real-time events to specific users, roles, or all clients
 */

const { createLogger } = require('./logger');

const logger = createLogger('SOCKET-EMITTER');

class SocketEmitter {
    /**
     * @param {Server} io - Socket.IO server instance
     */
    constructor(io) {
        this.io = io;
        this.dataNamespace = io.of('/data');
    }

    /**
     * Emit event to a specific user
     * @param {string} userId - User ID to emit to
     * @param {string} event - Event name
     * @param {object} data - Event data
     */
    emitToUser(userId, event, data) {
        if (!userId) {
            logger.error('emitToUser: userId is required');
            return;
        }

        this.dataNamespace.to(`user:${userId}`).emit(event, data);

        logger.debug('Event emitted to user', {
            userId: userId.substring(0, 8) + '...',
            event,
            dataKeys: Object.keys(data || {})
        });
    }

    /**
     * Is this user currently listening on /data?
     *
     * emitToUser is fire-and-forget: Socket.IO reports nothing about whether
     * anyone was in the room, so an event sent to a doctor who has no page
     * open vanishes indistinguishably from one that was delivered. The caller
     * needs to tell those apart, because an unanswered instant request costs
     * the doctor a cancellation strike and it is not fair to charge one for a
     * ring that was never sent anywhere.
     *
     * Reads the adapter's room membership rather than the connection map in
     * data.socket.js, so it stays correct under a multi-instance adapter.
     *
     * @param {string} userId
     * @returns {boolean} true if at least one socket is in the user's room
     */
    hasListener(userId) {
        if (!userId) return false;
        const room = this.dataNamespace.adapter.rooms.get(`user:${userId}`);
        return !!room && room.size > 0;
    }

    /**
     * Emit event to all users with a specific role
     * @param {string} role - Role (patient, doctor, admin)
     * @param {string} event - Event name
     * @param {object} data - Event data
     */
    emitToRole(role, event, data) {
        if (!role) {
            logger.error('emitToRole: role is required');
            return;
        }

        this.dataNamespace.to(`role:${role}`).emit(event, data);

        logger.debug('Event emitted to role', {
            role,
            event,
            dataKeys: Object.keys(data || {})
        });
    }

    /**
     * Emit event to all connected clients
     * @param {string} event - Event name
     * @param {object} data - Event data
     */
    emitToAll(event, data) {
        this.dataNamespace.emit(event, data);

        logger.debug('Event emitted to all', {
            event,
            dataKeys: Object.keys(data || {})
        });
    }

    /**
     * Emit event to multiple specific users
     * @param {string[]} userIds - Array of user IDs
     * @param {string} event - Event name
     * @param {object} data - Event data
     */
    emitToUsers(userIds, event, data) {
        if (!Array.isArray(userIds) || userIds.length === 0) {
            logger.error('emitToUsers: userIds must be a non-empty array');
            return;
        }

        userIds.forEach(userId => {
            if (userId) {
                this.emitToUser(userId, event, data);
            }
        });

        logger.debug('Event emitted to multiple users', {
            userCount: userIds.length,
            event,
            dataKeys: Object.keys(data || {})
        });
    }

    /**
     * Emit event to specific rooms
     * @param {string[]} rooms - Array of room names
     * @param {string} event - Event name
     * @param {object} data - Event data
     */
    emitToRooms(rooms, event, data) {
        if (!Array.isArray(rooms) || rooms.length === 0) {
            logger.error('emitToRooms: rooms must be a non-empty array');
            return;
        }

        rooms.forEach(room => {
            this.dataNamespace.to(room).emit(event, data);
        });

        logger.debug('Event emitted to rooms', {
            rooms,
            event,
            dataKeys: Object.keys(data || {})
        });
    }
}

module.exports = SocketEmitter;
