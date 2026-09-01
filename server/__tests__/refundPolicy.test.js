const { calculateRefund, describeRefundPolicy } = require('../services/refundPolicy');

describe('refundPolicy.calculateRefund', () => {
  test('doctor cancellation is always a 100% refund, regardless of timing', () => {
    expect(calculateRefund(1000, 0.5, 'doctor')).toBe(1000);
    expect(calculateRefund(1000, 100, 'doctor')).toBe(1000);
  });

  test('patient cancelling more than 24h out gets a 100% refund', () => {
    expect(calculateRefund(1000, 25, 'patient')).toBe(1000);
  });

  test('patient cancelling 4-24h out gets a 50% refund', () => {
    expect(calculateRefund(1000, 10, 'patient')).toBe(500);
    // rounds to nearest integer
    expect(calculateRefund(999, 10, 'patient')).toBe(500);
  });

  test('patient cancelling less than 4h out gets no refund', () => {
    expect(calculateRefund(1000, 3.9, 'patient')).toBe(0);
    expect(calculateRefund(1000, 0, 'patient')).toBe(0);
  });

  test('boundary: exactly 24h is NOT the >24h tier (matches the original ">" comparison)', () => {
    expect(calculateRefund(1000, 24, 'patient')).toBe(500);
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

  test('labels partial refund correctly', () => {
    expect(describeRefundPolicy(500, 1000)).toBe('50% refund (cancelled 4-24h before session)');
  });
});
