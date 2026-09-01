const cron = require('node-cron');
const Session = require('../models/session');
const DoctorAvailability = require('../models/doctorAvailability');
const { sendSessionReminderEmail } = require('./email.service');
const { createLogger } = require('../utils/logger');
const { resolveStartsAt, resolveEndsAt } = require('../services/sessionTime');

const logger = createLogger('SCHEDULER');

let notificationTask = null;
let statusUpdateTask = null;
let paymentCleanupTask = null;
let stuckSessionTask = null;

// node-cron does not skip an overlapping run by default — if a job ever
// takes longer than its own interval (a slow DB moment, a spike in session
// volume), two overlapping runs could process the same rows concurrently.
// These flags make each job a no-op re-entry instead.
let statusSweepRunning = false;
let notificationSweepRunning = false;
let stuckSessionSweepRunning = false;
let paymentCleanupRunning = false;

/**
 * Sweep past sessions and mark them completed/no-show.
 * Only processes sessions that ended in the last 24 hours to avoid
 * scanning the entire sessions collection.
 */
const runSessionStatusUpdate = async () => {
    try {
        const now = new Date();
        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // "Every live session whose end time has passed" is now one indexed
        // range scan on endsAt. It used to load every scheduled session from a
        // 24-hour window and re-derive each end time in JavaScript with
        // setHours — which applied the server's offset, so on a UTC host an
        // IST session was swept 5h30m early or late.
        const scheduledSessions = await Session.find({
            status: { $in: ['scheduled', 'active'] },
            endsAt: { $gte: cutoff, $lte: now }
        });

        if (scheduledSessions.length === 0) return 0;

        let updatedCount = 0;
        for (const session of scheduledSessions) {
            if (resolveEndsAt(session) < now) {
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
const startScheduler = (io) => {
    if (notificationTask && statusUpdateTask) {
        logger.info('Scheduler already running.');
        return;
    }

    logger.info('Starting schedulers...');

    // --- Session Status Sweep: every 5 minutes ---
    statusUpdateTask = cron.schedule('*/5 * * * *', async () => {
        if (statusSweepRunning) return;
        statusSweepRunning = true;
        try {
            await runSessionStatusUpdate();
        } finally {
            statusSweepRunning = false;
        }
    });

    // --- Notification Reminder: every minute ---
    notificationTask = cron.schedule('* * * * *', async () => {
        if (notificationSweepRunning) return;
        notificationSweepRunning = true;
        try {
            const now = new Date();

            // Only fetch sessions in the relevant notification windows:
            // earliest window starts 16 mins before, latest ends 10 mins after start.
            const windowStart = new Date(now.getTime() - 10 * 60 * 1000);  // 10 mins ago
            const windowEnd = new Date(now.getTime() + 16 * 60 * 1000);    // 16 mins ahead

            // Query the instant range directly. The old form bounded by the
            // UTC calendar day while comparing against a server-local
            // setHours, so IST sessions between 00:00 and 05:30 fell outside
            // the queried day entirely and never received a reminder at all.
            const sessions = await Session.find({
                status: 'scheduled',
                startsAt: { $gte: windowStart, $lte: windowEnd },
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

                const sessionDateTime = resolveStartsAt(session);
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
        } finally {
            notificationSweepRunning = false;
        }
    });

    // --- Stuck unaccepted instant sessions: every 2 minutes ---
    // A paid instant session the doctor never accepted has no resolution path if the
    // patient closes the app before their own client-side 10-minute timer fires
    // /missed — this is the server-side backstop so nothing paid stays stuck forever.
    stuckSessionTask = cron.schedule('*/2 * * * *', async () => {
        if (stuckSessionSweepRunning) return;
        stuckSessionSweepRunning = true;
        try {
            const { sweepStuckUnacceptedSessions } = require('../controllers/session.controller');
            const count = await sweepStuckUnacceptedSessions(io);
            if (count > 0) logger.info('Stuck unaccepted session sweep complete', { cancelled: count });
        } catch (error) {
            logger.error('Error in stuck unaccepted session sweep', { error: error.message });
        } finally {
            stuckSessionSweepRunning = false;
        }
    });

    logger.info('All schedulers started successfully (notifications: 1min, status-sweep: 5min, payment-cleanup: 30min, stuck-sessions: 2min)');

    // ── Phase 9: Expired Payment Cleanup (every 30 minutes) ──────────────────
    // Sessions where the patient opened Razorpay but didn't pay within 30 mins.
    // Mark them 'failed' and release the booked slot.
    paymentCleanupTask = cron.schedule('*/30 * * * *', async () => {
        if (paymentCleanupRunning) return;
        paymentCleanupRunning = true;
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

                    // Release by the session's own local slot key. Deriving a
                    // date with toISOString() put a 00:30 IST session on the
                    // previous day, so the release silently matched nothing.
                    const avail = await DoctorAvailability.findOne({ doctorId: session.doctorId });
                    if (avail && session.localDate && session.localTime) {
                        const released = await avail.releaseSlot(session.localDate, session.localTime, session._id);
                        if (!released) {
                            logger.warn('Expired-checkout slot release matched nothing', {
                                sessionId: String(session._id).substring(0, 8)
                            });
                        }
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
        } finally {
            paymentCleanupRunning = false;
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
    if (stuckSessionTask) {
        stuckSessionTask.stop();
        stuckSessionTask = null;
    }
    logger.info('All schedulers stopped');
};

module.exports = {
    startScheduler,
    stopScheduler,
    runSessionStatusUpdate
};
