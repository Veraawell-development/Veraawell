/**
 * Assessment Controller
 * Handles mental health self-assessment tests — save, retrieve, and stats
 */

const mongoose = require('mongoose');
const MentalHealthAssessment = require('../models/mentalHealthAssessment');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');
const { computeScore } = require('../utils/assessmentScoring');

const logger = createLogger('ASSESSMENT-CTRL');

const VALID_TEST_TYPES = ['depression', 'anxiety', 'adhd', 'dla20', 'ptsd', 'addiction', 'social-anxiety', 'post-partum', 'bipolar', 'eating-disorder', 'gambling'];

/** POST /api/assessments — Save an assessment result */
const saveAssessment = asyncHandler(async (req, res) => {
  const { testType, responses, scores: clientScores } = req.body;
  const userId = req.user._id;

  if (!testType || !responses || !clientScores) return res.status(400).json({ success: false, message: 'Missing required fields: testType, responses, and scores are required' });
  if (!VALID_TEST_TYPES.includes(testType)) return res.status(400).json({ success: false, message: `Invalid test type. Valid types: ${VALID_TEST_TYPES.join(', ')}` });

  // Recompute severity/total/percentage server-side from the raw responses
  // instead of trusting the client-supplied scores verbatim — this is a
  // clinical value a doctor relies on, not just a UI label. Falls back to the
  // client-supplied scores only for test types not yet covered by the shared
  // scoring table (see assessmentScoring.js).
  const serverScores = computeScore(testType, responses);
  if (serverScores) {
    if (serverScores.severity !== clientScores.severity || serverScores.total !== clientScores.total) {
      logger.warn('Client/server assessment score mismatch — using server-computed value', {
        userId: userId.toString().substring(0, 8),
        testType,
        client: clientScores,
        server: serverScores
      });
    }
  }
  const scores = serverScores || clientScores;

  const assessment = new MentalHealthAssessment({ userId, testType, responses, scores, completedAt: new Date() });
  await assessment.save();

  logger.info('Assessment saved', { userId: userId.toString().substring(0, 8), testType });
  res.status(201).json({ success: true, message: 'Assessment saved successfully', assessment: { _id: assessment._id, testType: assessment.testType, scores: assessment.scores, completedAt: assessment.completedAt } });
});

/** GET /api/assessments — Get user's assessment history */
const getHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { testType } = req.query;
  const assessments = await MentalHealthAssessment.getUserHistory(userId, testType);
  res.json({ success: true, count: assessments.length, assessments });
});

/** GET /api/assessments/stats/summary — Summary stats for all test types */
const getSummaryStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;
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
  const assessment = await MentalHealthAssessment.getLatestResult(req.user._id, testType);
  if (!assessment) throw new NotFoundError('Assessment');
  res.json({ success: true, assessment });
});

/** GET /api/assessments/:id — Get a specific assessment by ID */
const getById = asyncHandler(async (req, res) => {
  const assessment = await MentalHealthAssessment.findOne({ _id: req.params.id, userId: req.user._id });
  if (!assessment) throw new NotFoundError('Assessment');
  const result = assessment.toObject();
  result.interpretation = assessment.getInterpretation();
  res.json({ success: true, assessment: result });
});

/** DELETE /api/assessments/:id — Delete an assessment */
const deleteAssessment = asyncHandler(async (req, res) => {
  const assessment = await MentalHealthAssessment.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!assessment) throw new NotFoundError('Assessment');
  logger.info('Assessment deleted', { assessmentId: req.params.id.substring(0, 8) });
  res.json({ success: true, message: 'Assessment deleted successfully' });
});

module.exports = { saveAssessment, getHistory, getSummaryStats, getLatest, getById, deleteAssessment };
