/**
 * Timezone-correct conversions, using Intl only.
 *
 * THE BUG THIS REPLACES
 *
 * Almost every "when is this session" calculation in the codebase looked like:
 *
 *     const [h, m] = parseTime(session.sessionTime);   // '09:00 AM' -> [9, 0]
 *     const dt = new Date(session.sessionDate);        // UTC midnight
 *     dt.setHours(h, m, 0, 0);                         // <- SERVER-local
 *
 * `setHours` applies the *server's* offset. On Render (UTC) a 9:00 AM IST slot
 * — what the doctor published and the patient booked — becomes 09:00Z, i.e.
 * 2:30 PM IST. Everything downstream inherits that 5h30m error: the
 * "can't book in the past" check, the refund tier (`hoursUntil`), the 15-minute
 * join window, the no-show sweep, and the reminder windows (which additionally
 * mix UTC day boundaries with local setHours, so sessions in the 00:00–05:30
 * IST band fall outside the queried day entirely and never get a reminder).
 *
 * WHY Intl AND NOT A LIBRARY
 *
 * The one place that already gets this right — moodEntry.controller.js — uses
 * `Intl.DateTimeFormat` with an explicit timeZone. The server has no date
 * dependency at all today; adding date-fns-tz would introduce a second date
 * stack that has to agree with the client's date-fns about refund tiers. The
 * primitive actually needed is an exact offset lookup, which is ~20 lines here
 * and is DST-correct for any zone.
 */

const { PLATFORM_TIMEZONE } = require('../config/time');
const { ValidationError } = require('./errors');

/**
 * Offset of `zone` at instant `date`, in minutes east of UTC (IST => +330).
 *
 * Works by asking Intl what the wall clock reads in that zone at that instant,
 * reinterpreting those fields as if they were UTC, and taking the difference.
 */
function zoneOffsetMinutes(date, zone = PLATFORM_TIMEZONE) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = {};
  for (const { type, value } of dtf.formatToParts(date)) parts[type] = value;
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  // Drop sub-second precision on both sides so the difference is exact.
  return (asIfUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}

/**
 * A wall-clock time in a zone -> the UTC instant.
 *
 *   zonedToUtc('2026-03-14', '09:00', 'Asia/Kolkata')
 *     -> 2026-03-14T03:30:00.000Z
 *
 * Two passes: the first guesses the offset from the naive instant, the second
 * corrects it if that guess landed on the far side of a DST transition. For a
 * DST-free zone like IST the second pass is a no-op. A nonexistent local time
 * (spring-forward gap) maps forward; an ambiguous one (fall-back) resolves to
 * the earlier instant. Neither occurs in Asia/Kolkata, but both are pinned by
 * tests so the behaviour is a decision rather than an accident.
 *
 * @param {string} localDate 'YYYY-MM-DD'
 * @param {string} localTime24 'HH:mm'
 * @param {string} [zone] IANA zone
 * @returns {Date}
 */
function zonedToUtc(localDate, localTime24, zone = PLATFORM_TIMEZONE) {
  const dateStr = normalizeDate(localDate);
  const timeStr = normalizeTimeTo24h(localTime24);
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);

  const naive = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  let offset = zoneOffsetMinutes(new Date(naive), zone);
  let instant = naive - offset * 60000;
  const corrected = zoneOffsetMinutes(new Date(instant), zone);
  if (corrected !== offset) {
    offset = corrected;
    instant = naive - offset * 60000;
  }
  return new Date(instant);
}

/**
 * A UTC instant -> the wall clock in a zone.
 * @returns {{localDate: string, localTime: string}} 'YYYY-MM-DD', 'HH:mm'
 */
function utcToZoned(date, zone = PLATFORM_TIMEZONE) {
  const d = date instanceof Date ? date : new Date(date);
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
  const parts = {};
  for (const { type, value } of dtf.formatToParts(d)) parts[type] = value;
  return {
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    // Intl renders midnight as '24' under some ICU versions with hourCycle h23.
    localTime: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
  };
}

/**
 * Any time string this codebase produces -> 'HH:mm'.
 *
 * Three producers exist and they disagree: the doctor availability grid emits
 * 12-hour ('09:00 AM'), bookImmediate emitted 24-hour from getUTCHours()
 * ('14:30'), and utils/timeUtils.parseTime string-sniffed for 'AM'/'PM' and
 * threw a TypeError on anything without a colon.
 *
 * @throws {ValidationError} on input that cannot be read as a time
 */
function normalizeTimeTo24h(input) {
  if (input == null) throw new ValidationError('Invalid time', { time: 'A time is required' });
  const raw = String(input).trim().toUpperCase();

  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/);
  if (!m) {
    throw new ValidationError('Invalid time format', {
      time: `Expected "HH:mm" or "hh:mm AM/PM", received "${input}"`
    });
  }

  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3];

  if (minutes > 59) throw new ValidationError('Invalid time', { time: `Minutes out of range in "${input}"` });

  if (meridiem) {
    if (hours < 1 || hours > 12) throw new ValidationError('Invalid time', { time: `Hour out of range in "${input}"` });
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else if (hours > 23) {
    throw new ValidationError('Invalid time', { time: `Hour out of range in "${input}"` });
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * 'HH:mm' -> 'hh:mm A' — the canonical slot string.
 *
 * This must match the doctor availability grid exactly, because slot identity
 * is a string comparison: cancelSession calls releaseSlot(date, sessionTime)
 * and a format mismatch silently fails to find the slot, leaking it forever.
 */
function to12hSlot(hhmm) {
  const [h, m] = normalizeTimeTo24h(hhmm).split(':').map(Number);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${meridiem}`;
}

/** Any date-ish value -> 'YYYY-MM-DD'. */
function normalizeDate(input) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new ValidationError('Invalid date', { date: 'Not a valid date' });
    return input.toISOString().slice(0, 10);
  }
  const raw = String(input).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new ValidationError('Invalid date format', { date: `Expected "YYYY-MM-DD", received "${input}"` });
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Canonical, format-insensitive slot identity.
 * slotKey('2026-03-14', '9:00 AM') === slotKey('2026-03-14', '09:00')
 */
function slotKey(dateStr, timeStr) {
  return `${normalizeDate(dateStr)}T${normalizeTimeTo24h(timeStr)}`;
}

/**
 * Display string pinned to the platform zone.
 *
 * Needed because the browser renders an ISO instant in the *viewer's* zone: a
 * patient travelling abroad would otherwise see a 9:00 AM IST session as
 * "3:30 AM". Slots are defined in the doctor's zone, so display follows it.
 */
function formatForDisplay(date, zone = PLATFORM_TIMEZONE) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: zone,
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  }).format(d);
}

/** Just the time portion, e.g. '9:00 AM'. */
function formatTimeForDisplay(date, zone = PLATFORM_TIMEZONE) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true
  }).format(d);
}

module.exports = {
  zoneOffsetMinutes,
  zonedToUtc,
  utcToZoned,
  normalizeTimeTo24h,
  to12hSlot,
  normalizeDate,
  slotKey,
  formatForDisplay,
  formatTimeForDisplay
};
