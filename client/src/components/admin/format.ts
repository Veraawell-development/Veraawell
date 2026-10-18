/** Rupees for display, Indian digit grouping: ₹ 1,23,456. */
export const formatINR = (amount: number | null | undefined): string =>
  `₹ ${Number(amount || 0).toLocaleString('en-IN')}`;
