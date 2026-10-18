/**
 * Client-side rules for the weekly payout screen. The server enforces all of
 * them; these decide what the screen offers, so an admin is not handed a
 * button that can only fail.
 */

/** An ISO week key as the payout API names a period, e.g. '2026-W41'. */
export const PERIOD_KEY_PATTERN = /^\d{4}-W\d{2}$/;

export function isPeriodKey(value: string): boolean {
  return PERIOD_KEY_PATTERN.test(value.trim());
}

interface PayoutLike {
  status?: string;
  totalsComputedAt?: string | null;
}

/**
 * A lock that stopped half-way: the payout says 'locked' but its totals were
 * never computed, so there is no amount to pay yet. The lock endpoint resumes
 * it. Strictly `null` — rows locked before the field existed have no
 * `totalsComputedAt` at all and are complete.
 */
export function isInterruptedLock(payout: PayoutLike): boolean {
  return payout.status === 'locked' && payout.totalsComputedAt === null;
}

/** A payout whose amount is final and can be recorded as paid. */
export function isReadyToPay(payout: PayoutLike): boolean {
  return payout.status === 'locked' && !isInterruptedLock(payout);
}

/**
 * The transfer reference (UTR) is what a payout is reconciled against, so it
 * is required — except when nothing is being transferred.
 */
export function needsTransferReference(netPayable: number | null | undefined): boolean {
  return (netPayable ?? 0) > 0;
}

export function canMarkPaid(netPayable: number | null | undefined, transferReference: string): boolean {
  return !needsTransferReference(netPayable) || transferReference.trim().length > 0;
}
