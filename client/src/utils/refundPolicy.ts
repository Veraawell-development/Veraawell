/**
 * Client-side mirror of server/services/refundPolicy.js's tiered cancellation
 * refund policy. Kept as a single small file so every component that needs to
 * preview a refund amount imports this instead of re-implementing the
 * thresholds — previously this exact >24h/4-24h/<4h calculation was
 * copy-pasted independently in SessionModal.tsx and PatientCalendarModal.tsx,
 * which meant a policy change would need to be found and updated in multiple
 * places (and the server) to stay in sync.
 */

export interface RefundPreview {
  amount: number;
  label: string;
  color: string;
}

export function calculateRefundPreview(price: number, sessionDateTime: Date): RefundPreview {
  const hoursUntil = (sessionDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntil > 24) {
    return { amount: price, label: '100% refund — full amount returned', color: '#10b981' };
  }
  if (hoursUntil > 4) {
    return { amount: Math.round(price * 0.5), label: '50% refund — cancelled within 24 hours', color: '#f59e0b' };
  }
  return { amount: 0, label: 'No refund — cancelled less than 4 hours before session', color: '#ef4444' };
}
