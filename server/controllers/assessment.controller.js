/**
 * Assessment Controller
 * Handles mental health self-assessment tests — save, retrieve, and stats
 */

const mongoose = require('mongoose');
const MentalHealthAssessment = require('../models/mentalHealthAssessment');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');
const { computeScore, validateResponses, isScorable, SCORING_VERSION } = require('../utils/assessmentScoring');

const logger = createLogger('ASSESSMENT-CTRL');

// Every type a stored result may have — dla20 included, so history written
// before it was withdrawn can still be read. What may be SAVED is narrower:
// see isScorable below.
const VALID_TEST_TYPES = ['depression', 'anxiety', 'adhd', 'dla20', 'ptsd', 'addiction', 'social-anxiety', 'post-partum', 'bipolar', 'eating-disorder', 'gambling'];

/** POST /api/assessments — Save an assessment result */
const saveAssessment = asyncHandler(async (req, res) => {
  const { testType, responses, scores: clientScores } = req.body;
  const userId = req.actor.id;

  // `scores` is no longer required: it is never stored, only compared.
  if (!testType || !responses) return res.status(400).json({ success: false, message: 'Missing required fields: testType and responses are required' });
  if (!VALID_TEST_TYPES.includes(testType)) return res.status(400).json({ success: false, message: `Invalid test type. Valid types: ${VALID_TEST_TYPES.join(', ')}` });

  // dla20 used to be saved with whatever `scores` the client claimed, because
  // the server has no scoring table for it. No client can administer it (it
  // has no questions there), so the only way to reach that path was to send
  // a hand-written severity. Refused rather than trusted.
  if (!isScorable(testType)) return res.status(400).json({ success: false, message: 'This assessment is not currently offered' });

  // Every answer is checked against the test's own questions and options
  // before anything is summed. Recomputing the score server-side (below) was
  // not enough on its own while the answers themselves were unchecked: one
  // out-of-range answer chose the severity just as well as a forged `scores`.
  const checked = validateResponses(testType, responses);
  if (checked.error) return res.status(400).json({ success: false, message: checked.error });

  // Severity/total/percentage are computed here from the validated answers —
  // a clinical value a doctor relies on, not a UI label.
  const scores = computeScore(testType, checked.responses);
  if (clientScores && (scores.severity !== clientScores.severity || scores.total !== clientScores.total)) {
    logger.warn('Client/server assessment score mismatch — using server-computed value', {
      userId: userId.substring(0, 8),
      testType,
      client: { total: clientScores.total, severity: clientScores.severity },
      server: scores
    });
  }

  const assessment = new MentalHealthAssessment({ userId, testType, responses: checked.responses, scores, completedAt: new Date(), testVersion: SCORING_VERSION });
  await assessment.save();

  logger.info('Assessment saved', { userId: userId.toString().substring(0, 8), testType });
  res.status(201).json({ success: true, message: 'Assessment saved successfully', assessment: { _id: assessment._id, testType: assessment.testType, scores: assessment.scores, completedAt: assessment.completedAt } });
});

/** GET /api/assessments — Get user's assessment history */
const getHistory = asyncHandler(async (req, res) => {
  const userId = req.actor.id;
  // Only a known type string reaches the query; anything else means "all".
  const testType = VALID_TEST_TYPES.includes(req.query.testType) ? req.query.testType : null;
  const assessments = await MentalHealthAssessment.getUserHistory(userId, testType);
  res.json({ success: true, count: assessments.length, assessments });
});

/** GET /api/assessments/stats/summary — Summary stats for all test types */
const getSummaryStats = asyncHandler(async (req, res) => {
  const userId = req.actor.id;
  const stats = await MentalHealthAssessment.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $sort: { completedAt: 1 } },
    { $group: { _id: '$testType', count: { $sum: 1 }, latestScore: { $last: '$scores.total' }, latestSeverity: { $last: '$scores.severity' }, latestDate: { $last: '$completedAt' } } }
  ]);
  res.json({ success: true, stats });
});

/** GET /api/assessments/latest/:testType — Latest result for a specific test */
const getLatest = asyncHandler(async (req, res) => {
  const { testType } = req.params;
  if (!VALID_TEST_TYPES.includes(testType)) return res.status(400).json({ success: false, message: `Invalid test type` });
  const assessment = await MentalHealthAssessment.getLatestResult(req.actor.id, testType);
  if (!assessment) throw new NotFoundError('Assessment');
  res.json({ success: true, assessment });
});

/** GET /api/assessments/:id — Get a specific assessment by ID */
const getById = asyncHandler(async (req, res) => {
  const assessment = await MentalHealthAssessment.findOne({ _id: req.params.id, userId: req.actor.id });
  if (!assessment) throw new NotFoundError('Assessment');
  const result = assessment.toObject();
  result.interpretation = assessment.getInterpretation();
  res.json({ success: true, assessment: result });
});

/** DELETE /api/assessments/:id — Delete an assessment */
const deleteAssessment = asyncHandler(async (req, res) => {
  const assessment = await MentalHealthAssessment.findOneAndDelete({ _id: req.params.id, userId: req.actor.id });
  if (!assessment) throw new NotFoundError('Assessment');
  logger.info('Assessment deleted', { assessmentId: req.params.id.substring(0, 8) });
  res.json({ success: true, message: 'Assessment deleted successfully' });
});

module.exports = { saveAssessment, getHistory, getSummaryStats, getLatest, getById, deleteAssessment };
