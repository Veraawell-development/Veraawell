/**
 * Server-side mirror of client/src/data/mentalHealthTests.ts's scoring tables
 * and calculateTestScore() logic.
 *
 * Previously, POST /api/assessments accepted `scores: { total, severity,
 * percentage }` straight from the request body and persisted it verbatim —
 * the server never recomputed severity from the raw `responses`. A doctor
 * reading a patient's result was trusting a clinical severity label the
 * browser computed and handed over as an opaque string, with no server-side
 * check. For screening tools that function like PHQ-9/GAD-7-style
 * depression/anxiety/risk questionnaires, that's a real integrity gap, not a
 * cosmetic one.
 *
 * Keep this table in sync with the `scoring` block of each *_TEST export in
 * client/src/data/mentalHealthTests.ts if those thresholds ever change.
 */

const SCORING_TABLES = {
  depression: { maxScore: 30, severityLevels: { minimal: { max: 4 }, mild: { min: 5, max: 9 }, moderate: { min: 10, max: 14 }, 'moderately-severe': { min: 15, max: 19 }, severe: { min: 20 } } },
  anxiety: { maxScore: 21, severityLevels: { minimal: { max: 4 }, mild: { min: 5, max: 9 }, moderate: { min: 10, max: 14 }, severe: { min: 15 } } },
  adhd: { maxScore: 79, severityLevels: { minimal: { max: 20 }, mild: { min: 21, max: 40 }, moderate: { min: 41, max: 60 }, severe: { min: 61 } } },
  ptsd: { maxScore: 24, severityLevels: { minimal: { max: 5 }, mild: { min: 6, max: 12 }, moderate: { min: 13, max: 18 }, severe: { min: 19 } } },
  addiction: { maxScore: 10, severityLevels: { minimal: { max: 2 }, mild: { min: 3, max: 5 }, moderate: { min: 6, max: 8 }, severe: { min: 9 } } },
  'social-anxiety': { maxScore: 42, severityLevels: { minimal: { max: 8 }, mild: { min: 9, max: 18 }, moderate: { min: 19, max: 30 }, severe: { min: 31 } } },
  'post-partum': { maxScore: 30, severityLevels: { minimal: { max: 6 }, mild: { min: 7, max: 12 }, moderate: { min: 13, max: 18 }, severe: { min: 19 } } },
  bipolar: { maxScore: 24, severityLevels: { minimal: { max: 5 }, mild: { min: 6, max: 12 }, moderate: { min: 13, max: 18 }, severe: { min: 19 } } },
  gambling: { maxScore: 23, severityLevels: { minimal: { max: 4 }, mild: { min: 5, max: 10 }, moderate: { min: 11, max: 17 }, severe: { min: 18 } } },
  'eating-disorder': { maxScore: 5, severityLevels: { minimal: { max: 1 }, mild: { min: 2, max: 2 }, moderate: { min: 3, max: 4 }, severe: { min: 5 } } },
};

/**
 * dla20 is intentionally excluded: it's scored via a different flow (a
 * different max score / structure — see client/src/pages/MentalHealthTestPage.tsx
 * and the DLA-20-specific handling in PatientDashboard.tsx) that hasn't been
 * ported into this shared table. Requests for this test type still fall back
 * to trusting the client-supplied scores, same as before this fix — do not
 * silently assume it fits the generic table above without verifying its
 * actual scoring rules first.
 */
const UNVERIFIED_TEST_TYPES = new Set(['dla20']);

/**
 * @param {string} testType
 * @param {{questionId: number, answer: number}[]} responses
 * @returns {{total: number, severity: string, percentage: number} | null}
 *   null means "not covered by this table" — caller should fall back to the
 *   client-supplied scores for that test type only.
 */
function computeScore(testType, responses) {
  if (UNVERIFIED_TEST_TYPES.has(testType)) return null;

  const table = SCORING_TABLES[testType];
  if (!table) return null;

  const total = Array.isArray(responses)
    ? responses.reduce((sum, r) => sum + (Number(r?.answer) || 0), 0)
    : 0;
  const percentage = Math.round((total / table.maxScore) * 100);

  const levels = table.severityLevels;
  let severity = 'minimal';
  if (total >= levels.severe.min) {
    severity = 'severe';
  } else if (levels['moderately-severe'] && total >= levels['moderately-severe'].min) {
    severity = 'moderately-severe';
  } else if (total >= levels.moderate.min) {
    severity = 'moderate';
  } else if (total >= levels.mild.min) {
    severity = 'mild';
  }

  return { total, severity, percentage };
}

module.exports = { computeScore, SCORING_TABLES };
