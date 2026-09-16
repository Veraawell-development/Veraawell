const mongoose = require('mongoose');

/**
 * One document per weekly bank transfer to a practitioner.
 *
 * Money lands wholly in the platform's Razorpay account (there is no Razorpay
 * Route split — see resolveBookingPaymentState), so the doctor's share is
 * settled out of band and this collection is the record that it happened.
 * It is an accounting artefact: it must be reconcilable against a bank
 * statement, which is why `transferReference` (the UTR) is required to mark
 * one paid and why the bank details are snapshotted rather than referenced.
 *
 * THE MONEY IS WRITTEN ONCE, AT LOCK TIME, FROM THE SET ACTUALLY CLAIMED
 *
 * A `draft` payout carries no amounts at all. The sequence is: create the
 * ticket, claim sessions onto it with a compare-and-set, and only then sum
 * what it actually holds. The obvious order — aggregate, sum, create with
 * that sum, claim — overpays whenever a session is refunded between the sum
 * and the claim. Inverting it makes the total unfalsifiable by construction.
 */
const payoutSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // ── The period, as a half-open instant range [start, end) ────────────────
  //
  // Computed in PLATFORM_TIMEZONE. Monday 00:00 IST is Sunday 18:30 UTC, so
  // deriving these with UTC arithmetic misfiles every session in the
  // 00:00–05:30 IST band — the same class of error services/sessionTime.js
  // exists to eliminate. See services/payoutPeriod.js.
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  /** ISO week in the platform zone, e.g. '2026-W37'. The human handle. */
  periodKey: { type: String, required: true },
  /** The Tuesday this is due to be paid. */
  scheduledPayoutDate: { type: Date, required: true },

  status: {
    type: String,
    enum: ['draft', 'locked', 'paid'],
    default: 'draft',
    index: true
  },

  // ── Money. All zero until `locked`. ──────────────────────────────────────
  sessionCount: { type: Number, default: 0 },
  grossPrice: { type: Number, default: 0 },
  platformFeeTotal: { type: Number, default: 0 },
  /** Sum of session.doctorEarnings over the claimed set. */
  grossEarnings: { type: Number, default: 0 },
  /** Signed; negative when clawing back an overpayment. */
  adjustmentsTotal: { type: Number, default: 0 },
  /** max(0, grossEarnings + adjustmentsTotal). Never negative — you cannot bank-transfer a debt. */
  netPayable: { type: Number, default: 0 },
  /** The unpayable remainder, re-entered into the ledger as a fresh adjustment. */
  carriedForward: { type: Number, default: 0 },

  // ── Evidence the money moved. Only set on 'paid'. ────────────────────────
  paidAt: { type: Date, default: null },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  /** UTR / NEFT reference. Required to mark paid — this is the audit trail. */
  transferReference: { type: String, default: null },

  /**
   * The bank details as they were when this was paid.
   *
   * A doctor can change their account later; a receipt that silently
   * re-points at the new account is not a receipt. Only the last four digits
   * are kept — enough to reconcile, not enough to be worth leaking.
   */
  bankSnapshot: {
    accountHolderName: { type: String, default: null },
    accountNumberLast4: { type: String, default: null },
    ifsc: { type: String, default: null }
  },

  adminNote: { type: String, default: '' },
  lockedAt: { type: Date, default: null }
}, { timestamps: true });

/**
 * One payout per doctor per period. Two admins clicking "generate" at the
 * same moment cannot produce two documents that each claim half the week.
 */
payoutSchema.index({ doctorId: 1, periodKey: 1 }, { unique: true });
payoutSchema.index({ status: 1, scheduledPayoutDate: 1 });

module.exports = mongoose.model('Payout', payoutSchema);
