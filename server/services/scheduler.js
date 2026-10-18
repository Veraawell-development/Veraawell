const cron = require('node-cron');
const Session = require('../models/session');
const { sendSessionReminderEmail } = require('./email.service');
const { createLogger } = require('../utils/logger');
const { resolveStartsAt, resolveEndsAt } = require('../services/sessionTime');
const { NO_SHOW_GRACE_MINUTES } = require('../config/time');
const { tryTransition } = require('./sessionTransition');
const { EVENT, ACTOR } = require('./sessionState');
const { refundSession, reconcileStuckRefund, STUCK_REFUND_MINUTES } = require('./sessionRefund');
const { expireStaleCheckouts } = require('./sessionPayment');

/**
 * How far back the status sweep looks. It was 24 hours, and the server sleeps
 * when idle on its current host: a session that ended during a longer sleep
 * was never completed, never paid out and never no-show refunded. The query
 * is an indexed range scan on { status, endsAt }, so a wide window is cheap.
 */
const STATUS_SWEEP_LOOKBACK_DAYS = 30;

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
 *
 * A session is swept NO_SHOW_GRACE_MINUTES after its end, not at it: the
 * constant existed for exactly this and nothing read it, so a call running a
 * minute over was swept mid-conversation, and a late joiner who arrived
 * inside the join window could already be recorded as a no-show.
 */
const runSessionStatusUpdate = async ({ now = new Date() } = {}) => {
    try {
        const cutoff = new Date(now.getTime() - STATUS_SWEEP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
        const sweepBefore = new Date(now.getTime() - NO_SHOW_GRACE_MINUTES * 60 * 1000);

        // "Every live session whose end time has passed" is now one indexed
        // range scan on endsAt. It used to load every scheduled session from a
        // 24-hour window and re-derive each end time in JavaScript with
        // setHours — which applied the server's offset, so on a UTC host an
        // IST session was swept 5h30m early or late.
        //
        // The end is effectiveEndsAt when it is set: a doctor who joined late
        // moved it later so the patient keeps their minutes, and sweeping by
        // the booked end would close a session still in its call.
        const scheduledSessions = await Session.find({
            status: { $in: ['scheduled', 'active'] },
            endsAt: { $gte: cutoff },
            $or: [
                { effectiveEndsAt: null, endsAt: { $lte: sweepBefore } },
                { effectiveEndsAt: { $lte: sweepBefore } }
            ]
        });

        if (scheduledSessions.length === 0) return 0;

        let updatedCount = 0;
        let refundedCount = 0;
        for (const session of scheduledSessions) {
            if ((session.effectiveEndsAt || resolveEndsAt(session)) > sweepBefore) continue;

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

            if (swept.session.status === 'completed') {
                await require('./sessionEnding').sendCompletionSummary(session._id);
            }

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
        // Refunds orphaned in refund_pending by a crash between the gateway
        // call and recording it. reconcileStuckRefund asks Razorpay before
        // sending anything, so this cannot refund twice. Before the clawbacks,
        // because resolving one can create one.
        await runStuckRefundReconciliation();

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

/** Resolve every refund claimed more than STUCK_REFUND_MINUTES ago and never recorded. */
const runStuckRefundReconciliation = async (now = new Date()) => {
    const cutoff = new Date(now.getTime() - STUCK_REFUND_MINUTES * 60 * 1000);
    const stuck = await Session.find({
        paymentStatus: 'refund_pending',
        $or: [{ refundRequestedAt: { $lte: cutoff } }, { refundRequestedAt: null, updatedAt: { $lte: cutoff } }]
    }).select('_id').limit(100).lean();

    let resolved = 0;
    for (const { _id } of stuck) {
        try {
            const result = await reconcileStuckRefund(_id, { now });
            if (['recorded-existing', 'refunded'].includes(result.resolved)) resolved += 1;
        } catch (err) {
            logger.error('Stuck refund reconciliation failed', { sessionId: String(_id).substring(0, 8), error: err.message });
        }
    }
    if (resolved > 0) logger.info('Stuck refunds resolved', { resolved });
    return resolved;
};

/**
 * Session reminder emails (15 minutes before, starting now, and a late
 * alert). Named and exported so it can be run with an injected clock — by
 * the tests and by the e2e stack's job trigger — instead of only from cron.
 */
const runReminderSweep = async ({ now = new Date() } = {}) => {
    if (notificationSweepRunning) return;
    notificationSweepRunning = true;
    try {
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
          // Per session: one failed email used to abort the loop and
          // leave every later session in the window without a reminder.
          try {
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

            // Only the flags, not a save() of a document read up to a
            // minute ago — that could not revert status today, but it is
            // the shape every revert bug in this codebase started from.
            if (changed) {
                await Session.updateOne(
                    { _id: session._id },
                    { $set: { notificationStatus: session.notificationStatus } }
                );
            }
          } catch (err) {
            logger.error('Reminder failed for one session', { sessionId: String(session._id).substring(0, 8), error: err.message });
          }
        }
    } catch (error) {
        logger.error('Error in notification scheduler', { error: error.message });
    } finally {
        notificationSweepRunning = false;
    }
};

/** Expire unpaid checkouts and free their slots. Named for the same reason as the others: testable. */
const runCheckoutExpiry = async (io = null) => {
    if (paymentCleanupRunning) return 0;
    paymentCleanupRunning = true;
    try {
        const expired = await expireStaleCheckouts({ io });
        if (expired > 0) logger.info('Expired unpaid checkouts', { expired });
        return expired;
    } catch (error) {
        logger.error('Error in checkout expiry', { error: error.message });
        return 0;
    } finally {
        paymentCleanupRunning = false;
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
    notificationTask = cron.schedule('* * * * *', () => runReminderSweep());

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
    // moment a session reaches `refunded` — but two of the refund paths
    // (_autoCancelUnacceptedSession, adminRefundSession) and the
    // refund.processed webhook still mutate paymentStatus with a raw save()
    // and never reach that hook. (cancelSession now goes through
    // sessionRefund, so it does.)
    //
    // So this is not a backstop today, it is the primary mechanism for those
    // paths. It stays valuable after they are converted, because a webhook
    // that arrives while the app is restarting would otherwise be missed.
    // Idempotent via a unique key, so overlapping with the inline hook is
    // safe.
    clawbackTask = cron.schedule('0 * * * *', runClawbackReconciliation);

    // --- Unpaid checkout expiry: every minute ---
    // It ran every 30 minutes against a 20-minute TTL, so an abandoned
    // checkout held its slot for up to 50 minutes; a public request-driven
    // copy papered over that with a non-atomic rewrite of the doctor's
    // bookedSlots. Every minute is cheap — it is an indexed query that is
    // almost always empty.
    paymentCleanupTask = cron.schedule('* * * * *', () => runCheckoutExpiry(io));

    logger.info('All schedulers started (reminders: 1min, checkout expiry: 1min, instant requests: 1min, status sweep: 5min, refunds+clawbacks: hourly)');

    // Catch up once at boot. The host sleeps when idle and every cron above
    // pauses with it; without this, work that fell due during the sleep
    // waits for the next tick of each schedule.
    //
    // Not under Jest: a timer firing five seconds into whichever suite happens
    // to be running sweeps that suite's data at an arbitrary moment, which
    // made both behaviour and coverage depend on how fast the machine was.
    // runBootCatchUp is exported and tested directly instead.
    if (process.env.NODE_ENV !== 'test') {
        setTimeout(() => runBootCatchUp(io), 5000).unref();
    }
};

/** The work a restart may have missed: expiry, the status sweep, refunds and clawbacks. */
const runBootCatchUp = async (io = null) => {
    try {
        await runCheckoutExpiry(io);
        await runSessionStatusUpdate();
        await runClawbackReconciliation();
        return true;
    } catch (error) {
        logger.error('Boot catch-up failed', { error: error.message });
        return false;
    }
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
    runClawbackReconciliation,
    runStuckRefundReconciliation,
    runCheckoutExpiry,
    runReminderSweep,
    runBootCatchUp
};
