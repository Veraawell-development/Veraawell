const cron = require('node-cron');
const Session = require('../models/session');
const DoctorAvailability = require('../models/doctorAvailability');
const { sendSessionReminderEmail } = require('./email.service');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SCHEDULER');

let notificationTask = null;
let statusUpdateTask = null;
let paymentCleanupTask = null;

/**
 * Sweep past sessions and mark them completed/no-show.
 * Only processes sessions that ended in the last 24 hours to avoid
 * scanning the entire sessions collection.
 */
const runSessionStatusUpdate = async () => {
    try {
        const now = new Date();
        // Only look at sessions that could have ended since the last sweep (sessions from the past 24h that are still 'scheduled')
        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

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
            logger.info(`Session status sweep complete`, { updated: updatedCount });
        }
        return updatedCount;
    } catch (error) {
        logger.error('Error in session status sweep', { error: error.message });
        return 0;
    }
};

/**
 * Start the notification scheduler (every minute for reminders)
 * and the session status sweep (every 5 minutes)
 */
const startScheduler = () => {
    if (notificationTask && statusUpdateTask) {
        logger.info('Scheduler already running.');
        return;
    }

    logger.info('Starting schedulers...');

    // --- Session Status Sweep: every 5 minutes ---
    statusUpdateTask = cron.schedule('*/5 * * * *', async () => {
        await runSessionStatusUpdate();
    });

    // --- Notification Reminder: every minute ---
    notificationTask = cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();

            // Only fetch sessions in the relevant notification windows:
            // earliest window starts 16 mins before, latest ends 10 mins after start.
            const windowStart = new Date(now.getTime() - 10 * 60 * 1000);  // 10 mins ago
            const windowEnd = new Date(now.getTime() + 16 * 60 * 1000);    // 16 mins ahead

            const sessions = await Session.find({
                status: 'scheduled',
                sessionDate: {
                    $gte: new Date(now.toISOString().split('T')[0]), // today
                    $lte: new Date(now.toISOString().split('T')[0] + 'T23:59:59.999Z')
                },
                $or: [
                    { 'notificationStatus.reminderSent': false },
                    { 'notificationStatus.startSent': false },
                    { 'notificationStatus.lateSent': false }
                ]
            })
                .populate('patientId', 'firstName lastName email')
                .populate('doctorId', 'firstName lastName');

            for (const session of sessions) {
                if (!session.patientId || !session.patientId.email) {
                    logger.debug(`Skipping session ${session._id}: Patient has no email`);
                    continue;
                }

                const [hours, minutes] = session.sessionTime.split(':').map(Number);
                const sessionDateTime = new Date(session.sessionDate);
                sessionDateTime.setHours(hours, minutes, 0, 0);

                const diffMs = sessionDateTime.getTime() - now.getTime();
                const diffMinutes = diffMs / (1000 * 60);

                let changed = false;

                // 1. 15-minute reminder
                if (diffMinutes >= 14 && diffMinutes <= 16 && !session.notificationStatus.reminderSent) {
                    await sendSessionReminderEmail(session.patientId.email, session, '15min');
                    session.notificationStatus.reminderSent = true;
                    changed = true;
                }
                // 2. Starting-soon (2-min) reminder
                else if (diffMinutes >= 1 && diffMinutes <= 3 && !session.notificationStatus.startSent) {
                    await sendSessionReminderEmail(session.patientId.email, session, 'start');
                    session.notificationStatus.startSent = true;
                    changed = true;
                }
                // 3. Late alert
                else if (diffMinutes >= -10 && diffMinutes <= -5 && !session.notificationStatus.lateSent) {
                    if (!session.patientJoined) {
                        await sendSessionReminderEmail(session.patientId.email, session, 'late');
                        session.notificationStatus.lateSent = true;
                        changed = true;
                    }
                }

                if (changed) await session.save();
            }
        } catch (error) {
            logger.error('Error in notification scheduler', { error: error.message });
        }
    });

    logger.info('All schedulers started successfully (notifications: 1min, status-sweep: 5min, payment-cleanup: 30min)');

    // ── Phase 9: Expired Payment Cleanup (every 30 minutes) ──────────────────
    // Sessions where the patient opened Razorpay but didn't pay within 30 mins.
    // Mark them 'failed' and release the booked slot.
    paymentCleanupTask = cron.schedule('*/30 * * * *', async () => {
        try {
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

            const staleSessions = await Session.find({
                paymentStatus: 'pending',
                razorpayOrderId: { $ne: null }, // Only sessions that went through Razorpay
                createdAt: { $lte: thirtyMinutesAgo },
                status: { $nin: ['cancelled', 'completed'] }
            });

            if (staleSessions.length === 0) return;

            let cleaned = 0;
            for (const session of staleSessions) {
                try {
                    // Mark as failed
                    session.paymentStatus = 'failed';
                    session.status = 'cancelled';
                    await session.save();

                    // Release the doctor's slot
                    const dateStr = session.sessionDate instanceof Date
                        ? session.sessionDate.toISOString().split('T')[0]
                        : new Date(session.sessionDate).toISOString().split('T')[0];

                    const avail = await DoctorAvailability.findOne({ doctorId: session.doctorId });
                    if (avail && session.sessionTime) {
                        await avail.releaseSlot(dateStr, session.sessionTime);
                    }

                    cleaned++;
                } catch (err) {
                    logger.error('Cleanup error for session', { sessionId: session._id, error: err.message });
                }
            }

            if (cleaned > 0) {
                logger.info('Expired payment cleanup complete', { cleaned });
            }
        } catch (error) {
            logger.error('Error in payment cleanup job', { error: error.message });
        }
    });
};

/**
 * Stop all schedulers
 */
const stopScheduler = () => {
    if (notificationTask) {
        notificationTask.stop();
        notificationTask = null;
    }
    if (statusUpdateTask) {
        statusUpdateTask.stop();
        statusUpdateTask = null;
    }
    if (paymentCleanupTask) {
        paymentCleanupTask.stop();
        paymentCleanupTask = null;
    }
    logger.info('All schedulers stopped');
};

module.exports = {
    startScheduler,
    stopScheduler,
    runSessionStatusUpdate
};
