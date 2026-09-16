const mongoose = require('mongoose');

/**
 * A signed correction to what a practitioner is owed, settled against a
 * future payout.
 *
 * WHY A SEPARATE COLLECTION RATHER THAN AN ARRAY ON `Payout`
 *
 * The commonest adjustment is a clawback: a session was paid out on Tuesday
 * and refunded on Thursday, so the platform is short the doctor's share of
 * it. Three properties make that impossible to embed:
 *
 *   1. It has no home when it is created. A refund handler writes it at an
 *      arbitrary moment, and the payout it belongs to — the NEXT one — does
 *      not exist yet. A row needs no parent.
 *   2. It does not belong to the payout that overpaid. That one is `paid` and
 *      immutable; it is a receipt for a transfer that really happened.
 *   3. Embedding on the destination would mean a webhook handler writing into
 *      a document that may be mid-lock. That is the largest blast radius in
 *      the design, for no benefit.
 *
 * DEBT THAT OUTLIVES A PAYOUT
 *
 * If a week's earnings do not cover the adjustments against them, the
 * shortfall is not written off and not held in a running-balance field.
 * Locking emits a fresh `carry_forward` row for the remainder, so next week's
 * rule is unchanged — net = earnings + unsettled adjustments — and the debt
 * follows the doctor across arbitrarily many weeks, each hop leaving a row
 * that names the payout it came from. A mutable balance counter would be a
 * read-modify-write on money with no audit trail.
 */
const payoutAdjustmentSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  /**
   * SIGNED. Negative reclaims from the doctor, positive credits them.
   *
   * One field rather than an amount plus a direction enum, so a caller
   * cannot write a positive clawback and quietly pay someone twice.
   */
  amount: { type: Number, required: true },

  kind: {
    type: String,
    enum: ['refund_clawback', 'carry_forward', 'manual_credit', 'manual_debit'],
    required: true
  },

  /** The refunded session, for `refund_clawback`. */
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
  /** The payout that overpaid, for `refund_clawback`. */
  originPayoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout', default: null },
  /** The payout whose remainder this is, for `carry_forward`. */
  sourcePayoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout', default: null },

  /**
   * The claim field, same idiom as Session.payoutId: null means outstanding,
   * set means it has been absorbed. Settled at LOCK time, not at generate —
   * otherwise an abandoned draft holds adjustments hostage against a payout
   * that never pays.
   */
  settledInPayoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout', default: null, index: true },
  settledAt: { type: Date, default: null },

  reason: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  /**
   * Exactly-once, by construction: `clawback:<sessionId>`, `carry:<payoutId>`.
   *
   * Four refund paths, a redelivered webhook and a reconciliation sweep all
   * race to write the same clawback. The unique index is what makes that
   * safe — not each caller remembering to check first. Callers catch E11000
   * and treat it as success, the same pattern razorpayWebhook already uses
   * for WebhookEvent.
   */
  idempotencyKey: { type: String, required: true }
}, { timestamps: true });

payoutAdjustmentSchema.index({ idempotencyKey: 1 }, { unique: true });
payoutAdjustmentSchema.index({ doctorId: 1, settledInPayoutId: 1 });

module.exports = mongoose.model('PayoutAdjustment', payoutAdjustmentSchema);
