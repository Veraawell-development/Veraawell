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
 * True when a Session exists linking this doctor to this patient — i.e. the
 * patient has at some point booked with this doctor.
 *
 * Deliberately counts sessions in any state. A cancelled or abandoned booking
 * still means the two were clinically paired, and reports/notes attached to it
 * legitimately belong to that pair. Narrowing this to completed sessions would
 * hide a doctor's own notes from them the moment a follow-up was cancelled.
 */
async function hasTreatedRelationship(doctorId, patientId) {
  if (!doctorId || !patientId) return false;
  return !!(await Session.exists({ doctorId, patientId }));
}

module.exports = { hasTreatedRelationship };
