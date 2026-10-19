/**
 * Relationship predicates shared by policies.
 *
 * "Is this doctor treating this patient?" is the check that distinguishes a
 * legitimate clinical read from a cross-tenant one. It existed inline in
 * exactly one place — session.controller.js getPatientEmergencyContact, which
 * does `Session.findOne({ doctorId: req.user._id, patientId })` before
 * releasing an emergency contact — and was missing everywhere else that needed
 * it. Most consequentially in sessionReport.controller.js, which accepted
 * `req.user.role !== 'doctor'` as sufficient and therefore let ANY approved
 * doctor read ANY patient's session reports.
 */

const Session = require('../models/session');

/**
 * True when this patient has actually booked this doctor: a session that was
 * paid for (or owed nothing), whatever happened to it after.
 *
 * Cancelled and refunded bookings still count — the two were clinically
 * paired, and notes or reports attached to them belong to that pair; narrowing
 * this to completed sessions would hide a doctor's own notes the moment a
 * follow-up was cancelled. A checkout that was never paid does NOT count: a
 * Session row exists from the moment checkout opens, so opening and closing
 * Razorpay used to hand that doctor the patient's emergency contact and
 * records. The same rule decides whether chat opens.
 */
async function hasTreatedRelationship(doctorId, patientId) {
  if (!doctorId || !patientId) return false;
  const { RELATIONSHIP_PAYMENT_STATES } = require('../services/chat.service');
  return !!(await Session.exists({ doctorId, patientId, paymentStatus: { $in: RELATIONSHIP_PAYMENT_STATES } }));
}

module.exports = { hasTreatedRelationship };
