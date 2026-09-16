/**
 * Single source of truth for the session cancellation refund policy.
 * Previously this calculation was independently reimplemented in
 * session.controller.js (cancelSession) and adminPayments.controller.js
 * (adminRefundSession, which didn't apply tiers at all — always refunded in
 * full regardless of cancellation timing). Both now call this module so the
 * policy can't drift between the patient-facing and admin-facing paths.
 *
 * TWO TIERS, NOT THREE
 *
 * There used to be a middle tier: >24h = 100%, 4-24h = 50%, <4h = 0%. It was
 * never published anywhere. The policy page the patient actually reads
 * (client/src/pages/RefundPolicyPage.tsx) says, in three separate places, that
 * a cancellation at least 4 hours ahead is refunded in FULL — "no questions
 * asked" — and that only inside 4 hours is non-refundable. The FAQ and the
 * therapist profile page said something different again (24 hours), and the
 * profile page's copy sits inside JSON-LD, so the wrong figure was being fed
 * to search engines too.
 *
 * So a patient cancelling the evening before — by far the most common case —
 * read "100% refund" and was paid 50%. Four published statements, no two
 * alike, and the code was the least generous of them.
 *
 * The code now matches the page. That is the direction the mismatch had to be
 * resolved: the page is the consumer commitment, Razorpay's compliance rules
 * require the published policy to match actual practice, and honouring what
 * you already promised is cheaper than explaining why you didn't.
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
  if (hoursUntil > 4) return price;   // >4h  → 100%, as the policy page states
  return 0;                           // <=4h → 0%, the therapist's time is reserved
}

function describeRefundPolicy(refundAmount, price) {
  if (refundAmount === 0) return 'No refund (cancelled <4h before session)';
  return '100% refund';
}

module.exports = { calculateRefund, describeRefundPolicy };
