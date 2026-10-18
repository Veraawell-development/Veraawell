/**
 * The session rules, as pure functions.
 *
 * Every question about lateness, absence and the final result of a session is
 * answered here and nowhere else: who counts as present, when the waiting
 * patient may leave with a full refund, when a session really ends, and what
 * it finally was (completed, a no-show, refunded…). The rules themselves are
 * the business decisions in docs/SESSION_RULES.md:
 *
 *   - 10-minute grace: someone not in the room by start + 10 min is absent.
 *   - A late patient loses the minutes; a late doctor does not cost the
 *     patient any — the session ends later instead.
 *   - A patient left waiting on their own for 10 minutes (the doctor never
 *     came, or came, left and hasn't returned) may leave with a full refund.
 *   - Nobody came: full refund. Doctor never came: full refund.
 *   - Leaving never ends a session; ending early needs both to agree.
 *
 * PURE: no database, no network, no clock except the injected `now`. Every
 * function takes the session document (or a plain object with the same
 * fields) and reads its `attendance` intervals, so the whole rulebook is
 * testable exhaustively in milliseconds (__tests__/sessionPolicy.test.js).
 *
 * Sessions booked before attendance was recorded have no `attendance`, only
 * the doctorJoined / patientJoined flags and their timestamps. They are read
 * as one open interval from the recorded join (or from the start, when only
 * the flag exists), so a session in progress across the release still gets
 * an answer.
 */

const { resolveStartsAt, resolveEndsAt } = require('./sessionTime');
const { GRACE_MINUTES, ALONE_REFUND_MINUTES, JOIN_LEAD_MINUTES } = require('../config/time');

const MINUTE_MS = 60 * 1000;
const LIVE_STATUSES = Object.freeze(['scheduled', 'active']);

const OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  PATIENT_NO_SHOW: 'patient_no_show',
  DOCTOR_NO_SHOW: 'doctor_no_show',
  NOBODY_CAME: 'nobody_came',
  DOCTOR_ABSENT_REFUND: 'doctor_absent_refund',
  ENDED_BY_CONSENT: 'ended_by_consent',
  CANCELLED_BY_PATIENT: 'cancelled_by_patient',
  CANCELLED_BY_DOCTOR: 'cancelled_by_doctor',
  LATE_CANCELLATION: 'late_cancellation',
  INSTANT_UNANSWERED: 'instant_unanswered',
  CHECKOUT_ABANDONED: 'checkout_abandoned'
});

const GRACE = Object.freeze({
  BOTH: 'both',
  DOCTOR_ABSENT: 'doctor_absent',
  PATIENT_ABSENT: 'patient_absent',
  NOBODY: 'nobody'
});

const toDate = (value) => (value instanceof Date ? value : new Date(value));
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * MINUTE_MS);

/**
 * One person's stays in the call, oldest first: `{ from, to }` where `to` is
 * null while they are still in.
 */
function intervals(session, role) {
  const recorded = (session.attendance || [])
    .filter((a) => a && a.role === role && a.joinedAt)
    .map((a) => ({ from: toDate(a.joinedAt), to: a.leftAt ? toDate(a.leftAt) : null }))
    .sort((x, y) => x.from - y.from);
  if (recorded.length) return recorded;

  // Pre-attendance sessions: the legacy flags.
  const joinedAt = session[`${role}JoinedAt`];
  if (joinedAt) return [{ from: toDate(joinedAt), to: null }];
  if (session[`${role}Joined`] === true) return [{ from: resolveStartsAt(session), to: null }];
  return [];
}

/** When this person first came into the call, or null. */
function firstJoin(session, role) {
  const list = intervals(session, role);
  return list.length ? list[0].from : null;
}

/** Were they in the call at instant `at`? */
function isPresent(session, role, at) {
  const t = toDate(at).getTime();
  return intervals(session, role).some((i) => i.from.getTime() <= t && (i.to === null || i.to.getTime() > t));
}

/** Were patient and doctor ever in the call at the same time? */
function everTogether(session) {
  const doctor = intervals(session, 'doctor');
  const patient = intervals(session, 'patient');
  const end = (i) => (i.to === null ? Infinity : i.to.getTime());
  return doctor.some((a) => patient.some((b) => a.from.getTime() < end(b) && b.from.getTime() < end(a)));
}

/** Start + 10 minutes. */
function graceDeadline(session) {
  return addMinutes(resolveStartsAt(session), GRACE_MINUTES);
}

/**
 * When the session really ends.
 *
 * The booked end — unless the doctor's first join was after the start, in
 * which case the patient keeps their full booked minutes from that join.
 * Never earlier than the booked end, and a late PATIENT never moves it.
 */
function effectiveEndsAt(session) {
  const start = resolveStartsAt(session);
  const end = resolveEndsAt(session);
  const doctorIn = firstJoin(session, 'doctor');
  if (!doctorIn || doctorIn.getTime() <= start.getTime()) return end;
  const minutes = Number(session.duration) || Math.round((end - start) / MINUTE_MS);
  const extended = addMinutes(doctorIn, minutes);
  return extended > end ? extended : end;
}

/** The call can be opened 15 minutes before the start, until it really ends. */
function joinWindow(session) {
  return {
    opensAt: addMinutes(resolveStartsAt(session), -JOIN_LEAD_MINUTES),
    closesAt: effectiveEndsAt(session)
  };
}

const aloneAt = (session, at) => isPresent(session, 'patient', at) && !isPresent(session, 'doctor', at);

/**
 * The start of the current stretch in which the patient is in the call and
 * the doctor is not; null when that isn't the situation at `now`.
 */
function aloneSince(session, now) {
  if (!aloneAt(session, now)) return null;
  const nowMs = toDate(now).getTime();
  const points = new Set();
  for (const role of ['patient', 'doctor']) {
    for (const i of intervals(session, role)) {
      if (i.from.getTime() <= nowMs) points.add(i.from.getTime());
      if (i.to && i.to.getTime() <= nowMs) points.add(i.to.getTime());
    }
  }
  // Walk back through every change point; the stretch began at the first one
  // before which the patient was not alone.
  const descending = [...points].sort((a, b) => b - a);
  for (const p of descending) {
    if (!aloneAt(session, p - 1)) return new Date(p);
  }
  return toDate(now);
}

/**
 * May the waiting patient leave now with a full refund?
 *
 * After the grace deadline, while the patient is in the call and the doctor
 * is not: straight away if the doctor never came; after 10 minutes on their
 * own if the doctor came and left. Only for paid, still-live sessions —
 * a free session has nothing to refund.
 */
function doctorAbsentRefundAvailable(session, now) {
  const at = doctorAbsentRefundAt(session, now);
  return at !== null && at.getTime() <= toDate(now).getTime();
}

/**
 * When "Leave & full refund" becomes available for the patient as things
 * stand at `now` (possibly already in the past), or null when it doesn't
 * apply (doctor here, patient not here, session over or unpaid).
 */
function doctorAbsentRefundAt(session, now) {
  if (!LIVE_STATUSES.includes(session.status)) return null;
  if (session.paymentStatus !== 'paid') return null;
  const since = aloneSince(session, now);
  if (!since) return null;
  const grace = graceDeadline(session);
  const doctorEverCame = !!firstJoin(session, 'doctor');
  const from = doctorEverCame ? addMinutes(since, ALONE_REFUND_MINUTES) : since;
  return from > grace ? from : grace;
}

/** Who had come by the grace deadline ("joined at least once by then"). */
function classifyAtGrace(session) {
  const grace = graceDeadline(session).getTime();
  const doctor = firstJoin(session, 'doctor');
  const patient = firstJoin(session, 'patient');
  const doctorIn = !!doctor && doctor.getTime() <= grace;
  const patientIn = !!patient && patient.getTime() <= grace;
  if (doctorIn && patientIn) return GRACE.BOTH;
  if (doctorIn) return GRACE.PATIENT_ABSENT;
  if (patientIn) return GRACE.DOCTOR_ABSENT;
  return GRACE.NOBODY;
}

const result = (code, refund, doctorPaid, counter = null) => ({ code, refund, doctorPaid, counter });

/**
 * What a session that ran its course finally was.
 *
 * @returns {{ code: string, refund: 'full'|'none', doctorPaid: boolean, counter: 'late'|'no_show'|null }}
 *   `counter` is what to count against the doctor (shown to admins only).
 */
function finalOutcome(session) {
  const grace = graceDeadline(session).getTime();
  const doctor = firstJoin(session, 'doctor');
  const patient = firstJoin(session, 'patient');
  const doctorByGrace = !!doctor && doctor.getTime() <= grace;
  const patientByGrace = !!patient && patient.getTime() <= grace;
  const doctorLate = !!doctor && !doctorByGrace ? 'late' : null;

  if (doctor && patient) {
    if (everTogether(session)) return result(OUTCOME.COMPLETED, 'none', true, doctorLate);
    // They both came but never at the same time: decide by who was there
    // within the grace period.
    if (doctorByGrace && !patientByGrace) return result(OUTCOME.PATIENT_NO_SHOW, 'none', true);
    if (!doctorByGrace) return result(OUTCOME.DOCTOR_NO_SHOW, 'full', false, 'no_show');
    return result(OUTCOME.COMPLETED, 'none', true);
  }
  // The patient never came. If the doctor only came after the grace period
  // they were late too, but the session was still the patient's to miss.
  if (doctor) return result(OUTCOME.PATIENT_NO_SHOW, 'none', true, doctorLate);
  if (patient) return result(OUTCOME.DOCTOR_NO_SHOW, 'full', false, 'no_show');
  return result(OUTCOME.NOBODY_CAME, 'full', false, 'no_show');
}

module.exports = {
  OUTCOME,
  GRACE,
  intervals,
  firstJoin,
  isPresent,
  everTogether,
  graceDeadline,
  effectiveEndsAt,
  joinWindow,
  aloneSince,
  doctorAbsentRefundAt,
  doctorAbsentRefundAvailable,
  classifyAtGrace,
  finalOutcome
};
