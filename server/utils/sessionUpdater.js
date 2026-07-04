const Session = require('../models/session');
const { createLogger } = require('./logger');

const logger = createLogger('SESSION-UPDATER');

/**
 * Updates status of past sessions from 'scheduled' to 'completed' or 'no-show'.
 * Only processes sessions that ended in the last 24 hours to avoid a full-collection scan.
 * This is called exclusively by the scheduler cron (every 5 min), NOT inline per-request.
 */
const updateSessionStatuses = async () => {
    try {
        const now = new Date();
        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Past 24 hours

        const scheduledSessions = await Session.find({
            status: 'scheduled',
            sessionDate: { $gte: cutoff, $lte: now }
        });

        if (scheduledSessions.length === 0) return 0;

        let updatedCount = 0;

        for (const session of scheduledSessions) {
            const [hours, minutes] = session.sessionTime.split(':').map(Number);
            const sessionStart = new Date(session.sessionDate);
            sessionStart.setUTCHours(hours, minutes, 0, 0);

            const sessionEnd = new Date(sessionStart.getTime() + (session.duration * 60000));

            if (sessionEnd < now) {
                session.status = (session.doctorJoined && session.patientJoined) ? 'completed' : 'no-show';
                if (session.status === 'completed') session.callStatus = 'completed';
                await session.save();
                updatedCount++;
            }
        }

        if (updatedCount > 0) {
            logger.info('Session status sweep complete', { updated: updatedCount });
        }

        return updatedCount;
    } catch (error) {
        logger.error('Error updating session statuses', { error: error.message });
        return 0;
    }
};

module.exports = { updateSessionStatuses };
