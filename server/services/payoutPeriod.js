/**
 * Weekly payout periods: Monday to Sunday, paid the following Tuesday.
 *
 * WHY THIS IS NOT TWO LINES OF DATE ARITHMETIC
 *
 * A period boundary is a wall-clock moment in the platform's timezone, not a
 * UTC one. Monday 00:00 IST is Sunday 18:30 UTC. Compute the boundary with
 * `setUTCHours(0,0,0,0)` on a Monday and every session in the 00:00–05:30 IST
 * band lands in the wrong week — the same class of error that put IST
 * bookings 5h30m out across the whole codebase and that utils/zonedTime.js
 * was written to eliminate. So the boundaries are built by naming a local
 * date and time and converting, exactly like a session's startsAt.
 *
 * WHY TUESDAY
 *
 * Razorpay settles captured payments to the platform's bank on roughly T+2.
 * Paying out on Monday morning means paying out money that has not arrived,
 * financed from the platform's own balance. The extra day means the last
 * session of the period has settled before its share is transferred.
 *
 * Ranges are HALF-OPEN, [start, end). Two consecutive weeks can never both
 * claim a session that ends exactly on the boundary.
 */

const { zonedToUtc, utcToZoned } = require('../utils/zonedTime');
const { PLATFORM_TIMEZONE } = require('../config/time');

/** 'YYYY-MM-DD' + n days, as a local calendar date. Pure string/UTC-date math. */
function addDays(localDate, n) {
  const [y, m, d] = localDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + n));
  return shifted.toISOString().slice(0, 10);
}

/** Day of week for a local date, 1 = Monday … 7 = Sunday (ISO). */
function isoDayOfWeek(localDate) {
  const [y, m, d] = localDate.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return day === 0 ? 7 : day;
}

/** The Monday of the ISO week containing this local date. */
function mondayOf(localDate) {
  return addDays(localDate, -(isoDayOfWeek(localDate) - 1));
}

/**
 * ISO week key, e.g. '2026-W37'.
 *
 * Uses the ISO-8601 rule — the week containing the year's first Thursday is
 * week 1 — so a period spanning New Year gets one stable key rather than two
 * depending on which end you look at.
 */
function isoWeekKey(localDate) {
  const monday = mondayOf(localDate);
  const [y, m, d] = monday.split('-').map(Number);
  const thursday = new Date(Date.UTC(y, m - 1, d + 3)); // the week's Thursday
  const isoYear = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.floor((thursday - jan1) / 604800000) + 1;
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * The payout period containing an instant.
 *
 * @param {Date} [instant]
 * @param {string} [zone]
 * @returns {{periodKey, periodStart, periodEnd, scheduledPayoutDate, localFrom, localTo}}
 */
function periodFor(instant = new Date(), zone = PLATFORM_TIMEZONE) {
  const { localDate } = utcToZoned(instant, zone);
  const monday = mondayOf(localDate);
  const nextMonday = addDays(monday, 7);

  return {
    periodKey: isoWeekKey(monday),
    periodStart: zonedToUtc(monday, '00:00', zone),
    periodEnd: zonedToUtc(nextMonday, '00:00', zone),   // exclusive
    // The Tuesday after the period closes.
    scheduledPayoutDate: zonedToUtc(addDays(monday, 8), '00:00', zone),
    localFrom: monday,
    localTo: addDays(monday, 6)   // the Sunday, for display
  };
}

/** The period immediately before the one containing `instant`. */
function previousPeriod(instant = new Date(), zone = PLATFORM_TIMEZONE) {
  const current = periodFor(instant, zone);
  return periodFor(new Date(current.periodStart.getTime() - 1), zone);
}

/**
 * Resolve a period from a key like '2026-W37'.
 * @throws {Error} on a key that is not a valid ISO week
 */
function periodFromKey(key, zone = PLATFORM_TIMEZONE) {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(key || ''));
  if (!match) throw new Error(`Invalid period key "${key}" — expected e.g. 2026-W37`);
  const [, year, week] = match;

  // Week 1 is the week containing 4 January, by the ISO rule.
  const jan4 = `${year}-01-04`;
  const target = addDays(mondayOf(jan4), (Number(week) - 1) * 7);
  const resolved = periodFor(zonedToUtc(target, '12:00', zone), zone);
  if (resolved.periodKey !== key) {
    throw new Error(`Invalid period key "${key}" — resolves to ${resolved.periodKey}`);
  }
  return resolved;
}

module.exports = { periodFor, previousPeriod, periodFromKey, isoWeekKey, mondayOf, addDays };
