/**
 * What is counted against a doctor (docs/SESSION_RULES.md, D7).
 *
 * Counted, never acted on: no automatic penalty, warning email or ranking
 * change hangs off these numbers. They are shown to admins only (the
 * doctors list in the admin panel), and kept out of every public projection
 * by PUBLIC_DOCTOR_FIELDS in models/doctorProfile.js.
 *
 *   late     joined more than 10 minutes after the start (the patient may
 *            have left with a refund, or waited)
 *   no_show  never joined a session the patient came to, or nobody came
 *   cancel   cancelled a booked session, or let an instant request ring out
 *
 * Callers count once per decided outcome: each call site sits behind a
 * transition that only one request can win.
 */

const DoctorProfile = require('../models/doctorProfile');
const { createLogger } = require('../utils/logger');

const logger = createLogger('DOCTOR-COUNTERS');

const FIELD = Object.freeze({ late: 'lateCount', no_show: 'noShowCount', cancel: 'cancellationCount' });

/** The point at which repeated cancellations are logged for an admin's attention. */
const CANCELLATION_WARNING_AT = 3;

/**
 * Add one to a doctor's counter. Best effort: a counter failing to move must
 * never fail the refund or cancellation it is attached to.
 *
 * @param {string|ObjectId} doctorId  the doctor's User id
 * @param {'late'|'no_show'|'cancel'} kind
 */
async function increment(doctorId, kind, { now = new Date() } = {}) {
  const field = FIELD[kind];
  if (!field) throw new Error(`doctorCounters: unknown kind "${kind}"`);
  try {
    const update = { $inc: { [field]: 1 } };
    if (kind === 'cancel') update.$set = { lastCancellationDate: now };
    const profile = await DoctorProfile.findOneAndUpdate({ userId: doctorId }, update, { new: true })
      .select('cancellationCount cancellationWarningIssued')
      .lean();
    if (kind === 'cancel' && profile && profile.cancellationCount >= CANCELLATION_WARNING_AT && !profile.cancellationWarningIssued) {
      await DoctorProfile.updateOne({ userId: doctorId }, { $set: { cancellationWarningIssued: true } });
      logger.warn('Doctor has reached the cancellation warning count', {
        doctorId: String(doctorId).substring(0, 8),
        count: profile.cancellationCount
      });
    }
    return true;
  } catch (err) {
    logger.warn('Could not update a doctor counter', { doctorId: String(doctorId).substring(0, 8), kind, error: err.message });
    return false;
  }
}

module.exports = { increment, FIELD, CANCELLATION_WARNING_AT };
