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
  // PHQ-9: items 1–9 are scored (0–27). Item 10 ("how difficult have these
  // problems made it…") is asked but never added — it is the PHQ-9's
  // functional question, and summing it inflated the band (max 30, not 27).
  depression: { maxScore: 27, unscored: [10], severityLevels: { minimal: { max: 4 }, mild: { min: 5, max: 9 }, moderate: { min: 10, max: 14 }, 'moderately-severe': { min: 15, max: 19 }, severe: { min: 20 } } },
  anxiety: { maxScore: 21, severityLevels: { minimal: { max: 4 }, mild: { min: 5, max: 9 }, moderate: { min: 10, max: 14 }, severe: { min: 15 } } },
  adhd: { maxScore: 79, severityLevels: { minimal: { max: 20 }, mild: { min: 21, max: 40 }, moderate: { min: 41, max: 60 }, severe: { min: 61 } } },
  // Q1 only asks whether the patient will answer the symptom questions; a
  // "yes" to it is not a symptom, so it is not counted (max 23, not 24).
  ptsd: { maxScore: 23, unscored: [1], severityLevels: { minimal: { max: 5 }, mild: { min: 6, max: 12 }, moderate: { min: 13, max: 18 }, severe: { min: 19 } } },
  // Q1 picks the area (alcohol / drugs / a behaviour); its value 0/1/2 used to
  // be added to the total. The three paths have 5, 3 and 2 yes/no questions,
  // so one fixed band table could never fit all of them — the best possible
  // result was "mild". Banded instead on the share of the chosen path's
  // questions answered "yes": none is minimal, under half mild, half or more
  // moderate, all of them severe.
  addiction: {
    maxScore: 5,
    unscored: [1],
    branchMax: { on: 1, max: { 0: 5, 1: 3, 2: 2 } },
    severityBy: 'percentage',
    severityLevels: { minimal: { max: 0 }, mild: { min: 1, max: 49 }, moderate: { min: 50, max: 99 }, severe: { min: 100 } }
  },
  'social-anxiety': { maxScore: 42, severityLevels: { minimal: { max: 8 }, mild: { min: 9, max: 18 }, moderate: { min: 19, max: 30 }, severe: { min: 31 } } },
  'post-partum': { maxScore: 30, severityLevels: { minimal: { max: 6 }, mild: { min: 7, max: 12 }, moderate: { min: 13, max: 18 }, severe: { min: 19 } } },
  bipolar: { maxScore: 24, severityLevels: { minimal: { max: 5 }, mild: { min: 6, max: 12 }, moderate: { min: 13, max: 18 }, severe: { min: 19 } } },
  gambling: { maxScore: 23, severityLevels: { minimal: { max: 4 }, mild: { min: 5, max: 10 }, moderate: { min: 11, max: 17 }, severe: { min: 18 } } },
  'eating-disorder': { maxScore: 5, severityLevels: { minimal: { max: 1 }, mild: { min: 2, max: 2 }, moderate: { min: 3, max: 4 }, severe: { min: 5 } } },
};

/**
 * Bumped whenever the scoring above changes, and stored on each result as
 * `testVersion`, so a result says which rules produced it (and
 * migrations/rescoreAssessments.js can bring older ones up to date).
 */
const SCORING_VERSION = '2.0';

/**
 * dla20 is intentionally excluded. It has a different structure, and the
 * client has no definition for it at all — MENTAL_HEALTH_TESTS holds ten tests
 * and the DLA-20 is not one of them, so no browser can administer it. Saves for
 * it used to fall back to storing the client-supplied score verbatim, which
 * made it the one test type whose clinical severity the caller simply chose.
 * POST /api/assessments now refuses it (see isScorable). Do not add it to the
 * generic table above without verifying its actual scoring rules first.
 */
const UNVERIFIED_TEST_TYPES = new Set(['dla20']);

/**
 * An own-property lookup. A bare `SCORING_TABLES[testType]` resolved
 * 'constructor', 'toString' and friends up the prototype chain to functions,
 * which passed the "is there a table?" check and then threw on the next line.
 */
const own = (obj, key) => (typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined);

/** Whether the server can score this test type itself. */
function isScorable(testType) {
  return !UNVERIFIED_TEST_TYPES.has(testType) && !!own(SCORING_TABLES, testType);
}

/**
 * @param {string} testType
 * @param {{questionId: number, answer: number}[]} responses
 * @returns {{total: number, severity: string, percentage: number} | null}
 *   null means "not covered by this table".
 *
 * A pure sum over whatever it is given (less the table's `unscored`
 * questions) — it does not range-check. That is
 * validateResponses' job, and it must run first on anything a client sent;
 * computeScore stays total so that client/src/__tests__/parity.test.ts can
 * compare the two scorers on arbitrary input.
 */
function computeScore(testType, responses) {
  if (UNVERIFIED_TEST_TYPES.has(testType)) return null;

  const table = own(SCORING_TABLES, testType);
  if (!table) return null;

  const list = Array.isArray(responses) ? responses : [];
  const unscored = table.unscored || [];
  const total = list
    .filter((r) => !unscored.includes(Number(r?.questionId)))
    .reduce((sum, r) => sum + (Number(r?.answer) || 0), 0);

  // The addiction test's paths differ in length, so its maximum depends on
  // the path chosen; an unknown path falls back to the table's maxScore.
  let maxScore = table.maxScore;
  if (table.branchMax) {
    const pick = list.find((r) => Number(r?.questionId) === table.branchMax.on);
    maxScore = (pick && own(table.branchMax.max, String(Number(pick.answer)))) || table.maxScore;
  }
  const percentage = Math.round((total / maxScore) * 100);

  const measure = table.severityBy === 'percentage' ? percentage : total;
  const levels = table.severityLevels;
  let severity = 'minimal';
  if (measure >= levels.severe.min) {
    severity = 'severe';
  } else if (levels['moderately-severe'] && measure >= levels['moderately-severe'].min) {
    severity = 'moderately-severe';
  } else if (measure >= levels.moderate.min) {
    severity = 'moderate';
  } else if (measure >= levels.mild.min) {
    severity = 'mild';
  }

  return { total, severity, percentage };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Answer validation                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const answersFor = (ids, values) => Object.fromEntries(ids.map((id) => [id, values]));

const FREQUENCY = [0, 1, 2, 3];
const YES_NO = [0, 1];
const FIVE_POINT = [0, 1, 2, 3, 4];

/**
 * Which questions each test asks, and the answer values each one can take.
 * Server-side mirror of the `questions`, `options`/`defaultOptions` and
 * `sections[].condition` of each test in client/src/data/mentalHealthTests.ts.
 *
 * Without it the server summed whatever `answer` values arrived: one answer of
 * 100000 to a single depression question stored 'severe' at 333333%, and an
 * empty-ish submission stored 'minimal'. A doctor reading the result could not
 * tell either from a real one. So the severity was still client-controlled,
 * just one step removed from the `scores` field the earlier fix stopped
 * trusting.
 *
 * `branchOn` / `branches` model a conditional section: the answer to question
 * `branchOn` decides which further questions apply (the addiction test asks
 * about alcohol, drugs or a behaviour depending on Q1).
 *
 * Keep in step with the client file, as for SCORING_TABLES above.
 */
const QUESTION_SETS = {
  depression: { questions: answersFor(range(1, 10), FREQUENCY) },
  anxiety: { questions: answersFor(range(1, 7), FREQUENCY) },
  adhd: { questions: { ...answersFor(range(1, 7), YES_NO), ...answersFor(range(8, 25), FIVE_POINT) } },
  // Q1 asks whether the patient will answer the symptom questions (10–24);
  // "no" ends the test after the past-experience questions (2–9).
  ptsd: {
    questions: answersFor(range(1, 24), YES_NO),
    always: range(1, 9),
    branchOn: 1,
    branches: { 0: [], 1: range(10, 24) }
  },
  addiction: {
    questions: { 1: [0, 1, 2], ...answersFor([2, 3, 4, 10, 11, 5, 6, 7, 8, 9], YES_NO) },
    always: [1],
    branchOn: 1,
    branches: { 0: [2, 3, 4, 10, 11], 1: [5, 6, 7], 2: [8, 9] }
  },
  'social-anxiety': { questions: { ...answersFor(range(1, 10), FIVE_POINT), ...answersFor([11, 12], YES_NO) } },
  'post-partum': { questions: answersFor(range(1, 10), FREQUENCY) },
  bipolar: { questions: { ...answersFor(range(1, 19), YES_NO), 20: FREQUENCY, ...answersFor([21, 22], YES_NO) } },
  gambling: { questions: answersFor(range(1, 23), YES_NO) },
  'eating-disorder': { questions: answersFor(range(1, 5), YES_NO) }
};

/** The question ids that apply, given the answers so far. */
function applicableQuestions(set, answerById) {
  if (!set.branches) return Object.keys(set.questions).map(Number);
  const branch = own(set.branches, String(answerById.get(set.branchOn))) || [];
  return [...set.always, ...branch];
}

/**
 * Check a submission against the test definition before it is scored.
 *
 * Every answer must be an integer from its question's own option values, no
 * question may be answered twice, and every question that applies must be
 * answered — so the stored total is one a patient could actually have reached.
 *
 * Answers to questions in a branch that does NOT apply are dropped rather than
 * refused. The client keeps every answer it has seen in one map, so a patient
 * who picks "alcohol", answers a question, goes Back and switches to "drugs"
 * submits the stale alcohol answer too. Refusing that would lose a genuine
 * result; scoring it would count a question the patient was never asked.
 *
 * @returns {{ responses: {questionId:number, answer:number}[] } | { error: string }}
 *   `responses` is what should be scored and stored.
 */
function validateResponses(testType, responses) {
  const set = isScorable(testType) ? own(QUESTION_SETS, testType) : undefined;
  if (!set) return { error: 'This assessment cannot be scored' };
  if (!Array.isArray(responses) || responses.length === 0) return { error: 'responses must be a non-empty array' };
  // No test has more than 25 questions; this only bounds the work below.
  if (responses.length > 100) return { error: 'Too many responses' };

  const answerById = new Map();
  for (const r of responses) {
    if (!r || typeof r !== 'object') return { error: 'Each response must be an object' };
    const { questionId, answer } = r;
    if (!Number.isInteger(questionId) || !Number.isInteger(answer)) {
      return { error: 'questionId and answer must be integers' };
    }
    const allowed = own(set.questions, String(questionId));
    if (!allowed) return { error: `Question ${questionId} is not part of this assessment` };
    if (!allowed.includes(answer)) return { error: `Answer ${answer} is not a valid option for question ${questionId}` };
    if (answerById.has(questionId)) return { error: `Question ${questionId} was answered more than once` };
    answerById.set(questionId, answer);
  }

  const applicable = applicableQuestions(set, answerById);
  const missing = applicable.filter((id) => !answerById.has(id));
  if (missing.length) return { error: `Missing answers for question(s) ${missing.join(', ')}` };

  const wanted = new Set(applicable);
  return {
    responses: responses
      .filter((r) => wanted.has(r.questionId))
      .map((r) => ({ questionId: r.questionId, answer: r.answer }))
  };
}

module.exports = { computeScore, validateResponses, isScorable, SCORING_TABLES, QUESTION_SETS, SCORING_VERSION };
