const cron = require('node-cron');
const Session = require('../models/session');
const DoctorAvailability = require('../models/doctorAvailability');
const { sendSessionReminderEmail } = require('./email.service');
const { createLogger } = require('../utils/logger');
const { resolveStartsAt, resolveEndsAt } = require('../services/sessionTime');
const { CHECKOUT_TTL_MINUTES } = require('../config/time');
const { tryTransition } = require('./sessionTransition');
const { EVENT, ACTOR } = require('./sessionState');
const { refundSession } = require('./sessionRefund');

const logger = createLogger('SCHEDULER');

let notificationTask = null;
let statusUpdateTask = null;
let paymentCleanupTask = null;
let stuckSessionTask = null;
let clawbackTask = null;

// node-cron does not skip an overlapping run by default — if a job ever
// takes longer than its own interval (a slow DB moment, a spike in session
// volume), two overlapping runs could process the same rows concurrently.
// These flags make each job a no-op re-entry instead.
let statusSweepRunning = false;
let notificationSweepRunning = false;
let stuckSessionSweepRunning = false;
let paymentCleanupRunning = false;
let clawbackSweepRunning = false;

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
        let refundedCount = 0;
        for (const session of scheduledSessions) {
            if (resolveEndsAt(session) >= now) continue;

            // Routed through the transition table rather than a bare
            // `session.status = ...; save()`. The table already decides
            // completed-vs-no-show from the join flags, and going through
            // applyTransition means the write is a compare-and-set and the
            // post-image is checked against the invariants — neither of which
            // a direct save() gets. It also has to be the transition, not a
            // save, because the refund below must see a consistent state.
            const swept = await tryTransition(session, {
                event: EVENT.SWEEP_ELAPSED,
                actor: ACTOR.SYSTEM,
                now,
                extraSet: (session.doctorJoined && session.patientJoined)
                    ? { callStatus: 'completed' }
                    : {}
            });
            if (!swept.changed) continue;
            updatedCount += 1;

            // The doctor did not turn up but the patient did.
            //
            // RefundPolicyPage.tsx promises "an automatic 100% full refund" in
            // this exact situation. It was only true for INSTANT sessions,
            // which sweepStuckUnacceptedSessions handles; a patient who sat
            // waiting for a normally-booked session got the no-show status and
            // no money back, and nothing anywhere flagged it. The condition is
            // deliberately not just `!doctorJoined`: if the patient did not
            // attend either, nobody was stood up and the session is not
            // refundable (and, per the payout rule, the doctor is still paid
            // for a patient no-show).
            const doctorStoodThemUp = swept.session.status === 'no-show'
                && session.patientJoined === true
                && session.doctorJoined !== true;

            if (doctorStoodThemUp) {
                const result = await refundSession(swept.session, {
                    actor: ACTOR.SYSTEM,
                    amount: swept.session.price,
                    reason: 'Therapist did not join the session'
                });
                if (result.refunded) {
                    refundedCount += 1;
                    logger.info('Auto-refunded a doctor no-show', {
                        sessionId: String(session._id).substring(0, 8),
                        amount: swept.session.price
                    });
                } else if (result.failed) {
                    // Left in refund_failed for the admin retry queue rather
                    // than retried here — the sweep runs every 5 minutes and
                    // must not hammer the gateway.
                    logger.error('Auto-refund of a doctor no-show failed', {
                        sessionId: String(session._id).substring(0, 8)
                    });
                }
            }
        }

        if (updatedCount > 0) {
            logger.info(`Session status sweep complete`, { updated: updatedCount, autoRefunded: refundedCount });
        }
        return updatedCount;
    } catch (error) {
        // The stack matters here: this catch wraps the whole sweep, so a
        // throw from any one session silently stops the rest. Without it a
        // failure inside the auto-refund looked like "the sweep did nothing".
        logger.error('Error in session status sweep', { error: error.message, stack: error.stack });
        return 0;
    }
};

/**
 * Reconcile clawbacks: find refunds that landed on already-paid-out sessions
 * and make sure each has its negative adjustment.
 *
 * A named export rather than an inline cron callback, for the same reason
 * runSessionStatusUpdate is one — a body that only a cron can reach is a body
 * no test can call. Returns the number of rows recorded so a caller can
 * assert on it.
 */
const runClawbackReconciliation = async () => {
    if (clawbackSweepRunning) return 0;
    clawbackSweepRunning = true;
    try {
        const { reconcileClawbacks } = require('./payoutLedger');
        const recorded = await reconcileClawbacks();
        if (recorded > 0) logger.info('Payout clawback reconciliation complete', { recorded });
        return recorded;
    } catch (error) {
        // Swallowed deliberately: one bad session must not stop the hourly
        // sweep from reaching the rest, and the inline refund hook has
        // already written most of these anyway.
        logger.error('Error in payout clawback reconciliation', { error: error.message });
        return 0;
    } finally {
        clawbackSweepRunning = false;
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
    // Every minute, not every two: the instant-request window is two minutes,
    // and a sweep on a two-minute cadence could add most of another one to it
    // — a patient waiting on a doctor who is never coming should not sit
    // through double the advertised wait before being refunded.
    stuckSessionTask = cron.schedule('* * * * *', async () => {
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

    // --- Payout clawback reconciliation: hourly ---
    //
    // A session that was already paid out to a doctor and is later refunded
    // leaves the platform short that doctor's share, which has to come off
    // their next payout. applyTransition raises that adjustment inline the
    // moment a session reaches `refunded` — but THREE of the four refund
    // paths (cancelSession, _autoCancelUnacceptedSession, adminRefundSession)
    // still mutate paymentStatus with a raw save() and never reach that hook.
    //
    // So this is not a backstop today, it is the primary mechanism for those
    // three. It stays valuable after they are converted, because a webhook
    // that arrives while the app is restarting would otherwise be missed.
    // Idempotent via a unique key, so overlapping with the inline hook is
    // safe.
    clawbackTask = cron.schedule('0 * * * *', runClawbackReconciliation);

    logger.info('All schedulers started successfully (notifications: 1min, status-sweep: 5min, payment-cleanup: 30min, stuck-sessions: 2min, clawbacks: hourly)');

    // ── Phase 9: Expired Payment Cleanup (every 30 minutes) ──────────────────
    // Sessions where the patient opened Razorpay but didn't pay within 30 mins.
    // Mark them 'failed' and release the booked slot.
    paymentCleanupTask = cron.schedule('*/30 * * * *', async () => {
        if (paymentCleanupRunning) return;
        paymentCleanupRunning = true;
        try {
            const cutoff = new Date(Date.now() - CHECKOUT_TTL_MINUTES * 60 * 1000);

            const staleSessions = await Session.find({
                paymentStatus: 'pending',
                razorpayOrderId: { $ne: null }, // Only sessions that went through Razorpay
                createdAt: { $lte: cutoff },
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
    if (clawbackTask) {
        clawbackTask.stop();
        clawbackTask = null;
    }
    logger.info('All schedulers stopped');
};

module.exports = {
    startScheduler,
    stopScheduler,
    runSessionStatusUpdate,
    runClawbackReconciliation
};
