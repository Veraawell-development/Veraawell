/**
 * Client-side mirror of server/services/refundPolicy.js. Kept as a single
 * small file so every component that previews a refund imports this rather
 * than re-implementing the thresholds — the calculation was previously
 * copy-pasted into SessionModal.tsx and PatientCalendarModal.tsx, so a policy
 * change had to be found in several places (and on the server) to stay in
 * sync.
 *
 * src/__tests__/parity.test.ts imports both this and the server module and
 * asserts they agree for every price/notice combination, so the two cannot
 * drift silently — changing one alone fails that suite.
 *
 * Two tiers, matching what RefundPolicyPage.tsx has always promised the
 * patient: full refund at more than 4 hours' notice, nothing inside 4 hours.
 * (There used to be an unpublished 50% band between 4 and 24 hours.)
 */

export interface RefundPreview {
  amount: number;
  label: string;
  color: string;
}

export function calculateRefundPreview(price: number, sessionDateTime: Date): RefundPreview {
  const hoursUntil = (sessionDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntil > 4) {
    return { amount: price, label: '100% refund — full amount returned', color: '#10b981' };
  }
  return { amount: 0, label: 'No refund — cancelled less than 4 hours before session', color: '#ef4444' };
}
