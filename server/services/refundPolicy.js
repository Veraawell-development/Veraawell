/**
 * Single source of truth for the session cancellation refund policy.
 * Previously this calculation was independently reimplemented in
 * session.controller.js (cancelSession) and adminPayments.controller.js
 * (adminRefundSession, which didn't apply tiers at all — always refunded in
 * full regardless of cancellation timing). Both now call this module so the
 * policy can't drift between the patient-facing and admin-facing paths.
 */

/**
 * @param {number} price - session price
 * @param {number} hoursUntil - hours between now and the scheduled session start
 * @param {'doctor'|'patient'} cancellerRole
 * @returns {number} refund amount, in the same currency unit as `price`
 */
function calculateRefund(price, hoursUntil, cancellerRole) {
  if (cancellerRole === 'doctor') {
    return price; // Doctor cancels → 100% refund always
  }
  if (hoursUntil > 24) return price;                    // >24h → 100%
  if (hoursUntil > 4) return Math.round(price * 0.5);    // 4-24h → 50%
  return 0;                                              // <4h → 0%
}

function describeRefundPolicy(refundAmount, price) {
  if (refundAmount === price) return '100% refund';
  if (refundAmount === 0) return 'No refund (cancelled <4h before session)';
  return '50% refund (cancelled 4-24h before session)';
}

module.exports = { calculateRefund, describeRefundPolicy };
