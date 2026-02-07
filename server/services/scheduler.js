const cron = require('node-cron');
const Session = require('../models/session');
const { sendSMS } = require('./twilioService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SCHEDULER');

let task = null;

/**
 * Start the notification scheduler
 * Runs every minute to check for sessions needing notifications
 */
const startScheduler = () => {
    if (task) {
        logger.info('Scheduler already running.');
        return;
    }

    logger.info('🔔 Starting Notification Scheduler (Every Minute)...');

    // Run every minute: * * * * *
    task = cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();

            // Get today's date range
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);

            // Fetch all scheduled sessions for today
            const sessions = await Session.find({
                sessionDate: {
                    $gte: startOfDay,
                    $lte: endOfDay
                },
                status: 'scheduled'
            })
                .populate('patientId', 'firstName lastName phoneNumber')
                .populate('doctorId', 'firstName lastName');

            for (const session of sessions) {
                // Validate phone number exists before processing
                if (!session.patientId || !session.patientId.phoneNumber) {
                    logger.debug(`Skipping session ${session._id}: Patient has no phone number`);
                    continue;
                }

                // Construct session date-time
                const [hours, minutes] = session.sessionTime.split(':').map(Number);
                const sessionDateTime = new Date(session.sessionDate);
                sessionDateTime.setHours(hours, minutes, 0, 0);

                // Calculate difference in minutes
                // Diff = SessionTime - Now
                // Positive = Future, Negative = Past
                const diffMs = sessionDateTime.getTime() - now.getTime();
                const diffMinutes = diffMs / (1000 * 60);

                // 1. 15 Minutes Before Reminder (Window: 14-16 mins)
                if (diffMinutes >= 14 && diffMinutes <= 16 && !session.notificationStatus.reminderSent) {
                    await send15MinuteReminder(session);
                    session.notificationStatus.reminderSent = true;
                    await session.save();
                }

                // 2. 2 Minutes Before Reminder (Window: 1-3 mins)
                // Using 'startSent' flag to track this "Join Now" / "Starting Soon" reminder
                else if (diffMinutes >= 1 && diffMinutes <= 3 && !session.notificationStatus.startSent) {
                    await sendStartingSoonReminder(session);
                    session.notificationStatus.startSent = true;
                    await session.save();
                }

                // 3. Late Alert (Window: -10 to -5 mins, i.e., 5-10 mins late)
                else if (diffMinutes >= -10 && diffMinutes <= -5 && !session.notificationStatus.lateSent) {
                    // Only send if patient hasn't joined
                    if (!session.patientJoined) {
                        await sendLateAlert(session);
                        session.notificationStatus.lateSent = true;
                        await session.save();
                    }
                }
            }

        } catch (error) {
            logger.error('Error in notification scheduler:', error);
        }
    });

    logger.info('✅ Notification scheduler started successfully');
};

/**
 * Send 15-minute reminder
 */
const send15MinuteReminder = async (session) => {
    const patientName = session.patientId.firstName;
    const doctorName = `Dr. ${session.doctorId.firstName} ${session.doctorId.lastName}`;
    const time = session.sessionTime;

    const message = `Hi ${patientName}! Your therapy session with ${doctorName} is starting in 15 minutes at ${time}. Please be ready. - Veerawell`;

    logger.info(`📤 Sending 15-min SMS for session ${session._id}`);
    await sendSMS(session.patientId.phoneNumber, message);
};

/**
 * Send "Starting Soon" reminder (2 mins before)
 */
const sendStartingSoonReminder = async (session) => {
    const patientName = session.patientId.firstName;
    const doctorName = `Dr. ${session.doctorId.firstName} ${session.doctorId.lastName}`;

    // Include meeting link if available, otherwise just generic message
    const linkMsg = session.meetingLink ? ` Link: ${session.meetingLink}` : ' Please log in to join.';
    const message = `Hi ${patientName}! Your session with ${doctorName} starts in 2 minutes!${linkMsg} - Veerawell`;

    logger.info(`📤 Sending 2-min SMS for session ${session._id}`);
    await sendSMS(session.patientId.phoneNumber, message);
};

/**
 * Send late alert
 */
const sendLateAlert = async (session) => {
    const patientName = session.patientId.firstName;
    const doctorName = `Dr. ${session.doctorId.firstName} ${session.doctorId.lastName}`;

    const message = `Hi ${patientName}, your session with ${doctorName} has started. Please join immediately to avoid cancellation. - Veerawell`;

    logger.info(`📤 Sending late alert SMS for session ${session._id}`);
    await sendSMS(session.patientId.phoneNumber, message);
};

/**
 * Stop the scheduler
 */
const stopScheduler = () => {
    if (task) {
        task.stop();
        task = null;
        logger.info('Notification scheduler stopped');
    }
};

module.exports = {
    startScheduler,
    stopScheduler
};
