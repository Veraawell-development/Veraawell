/**
 * When a self-assessment result should put crisis help in front of the
 * patient, not just a severity label.
 *
 * Two reasons, shown differently:
 *  - 'self-harm': any answer above 0 to a question about self-harm or being
 *    better off dead (PHQ-9 item 9, EPDS item 10) — whatever the total. A
 *    "mild" depression total can still carry "several days" on item 9.
 *  - 'severe': a severe or moderately severe result on any test.
 */
export type CrisisReason = 'self-harm' | 'severe' | null;

/** The self-harm question of each test that has one. */
export const SELF_HARM_ITEMS: Readonly<Record<string, number>> = {
  depression: 9,
  'post-partum': 10,
};

const SEVERE = new Set(['severe', 'moderately-severe']);

export function crisisReason(
  testType: string,
  severity: string | null | undefined,
  responses?: { questionId: number; answer: number }[] | null
): CrisisReason {
  const item = SELF_HARM_ITEMS[testType];
  if (item && (responses || []).some((r) => Number(r.questionId) === item && Number(r.answer) > 0)) return 'self-harm';
  if (severity && SEVERE.has(severity)) return 'severe';
  return null;
}
