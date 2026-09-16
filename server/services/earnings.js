/**
 * What a doctor has earned — one definition, used everywhere.
 *
 * WHY THIS EXISTS
 *
 * There were three, and they disagreed:
 *
 *   session.controller.js  getStats        status 'completed' + paid
 *     — what the doctor sees on their dashboard. Excludes no-shows they
 *       attended, so a doctor who waited out a patient who never arrived was
 *       shown nothing for it.
 *
 *   adminPayments.controller.js  getRevenueAnalytics    paid, no status filter
 *     — what the admin sees. Counts sessions that HAVE NOT HAPPENED YET as
 *       revenue, so the figure includes money that may still be refunded.
 *
 *   session.controller.js  pendingPayout   completed + paid + no transfer id
 *     — keyed on `razorpayTransferId`, a Razorpay Route field that nothing
 *       will ever set now that Route is gone. It could only ever count up.
 *
 * A payout ledger would have been a fourth. That is the actual danger: a
 * doctor whose dashboard says ₹9,000 must be paid ₹9,000, or the first
 * disagreement becomes a support conversation about whether they were
 * underpaid — and nobody can answer it from the data.
 *
 * THE RULE
 *
 * A session is payable when the practitioner delivered it and the money is
 * still with the platform:
 *
 *   paymentStatus 'paid'   — captured, and not refunded / refund_pending /
 *                            refund_failed / failed / not_required. A refunded
 *                            session earns nothing; the patient has the money.
 *   status completed | no-show
 *   doctorJoined true      — the practitioner actually attended.
 *
 * `no-show` is payable on purpose. If the patient did not turn up, the
 * practitioner still reserved and attended the slot, so they earn it — the
 * patient is not refunded in that case either, so the money is there to pay.
 * The mirror case, where the DOCTOR did not attend, is excluded by
 * `doctorJoined` and is auto-refunded by the sweep anyway.
 */

const mongoose = require('mongoose');

/** Statuses in which the work was delivered. */
const DELIVERED_STATUSES = ['completed', 'no-show'];

/**
 * The payable predicate, as a Mongo filter fragment.
 *
 * @param {object} [opts]
 * @param {string|ObjectId} [opts.doctorId]  restrict to one doctor
 * @param {boolean} [opts.unpaidOnly]        only sessions not yet in a payout
 * @param {{from: Date, to: Date}} [opts.period]  half-open [from, to) on endsAt
 * @returns {object} a filter fragment, safe to spread into a query or $match
 */
function payableSessionMatch({ doctorId, unpaidOnly = false, period } = {}) {
  const match = {
    paymentStatus: 'paid',
    status: { $in: DELIVERED_STATUSES },
    doctorJoined: true
  };

  if (doctorId) {
    match.doctorId = typeof doctorId === 'string' ? new mongoose.Types.ObjectId(doctorId) : doctorId;
  }
  if (unpaidOnly) {
    match.payoutId = null;
  }
  if (period) {
    // Half-open [from, to) so consecutive weeks cannot both claim a session
    // that ends exactly on the boundary.
    //
    // Bounded on `endsAt`, not `createdAt`: a session booked in week 10 and
    // delivered in week 11 is earned in week 11. getRevenueAnalytics groups on
    // createdAt, which is why its weekly figures do not match a payout run.
    match.endsAt = { $gte: period.from, $lt: period.to };
  }

  return match;
}

module.exports = { payableSessionMatch, DELIVERED_STATUSES };
