/**
 * Payment mode resolution.
 *
 * Why this exists: there were three independent code paths that could produce
 * a session with paymentStatus 'paid' and a fabricated `mock_payment_<ts>`
 * id without a rupee being collected —
 *
 *   1. bookSession: `if (doctorProfile.razorpayAccountId)` — a doctor with no
 *      payout account skipped order creation entirely and fell through to
 *      'paid'. Most doctors reach that state because approveOnboarding writes
 *      a fake `acc_mock_...` id whenever the Razorpay SDK errors.
 *   2. bookSession: order creation threw, was caught, logged at warn, and
 *      execution fell through to 'paid'.
 *   3. bookImmediate: identical to (2).
 *
 * The common cause is a silent downgrade from "charge the patient" to
 * "pretend we did". This module makes that downgrade an explicit, opt-in,
 * production-forbidden mode instead of an accident:
 *
 *   - PAYMENTS_MODE defaults to 'live'. Nothing downgrades implicitly.
 *   - 'stub' must be requested explicitly and is refused in production.
 *   - Stub bookings are 'not_required', never 'paid'. Nothing was charged, so
 *     claiming it was paid is a lie that later makes a refund fabricable.
 */

const { isProduction } = require('./environment');

const MODE = process.env.PAYMENTS_MODE === 'stub' ? 'stub' : 'live';

// Every prefix that has ever been used to denote "this id did not come from a
// payment gateway". Kept in one place so an invariant check can assert that a
// 'paid' session never carries one of them.
const SYNTHETIC_PAYMENT_PREFIXES = ['mock_', 'mock_payment_', 'immediate_', 'stub_'];

function isSyntheticPaymentId(id) {
  return typeof id === 'string' && SYNTHETIC_PAYMENT_PREFIXES.some((p) => id.startsWith(p));
}

/** `acc_mock_...` ids are fabricated by approveOnboarding's error fallback. */
function isSyntheticAccountId(id) {
  return typeof id === 'string' && id.startsWith('acc_mock');
}

function isStubMode() {
  return MODE === 'stub';
}

function getMode() {
  return MODE;
}

/**
 * Called from validateEnvironment(). Refuses to boot on an unsafe combination
 * rather than discovering it at the first booking attempt.
 */
function assertPaymentsConfigured() {
  if (isProduction() && MODE === 'stub') {
    throw new Error('PAYMENTS_MODE=stub is forbidden in production — it would create paid sessions with no payment');
  }
  if (MODE === 'live') {
    const missing = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']
      .filter((k) => !process.env[k]);
    // In development the required-vars list does not cover these, so a
    // developer without Razorpay credentials gets an actionable message
    // pointing at PAYMENTS_MODE=stub instead of an SDK constructor error.
    if (missing.length > 0 && isProduction()) {
      throw new Error(`Missing ${missing.join(', ')} with PAYMENTS_MODE=live`);
    }
    return { ok: missing.length === 0, missing };
  }
  return { ok: true, missing: [] };
}

module.exports = {
  getMode,
  isStubMode,
  isSyntheticPaymentId,
  isSyntheticAccountId,
  assertPaymentsConfigured,
  SYNTHETIC_PAYMENT_PREFIXES
};
