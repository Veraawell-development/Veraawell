/**
 * Is the therapist free — now, or at a given time?
 *
 * An instant request could land on top of a booked session (the doctor was
 * "online", so the ring went through), and a time slot could be sold while an
 * instant call was still running into it. One doctor, one session at a time:
 * any live session, or a checkout holding a slot, makes the doctor busy for
 * its whole span — to its real end, which is later when the doctor joined
 * late (effectiveEndsAt).
 *
 * An instant request also leaves a few minutes either side (BUFFER_MINUTES),
 * so a session starting at 10:00 isn't preceded by a call that ends at 9:59.
 */

const Session = require('../models/session');

const MINUTE_MS = 60 * 1000;
const BUFFER_MINUTES = 5;
/** The shortest session; what "free right now" is measured against. */
const SHORTEST_SESSION_MINUTES = 20;

const BLOCKING = Object.freeze({
  status: { $in: ['scheduled', 'active', 'payment_pending'] },
  paymentStatus: { $in: ['paid', 'not_required', 'pending'] }
});

const endOf = (s) => new Date(s.effectiveEndsAt || s.endsAt);

/**
 * The doctor's sessions that overlap [from, to), as stored. Strict
 * comparisons: back-to-back is not an overlap.
 */
async function overlapping(doctorId, from, to, { excludeSessionId = null } = {}) {
  const filter = {
    doctorId,
    ...BLOCKING,
    startsAt: { $lt: to },
    $or: [
      { effectiveEndsAt: null, endsAt: { $gt: from } },
      { effectiveEndsAt: { $gt: from } }
    ]
  };
  if (excludeSessionId) filter._id = { $ne: excludeSessionId };
  return Session.find(filter).select('startsAt endsAt effectiveEndsAt sessionType status').lean();
}

/** Does anything overlap a session of `minutes` starting at `at`? */
async function isBusy(doctorId, at, minutes, { bufferMinutes = 0, excludeSessionId = null } = {}) {
  const from = new Date(at.getTime() - bufferMinutes * MINUTE_MS);
  const to = new Date(at.getTime() + (minutes + bufferMinutes) * MINUTE_MS);
  const found = await overlapping(doctorId, from, to, { excludeSessionId });
  return found.length > 0;
}

/**
 * Can the doctor take an instant session of `minutes` right now?
 *
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'offline' | 'busy' }>}
 */
async function instantAvailability(doctor, minutes, { now = new Date() } = {}) {
  const presence = require('./presence');
  if (!doctor || !doctor.isOnline || !presence.isConnected(doctor._id)) return { ok: false, reason: 'offline' };
  if (await isBusy(doctor._id, now, minutes, { bufferMinutes: BUFFER_MINUTES })) return { ok: false, reason: 'busy' };
  return { ok: true };
}

/** Of these doctors, which are in (or about to start) a session right now? */
async function busyNow(doctorIds, { now = new Date() } = {}) {
  if (!doctorIds.length) return new Set();
  const to = new Date(now.getTime() + (SHORTEST_SESSION_MINUTES + BUFFER_MINUTES) * MINUTE_MS);
  const from = new Date(now.getTime() - BUFFER_MINUTES * MINUTE_MS);
  const rows = await Session.find({
    doctorId: { $in: doctorIds },
    ...BLOCKING,
    startsAt: { $lt: to },
    $or: [
      { effectiveEndsAt: null, endsAt: { $gt: from } },
      { effectiveEndsAt: { $gt: from } }
    ]
  }).select('doctorId').lean();
  return new Set(rows.map((r) => String(r.doctorId)));
}

/** The doctor's blocking sessions touching [from, to) — for filtering a day's slots in one query. */
async function busySpans(doctorId, from, to) {
  const rows = await overlapping(doctorId, from, to);
  return rows.map((s) => ({ from: new Date(s.startsAt), to: endOf(s), sessionType: s.sessionType }));
}

module.exports = { BUFFER_MINUTES, SHORTEST_SESSION_MINUTES, isBusy, instantAvailability, busyNow, busySpans };
