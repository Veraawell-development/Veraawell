/**
 * Live updates to the people a change concerns (the /data namespace, their
 * `user:<id>` rooms), in one place so every path that changes the same thing
 * says it the same way. The app (client/src/components/LiveUpdates.tsx)
 * refreshes the affected screens on each event.
 *
 * What used to go wrong without it: an admin refund cancelled a live session
 * and told nobody (both dashboards kept a Join button; a doctor's ring kept
 * ringing); `cancelledBy` was a user id in some events and 'patient' or
 * 'system' in others, so the wrong person got "your session was cancelled";
 * doctors coming online or going busy never reached the directory; a new
 * report or task reached the patient's screens only after a reload.
 *
 * All best effort: a missing io (tests, scripts) or an emit error never
 * fails the change itself.
 */

const SocketEmitter = require('../utils/socketEmitter');
const { createLogger } = require('../utils/logger');

const logger = createLogger('LIVE');

const idOf = (v) => (v && v._id ? String(v._id) : v ? String(v) : null);

function emit(io, fn) {
  if (!io) return;
  try { fn(new SocketEmitter(io)); } catch (err) { logger.warn('live update failed', { error: err.message }); }
}

/**
 * A session was cancelled (by a person, the system or an admin). Both
 * people's screens, and the call screen if it is open.
 * @param {'patient'|'doctor'|'system'|'admin'} byRole
 */
function sessionCancelled(io, session, { byRole, refundAmount = 0, message = null } = {}) {
  const payload = {
    sessionId: idOf(session),
    status: 'cancelled',
    byRole,
    // Same value: older app builds read `cancelledBy`.
    cancelledBy: byRole,
    refundAmount,
    message,
    timestamp: new Date()
  };
  emit(io, (e) => {
    e.emitToUsers([idOf(session.patientId), idOf(session.doctorId)].filter(Boolean), 'session:cancelled', payload);
    io.to(payload.sessionId).emit('session:cancelled', payload);
  });
  if (session.doctorId) doctorAvailability(io, session.doctorId);
}

/**
 * A booking was confirmed (paid, or nothing was owed). Both people's
 * dashboards; the doctor's ring for an instant request. Only what the screens
 * show — it used to be the whole document (fee split, payment ids, both
 * emails) to both people.
 */
function sessionBooked(io, session) {
  const person = (p) => (p && p._id ? { _id: String(p._id), firstName: p.firstName, lastName: p.lastName } : idOf(p));
  const dto = {
    _id: idOf(session),
    patientId: person(session.patientId),
    doctorId: person(session.doctorId),
    sessionType: session.sessionType,
    status: session.status,
    paymentStatus: session.paymentStatus,
    acceptanceStatus: session.acceptanceStatus,
    acceptanceDeadline: session.acceptanceDeadline || null,
    startsAt: session.startsAt || null,
    endsAt: session.endsAt || null,
    duration: session.duration,
    callMode: session.callMode,
    sessionDate: session.sessionDate,
    sessionTime: session.sessionTime,
    createdAt: session.createdAt
  };
  emit(io, (e) => e.emitToUsers([idOf(session.patientId), idOf(session.doctorId)], 'session:booked', {
    session: dto,
    sessionId: dto._id,
    patientId: idOf(session.patientId),
    doctorId: idOf(session.doctorId),
    // Carried explicitly so the doctor's countdown never has to guess.
    acceptanceDeadline: dto.acceptanceDeadline,
    timestamp: new Date()
  }));
  doctorAvailability(io, session.doctorId);
}

/**
 * Whether a doctor can be booked "now" may have changed (came online, went
 * offline, connected, disconnected, a session started or ended): patients'
 * directories re-check. Only the doctor id goes out.
 */
function doctorAvailability(io, doctorId) {
  emit(io, (e) => e.emitToRole('patient', 'doctor:availability', { doctorId: idOf(doctorId) }));
}

/** A report or task concerning this person was added or changed. */
function clinicalUpdated(io, userId, kind) {
  emit(io, (e) => e.emitToUser(idOf(userId), 'clinical:updated', { kind }));
}

/** A doctor's payout or bank-details status changed. */
function payoutUpdated(io, doctorId, status = null) {
  emit(io, (e) => e.emitToUser(idOf(doctorId), 'payout:updated', { status }));
}

module.exports = { sessionBooked, sessionCancelled, doctorAvailability, clinicalUpdated, payoutUpdated };
