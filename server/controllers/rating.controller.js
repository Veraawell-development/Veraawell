/**
 * Rating Controller
 * Handles session ratings — submission, retrieval, and doctor rating aggregation
 */

const Session = require('../models/session');
const DoctorProfile = require('../models/doctorProfile');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('RATING-CTRL');

/**
 * Recalculate and update a doctor's aggregated rating on their profile.
 * Called internally after a new rating is submitted.
 */
async function _recalculateDoctorRating(doctorId) {
  const sessions = await Session.find({ doctorId, 'rating.score': { $exists: true, $ne: null } });
  if (sessions.length === 0) return;

  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let total = 0;
  sessions.forEach(s => { total += s.rating.score; distribution[s.rating.score]++; });
  const average = parseFloat((total / sessions.length).toFixed(2));

  await DoctorProfile.findOneAndUpdate({ userId: doctorId }, { rating: { average, totalReviews: sessions.length, distribution } });
  logger.info('Doctor rating recalculated', { doctorId: doctorId.toString().substring(0, 8), average, totalReviews: sessions.length });
}

/** POST /api/ratings/:sessionId/rate — Submit a session rating */
const submitRating = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { score, review } = req.body;
  const patientId = req.user._id.toString();

  if (!score || score < 1 || score > 5) {
    return res.status(400).json({ success: false, message: 'Rating score must be between 1 and 5' });
  }

  const session = await Session.findById(sessionId);
  if (!session) throw new NotFoundError('Session');
  if (session.patientId.toString() !== patientId) throw new AuthorizationError('You can only rate your own sessions');
  if (session.status !== 'completed') {
    return res.status(400).json({ success: false, message: 'You can only rate completed sessions' });
  }
  if (session.rating && session.rating.score) {
    return res.status(400).json({ success: false, message: 'You have already rated this session' });
  }

  session.rating = { score: parseInt(score), review: review || '', ratedAt: new Date() };
  await session.save();
  await _recalculateDoctorRating(session.doctorId);

  logger.info('Rating submitted', { sessionId: sessionId.substring(0, 8), score });
  res.json({ success: true, message: 'Rating submitted successfully', rating: session.rating });
});

/** GET /api/ratings/doctor/:doctorId/ratings — Get ratings for a doctor */
const getDoctorRatings = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { limit = 10, skip = 0 } = req.query;

  const sessions = await Session.find({ doctorId, 'rating.score': { $exists: true, $ne: null } })
    .populate('patientId', 'firstName lastName')
    .sort({ 'rating.ratedAt': -1 })
    .limit(parseInt(limit))
    .skip(parseInt(skip))
    .select('rating sessionDate');

  const ratings = sessions.map(session => ({
    score: session.rating.score,
    review: session.rating.review,
    ratedAt: session.rating.ratedAt,
    sessionDate: session.sessionDate,
    patientName: session.patientId ? `${session.patientId.firstName.charAt(0)}***` : 'Anonymous'
  }));

  res.json({ success: true, ratings });
});

module.exports = { submitRating, getDoctorRatings };
