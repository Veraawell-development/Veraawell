/**
 * Time constants.
 *
 * These were literals scattered through the codebase: `15` and `-60` inside
 * models/session.js canJoin(), a hardcoded 'Asia/Kolkata' in
 * controllers/moodEntry.controller.js, and an implicit "whatever timezone the
 * server happens to run in" everywhere else.
 */

/**
 * The timezone the product operates in.
 *
 * Every doctor's availability grid is published in this zone, and every
 * patient-visible time is displayed in it. It is the zone that gives meaning
 * to a stored "09:00 AM" slot string.
 *
 * IST is DST-free, which is why the conversion helpers in utils/zonedTime.js
 * can be simple — but they are written to be correct for any IANA zone, so
 * expanding beyond India does not require rewriting them.
 */
const PLATFORM_TIMEZONE = 'Asia/Kolkata';

/** A session becomes joinable this many minutes before its start. */
const JOIN_LEAD_MINUTES = 15;

/** ...and stops being joinable this many minutes after its end. */
const JOIN_GRACE_MINUTES = 60;

/** How long after the end a session is swept to completed / no-show. */
const NO_SHOW_GRACE_MINUTES = 10;

/**
 * How long an unpaid checkout holds its slot.
 *
 * There were two different answers to this in the code: cleanupPendingSessions
 * used 15 minutes and ran on every public availability request, while
 * scheduler.paymentCleanupTask used 30 minutes. They could disagree about the
 * same booking. One number, one owner.
 */
const CHECKOUT_TTL_MINUTES = 20;

/**
 * How long a doctor has to answer a paid instant request before it is
 * cancelled and the patient refunded.
 *
 * Same lesson as CHECKOUT_TTL_MINUTES above, and it had gone wrong the same
 * way: the doctor's popup counted down from 60 seconds while the server sweep
 * waited 10 minutes from createdAt. A patient could be told "no answer" a
 * minute in while the server still considered the request live, and an
 * immediate session — 20 minutes long — could be cancelled mid-call.
 *
 * The number is only half the fix. Each session also carries its own
 * acceptanceDeadline, stamped when payment lands, so the popup, the sweep and
 * the backfill endpoint all read one timestamp instead of each applying this
 * constant to a different clock.
 */
const INSTANT_ACCEPT_WINDOW_MINUTES = 2;

module.exports = {
  PLATFORM_TIMEZONE,
  JOIN_LEAD_MINUTES,
  JOIN_GRACE_MINUTES,
  NO_SHOW_GRACE_MINUTES,
  CHECKOUT_TTL_MINUTES,
  INSTANT_ACCEPT_WINDOW_MINUTES
};
