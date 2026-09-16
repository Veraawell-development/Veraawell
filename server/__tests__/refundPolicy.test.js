/**
 * Two tiers: full refund above 4 hours' notice, nothing at or below it, and a
 * doctor cancellation always refunds in full.
 *
 * There used to be a third, middle tier (>24h = 100%, 4-24h = 50%) that no
 * customer-facing page ever mentioned — RefundPolicyPage.tsx promises a full
 * refund from 4 hours out, so a patient cancelling the evening before was
 * shown "100%" and paid 50%. The code now matches the published policy, and
 * the boundary cases below are what stop the middle tier reappearing.
 */
const { calculateRefund, describeRefundPolicy } = require('../services/refundPolicy');

describe('refundPolicy.calculateRefund', () => {
  test('doctor cancellation is always a 100% refund, regardless of timing', () => {
    expect(calculateRefund(1000, 0.5, 'doctor')).toBe(1000);
    expect(calculateRefund(1000, 100, 'doctor')).toBe(1000);
  });

  test('patient cancelling well ahead gets a 100% refund', () => {
    expect(calculateRefund(1000, 25, 'patient')).toBe(1000);
    expect(calculateRefund(1000, 100, 'patient')).toBe(1000);
  });

  test('the old 4-24h window is now a FULL refund, not half', () => {
    // The specific regression this replaces: 10 hours' notice used to pay 500
    // on a 1000 session while the policy page said 100%.
    expect(calculateRefund(1000, 10, 'patient')).toBe(1000);
    expect(calculateRefund(999, 10, 'patient')).toBe(999);
    expect(calculateRefund(1000, 23.9, 'patient')).toBe(1000);
  });

  test('24h is no longer a boundary at all', () => {
    // Nothing may change across it: one tier spans the whole range above 4h.
    for (const hours of [23.99, 24, 24.01]) {
      expect(calculateRefund(1000, hours, 'patient')).toBe(1000);
    }
  });

  test('no notice period produces a partial refund', () => {
    // The structural property, not just the sampled points: with two tiers a
    // refund is either the whole price or nothing.
    for (let hours = 0; hours <= 72; hours += 0.25) {
      const amount = calculateRefund(1000, hours, 'patient');
      expect([0, 1000]).toContain(amount);
    }
  });

  test('patient cancelling less than 4h out gets no refund', () => {
    expect(calculateRefund(1000, 3.9, 'patient')).toBe(0);
    expect(calculateRefund(1000, 0, 'patient')).toBe(0);
  });

  test('boundary: exactly 4h is NOT the >4h tier', () => {
    expect(calculateRefund(1000, 4, 'patient')).toBe(0);
  });
});

describe('refundPolicy.describeRefundPolicy', () => {
  test('labels full refund correctly', () => {
    expect(describeRefundPolicy(1000, 1000)).toBe('100% refund');
  });

  test('labels zero refund correctly', () => {
    expect(describeRefundPolicy(0, 1000)).toBe('No refund (cancelled <4h before session)');
  });

  test('a partial amount is still labelled a full refund, and that is a known limitation', () => {
    // describeRefundPolicy only branches on "is it zero". With two tiers
    // nothing legitimately produces a partial amount, so this is unreachable
    // in practice — but if a future tier is added, this label lies rather
    // than throwing, and this test is where that shows up.
    expect(describeRefundPolicy(500, 1000)).toBe('100% refund');
  });
});
