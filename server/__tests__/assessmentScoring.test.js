const { computeScore } = require('../utils/assessmentScoring');

function responses(...answers) {
  return answers.map((answer, i) => ({ questionId: i + 1, answer }));
}

describe('assessmentScoring.computeScore', () => {
  test('depression: minimal severity at low total', () => {
    // 9 questions, all answered 0 => total 0, well under the "mild" threshold of 5
    const result = computeScore('depression', responses(0, 0, 0, 0, 0, 0, 0, 0, 0));
    expect(result.total).toBe(0);
    expect(result.severity).toBe('minimal');
  });

  test('depression: severe severity at high total', () => {
    // 9 questions, all answered 3 (max) => total 27, well over the "severe" threshold of 20
    const result = computeScore('depression', responses(3, 3, 3, 3, 3, 3, 3, 3, 3));
    expect(result.total).toBe(27);
    expect(result.severity).toBe('severe');
  });

  test('depression: moderately-severe tier is reachable (tests the optional tier branch)', () => {
    const result = computeScore('depression', responses(3, 3, 3, 3, 3, 2, 0, 0, 0)); // total 17
    expect(result.total).toBe(17);
    expect(result.severity).toBe('moderately-severe');
  });

  test('anxiety: has no moderately-severe tier — severe kicks in directly at 15', () => {
    const result = computeScore('anxiety', responses(3, 3, 3, 3, 3)); // total 15
    expect(result.total).toBe(15);
    expect(result.severity).toBe('severe');
  });

  test('a client-supplied score that disagrees with the recomputed one is NOT what gets trusted', () => {
    // This is the actual regression case: even if the caller claims "minimal",
    // the server recomputes from raw responses and returns its own answer.
    const serverComputed = computeScore('depression', responses(3, 3, 3, 3, 3, 3, 3, 3, 3));
    const clientClaimed = { total: 0, severity: 'minimal', percentage: 0 };
    expect(serverComputed.severity).not.toBe(clientClaimed.severity);
    expect(serverComputed.total).not.toBe(clientClaimed.total);
  });

  test('unknown test type returns null (caller falls back to client scores)', () => {
    expect(computeScore('not-a-real-test', responses(1, 2, 3))).toBeNull();
  });

  test('dla20 is intentionally unverified and returns null', () => {
    expect(computeScore('dla20', responses(1, 2, 3))).toBeNull();
  });

  test('malformed responses (non-array) do not throw, total is 0', () => {
    expect(() => computeScore('depression', undefined)).not.toThrow();
    expect(computeScore('depression', undefined).total).toBe(0);
  });
});
