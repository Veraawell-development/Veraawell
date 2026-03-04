/**
 * Doctor Status Service
 * Handles doctor online/offline status updates and real-time broadcasts
 */

const User = require('../models/user');
const SocketEmitter = require('../utils/socketEmitter');
const { createLogger } = require('../utils/logger');

const logger = createLogger('DOCTOR-STATUS-SERVICE');

/**
 * Update doctor's online status and broadcast to patients
 * @param {string} userId - Doctor's user ID
 * @param {boolean} isOnline - New online status
 * @param {object} io - Socket.IO server instance
 */
async function updateDoctorStatus(userId, isOnline, io) {
    try {
        const user = await User.findById(userId);
        if (!user || user.role !== 'doctor') {
            return null;
        }

        user.isOnline = isOnline;
        user.lastActiveAt = new Date();
        await user.save();

        logger.info(`Doctor status updated: ${isOnline ? 'ONLINE' : 'OFFLINE'}`, {
            userId: userId.substring(0, 8)
        });

        // Broadcast change to all patients if io instance is provided
        if (io) {
            try {
                const emitter = new SocketEmitter(io);
                emitter.emitToRole('patient', 'doctor:status-change', {
                    doctorId: userId,
                    isOnline: isOnline,
                    lastActiveAt: user.lastActiveAt,
                    timestamp: new Date()
                });
                logger.debug('Doctor status change broadcasted');
            } catch (broadcastError) {
                logger.error('Failed to broadcast status change', { error: broadcastError.message });
            }
        }

        return user;
    } catch (error) {
        logger.error('Error in updateDoctorStatus', { error: error.message, userId });
        throw error;
    }
}

module.exports = {
    updateDoctorStatus
};
