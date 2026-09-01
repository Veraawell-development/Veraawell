/**
 * Backfill Session.startsAt / endsAt / timezone / localDate / localTime, and
 * repair DoctorAvailability.bookedSlots to carry a slotKey.
 *
 * WHY
 *
 * Sessions used to store a UTC-midnight `sessionDate` plus a bare
 * `sessionTime` string, and every consumer re-derived an instant with
 * `new Date(sessionDate).setHours(h, m)` — which applies the SERVER's offset.
 * On a UTC host that read a 9:00 AM IST booking as 2:30 PM IST. The refund
 * tier, the join window, the no-show sweep and the reminder windows all
 * inherited the error. Sessions now store an explicit instant; existing rows
 * need one computed.
 *
 * INFERENCE
 *
 * The ambiguity is not really the time string — it is which producer wrote the
 * row, and that is recoverable from the data:
 *
 *   sessionDate has NO time component (00:00:00 UTC)
 *     -> bookSession wrote it: `new Date('YYYY-MM-DD')`. The date part is a
 *        plain calendar date and sessionTime is an IST wall clock (that is
 *        what the doctor's slot grid published and the patient saw).
 *        startsAt = zonedToUtc(date, sessionTime, Asia/Kolkata)      [HIGH]
 *
 *   sessionDate HAS a time component
 *     -> bookImmediate wrote it: `new Date()`, already a correct instant.
 *        sessionTime was generated from getUTCHours() and is redundant;
 *        re-deriving from it would corrupt the value.
 *        startsAt = sessionDate                                      [HIGH]
 *
 * The only genuinely ambiguous input is a bare '12:mm' (24h noon vs 12h
 * midnight). Since only bookImmediate emitted bare 24-hour strings and those
 * rows take the instant branch, a bare '12:mm' on a midnight-UTC row is read
 * as noon, and flagged MEDIUM.
 *
 * ROWS THAT CANNOT BE RESOLVED are never guessed. A wrong instant on a live
 * session changes a refund tier and a join window, so:
 *   - terminal sessions (completed/cancelled/no-show) get a best-effort
 *     startsAt = sessionDate, stamped confidence 'low', so list and calendar
 *     queries do not break on a missing field;
 *   - live sessions (payment_pending/scheduled/active) are REPORTED and the
 *     script exits 2. Resolve those by hand.
 *
 * Idempotent: the selection query stops matching once a row is backfilled, so
 * re-running is safe and does no work.
 *
 * Usage:
 *   node server/migrations/backfillSessionStartsAt.js              # dry run
 *   node server/migrations/backfillSessionStartsAt.js --apply
 *   node server/migrations/backfillSessionStartsAt.js --apply --limit=100
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Session = require('../models/session');
const DoctorAvailability = require('../models/doctorAvailability');
const { zonedToUtc, utcToZoned, to12hSlot, normalizeTimeTo24h, slotKey } = require('../utils/zonedTime');
const { PLATFORM_TIMEZONE } = require('../config/time');

const APPLY = process.argv.includes('--apply');
const LIMIT = (() => {
  const arg = process.argv.find((a) => a.startsWith('--limit='));
  return arg ? Number(arg.split('=')[1]) : 0;
})();
const TZ = (() => {
  const arg = process.argv.find((a) => a.startsWith('--tz='));
  return arg ? arg.split('=')[1] : PLATFORM_TIMEZONE;
})();

const LIVE_STATUSES = ['payment_pending', 'scheduled', 'active'];

/** @returns {{startsAt: Date, confidence: 'high'|'medium'}|{unresolved: string}} */
function inferStartsAt(session) {
  const raw = session.sessionDate instanceof Date ? session.sessionDate : new Date(session.sessionDate);
  if (!raw || Number.isNaN(raw.getTime())) return { unresolved: 'sessionDate is not a valid date' };

  const hasTimeComponent = raw.getUTCHours() !== 0 || raw.getUTCMinutes() !== 0 || raw.getUTCSeconds() !== 0;

  if (hasTimeComponent) {
    // bookImmediate: the stored value is already the instant.
    if (session.sessionType && session.sessionType !== 'immediate') {
      // Producer signals disagree. Trust the instant (it is unambiguous data)
      // but flag it for review.
      return { startsAt: raw, confidence: 'medium' };
    }
    return { startsAt: raw, confidence: 'high' };
  }

  // bookSession: calendar date + IST wall clock.
  if (!session.sessionTime) return { unresolved: 'no sessionTime to combine with a midnight-UTC date' };

  let time24;
  try {
    time24 = normalizeTimeTo24h(session.sessionTime);
  } catch (err) {
    return { unresolved: `unparseable sessionTime "${session.sessionTime}"` };
  }

  const localDate = raw.toISOString().slice(0, 10);
  const bare12 = /^12:\d{2}$/.test(String(session.sessionTime).trim());
  return {
    startsAt: zonedToUtc(localDate, time24, TZ),
    confidence: bare12 ? 'medium' : 'high'
  };
}

async function migrate() {
  console.log(`\nBackfill Session.startsAt  (${APPLY ? 'APPLY' : 'DRY RUN'}, timezone ${TZ})\n`);

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/veraawell');
  console.log('Connected to MongoDB\n');

  const query = { $or: [{ startsAt: { $exists: false } }, { startsAt: null }] };
  let cursor = Session.find(query).sort({ createdAt: 1 });
  if (LIMIT) cursor = cursor.limit(LIMIT);
  const sessions = await cursor.lean();

  console.log(`${sessions.length} session(s) need a startsAt\n`);

  const counts = { high: 0, medium: 0, low: 0, unresolvedLive: 0, slotsRepaired: 0 };
  const unresolvedLive = [];

  for (const session of sessions) {
    const inferred = inferStartsAt(session);
    const isLive = LIVE_STATUSES.includes(session.status);

    let startsAt;
    let confidence;

    if (inferred.unresolved) {
      if (isLive) {
        // Never guess a live session's time: it decides money and access.
        counts.unresolvedLive += 1;
        unresolvedLive.push({
          _id: String(session._id),
          status: session.status,
          paymentStatus: session.paymentStatus,
          price: session.price,
          sessionDate: session.sessionDate,
          sessionTime: session.sessionTime,
          reason: inferred.unresolved
        });
        continue;
      }
      // Terminal and unresolvable: best effort so queries do not break.
      startsAt = new Date(session.sessionDate);
      confidence = 'low';
      counts.low += 1;
    } else {
      startsAt = inferred.startsAt;
      confidence = inferred.confidence;
      counts[confidence] += 1;
    }

    const { localDate, localTime } = utcToZoned(startsAt, TZ);
    const duration = session.duration || 60;
    const update = {
      startsAt,
      endsAt: new Date(startsAt.getTime() + duration * 60000),
      timezone: TZ,
      localDate,
      localTime,
      sessionTime: to12hSlot(localTime),
      dateBackfillConfidence: confidence
    };

    if (APPLY) {
      // updateOne, not save(): the pre-validate hook would re-derive from the
      // very fields being corrected.
      await Session.updateOne({ _id: session._id }, { $set: update });
    }

    if (counts.high + counts.medium + counts.low <= 10 || (counts.high + counts.medium + counts.low) % 50 === 0) {
      console.log(
        `  ${String(session._id).slice(0, 8)}  ${session.status.padEnd(16)}` +
        `  ${String(session.sessionTime).padEnd(10)} -> ${localDate} ${localTime} (${confidence})`
      );
    }
  }

  // ── Repair bookedSlots so slot identity is a key, not a formatted string ──
  const availabilities = await DoctorAvailability.find({ 'bookedSlots.0': { $exists: true } });
  for (const avail of availabilities) {
    let changed = false;
    for (const slot of avail.bookedSlots) {
      if (slot.slotKey) continue;
      try {
        slot.slotKey = slotKey(slot.date, slot.time);
        slot.time = to12hSlot(normalizeTimeTo24h(slot.time));
        changed = true;
        counts.slotsRepaired += 1;
      } catch (err) {
        console.log(`  ! unparseable booked slot on doctor ${String(avail.doctorId).slice(0, 8)}: ${slot.date} ${slot.time}`);
      }
    }
    if (changed && APPLY) await avail.save();
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`  high confidence   : ${counts.high}`);
  console.log(`  medium confidence : ${counts.medium}`);
  console.log(`  low (terminal)    : ${counts.low}`);
  console.log(`  booked slots keyed: ${counts.slotsRepaired}`);
  console.log(`  UNRESOLVED (live) : ${counts.unresolvedLive}`);

  if (unresolvedLive.length > 0) {
    console.log('\nThese LIVE sessions could not be resolved and were NOT modified.');
    console.log('Resolve each by hand — a wrong instant changes the refund tier and the join window.\n');
    for (const row of unresolvedLive) {
      console.log(`  ${row._id}  ${row.status}/${row.paymentStatus}  price=${row.price}`);
      console.log(`      sessionDate=${row.sessionDate}  sessionTime=${JSON.stringify(row.sessionTime)}`);
      console.log(`      reason: ${row.reason}`);
    }
  }

  if (!APPLY) console.log('\nDry run — nothing was written. Re-run with --apply.');

  await mongoose.connection.close();
  process.exit(unresolvedLive.length > 0 ? 2 : 0);
}

migrate().catch(async (error) => {
  console.error('\nMigration failed:', error);
  try { await mongoose.connection.close(); } catch (e) { /* already closed */ }
  process.exit(1);
});
