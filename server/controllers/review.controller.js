/**
 * Review Controller
 * Handles patient reviews for sessions and the platform
 * Includes public review display, doctor review stats, and admin moderation
 */

const Review = require('../models/review');
const Session = require('../models/session');
const User = require('../models/user');
const DoctorProfile = require('../models/doctorProfile');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('REVIEW-CTRL');

/** Recalculate a doctor's aggregated rating after a new doctor review */
async function _syncDoctorRating(doctorId) {
  const sessions = await Session.find({ doctorId, 'rating.score': { $exists: true, $ne: null } });
  if (!sessions.length) return;
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let total = 0;
  sessions.forEach(s => { total += s.rating.score; distribution[s.rating.score]++; });
  const average = parseFloat((total / sessions.length).toFixed(2));
  await DoctorProfile.findOneAndUpdate({ userId: doctorId }, { rating: { average, totalReviews: sessions.length, distribution } });
}

/** POST /api/reviews/submit — Submit a session review (Patient only) */
const submitReview = asyncHandler(async (req, res) => {
  const { sessionId, rating, feedback, positives, improvements, wouldRecommend, reviewType } = req.body;
  const patientId = req.user._id.toString();

  if (req.user.role !== 'patient') throw new AuthorizationError('Only patients can submit reviews');
  if (!sessionId || !rating || !feedback) return res.status(400).json({ success: false, message: 'Session ID, rating, and feedback are required' });
  // A non-numeric rating (e.g. the string "abc") used to slip past both
  // range checks below silently — "abc" < 1 and "abc" > 5 both evaluate to
  // false in JS, so neither branch rejected it, and it would have been
  // persisted as-is.
  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ success: false, message: 'Rating must be a number between 1 and 5' });
  }
  if (reviewType && !['doctor', 'platform'].includes(reviewType)) return res.status(400).json({ success: false, message: 'Review type must be either "doctor" or "platform"' });

  const session = await Session.findById(sessionId);
  if (!session) throw new NotFoundError('Session');
  if (session.status !== 'completed') return res.status(400).json({ success: false, message: 'Can only review completed sessions' });
  if (session.patientId.toString() !== patientId) throw new AuthorizationError('You can only review your own sessions');

  const existingReview = await Review.findOne({ sessionId, patientId, reviewType: reviewType || 'doctor' });
  if (existingReview) return res.status(400).json({ success: false, message: `You have already submitted a ${reviewType || 'doctor'} review for this session` });

  const effectiveType = reviewType || 'doctor';
  const review = new Review({
    sessionId, patientId, doctorId: session.doctorId, rating: numericRating, feedback,
    positives: positives || '', improvements: improvements || '',
    wouldRecommend: wouldRecommend !== undefined ? wouldRecommend : true,
    reviewType: effectiveType,
    approvedForDisplay: effectiveType === 'platform',
    isPublic: effectiveType === 'platform'
  });
  await review.save();

  if (effectiveType === 'doctor') {
    try {
      await Session.findByIdAndUpdate(sessionId, { rating: { score: numericRating, review: feedback, ratedAt: new Date() } });
      await _syncDoctorRating(session.doctorId);
    } catch (syncError) {
      logger.warn('Error syncing session rating after review', { error: syncError.message });
    }
  }

  logger.info('Review submitted', { sessionId: sessionId.substring(0, 8), reviewType: effectiveType });
  res.status(201).json({ success: true, message: 'Review submitted successfully', review });
});

/** GET /api/reviews/check/:sessionId — Check if session is already reviewed */
const checkReview = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const patientId = req.user._id.toString();
  const review = await Review.findOne({ sessionId, patientId });
  res.json({ success: true, hasReview: !!review, review: review || null });
});

/** GET /api/reviews/platform — Public platform reviews for landing page */
const getPlatformReviews = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const skip = parseInt(req.query.skip) || 0;
  const reviews = await Review.find({ reviewType: 'platform', approvedForDisplay: true }).populate('patientId', 'firstName lastName').sort({ createdAt: -1 }).limit(limit).skip(skip);
  const total = await Review.countDocuments({ reviewType: 'platform', approvedForDisplay: true });
  res.json({ success: true, reviews, total });
});

/** GET /api/reviews/doctor/:doctorId — Get reviews for a doctor profile */
const getDoctorReviews = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const skip = parseInt(req.query.skip) || 0;
  const includeAll = req.query.includeAll === 'true';
  const filter = { doctorId, reviewType: 'doctor' };
  if (!includeAll) filter.approvedForDisplay = true;
  const reviews = await Review.find(filter).populate('patientId', 'firstName lastName').sort({ createdAt: -1 }).limit(limit).skip(skip);
  const stats = await Review.getDoctorStats(doctorId);
  res.json({ success: true, reviews, stats, total: await Review.countDocuments(filter) });
});

/** GET /api/reviews/my-reviews — Doctor's own received reviews */
const getMyReviews = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can access this endpoint');
  const doctorId = req.user._id;
  const limit = parseInt(req.query.limit) || 20;
  const skip = parseInt(req.query.skip) || 0;
  const reviews = await Review.find({ doctorId, reviewType: 'doctor' }).populate('patientId', 'firstName lastName').populate('sessionId', 'sessionDate sessionTime').sort({ createdAt: -1 }).limit(limit).skip(skip);
  const stats = await Review.getDoctorStats(doctorId);
  const total = await Review.countDocuments({ doctorId, reviewType: 'doctor' });
  res.json({ success: true, reviews, stats, total, page: Math.floor(skip / limit) + 1, totalPages: Math.ceil(total / limit) });
});

// ==================== ADMIN ====================

/** GET /api/reviews/admin/all — All reviews with filters (Admin) */
const adminGetAllReviews = asyncHandler(async (req, res) => {
  const { status, doctorId, minRating, maxRating } = req.query;
  const limit = parseInt(req.query.limit) || 50;
  const skip = parseInt(req.query.skip) || 0;
  const filter = {};
  if (status) filter.reviewStatus = status;
  if (doctorId) filter.doctorId = doctorId;
  if (minRating) filter.rating = { ...filter.rating, $gte: parseInt(minRating) };
  if (maxRating) filter.rating = { ...filter.rating, $lte: parseInt(maxRating) };
  const reviews = await Review.find(filter).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email').populate('sessionId', 'sessionDate sessionTime').sort({ createdAt: -1 }).limit(limit).skip(skip);
  const total = await Review.countDocuments(filter);
  const stats = {
    total, pending: await Review.countDocuments({ reviewStatus: 'pending' }),
    reviewed: await Review.countDocuments({ reviewStatus: 'reviewed' }),
    flagged: await Review.countDocuments({ reviewStatus: 'flagged' }),
    averageRating: await Review.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' } } }]).then(r => r[0]?.avg || 0)
  };
  res.json({ success: true, reviews, stats, total, page: Math.floor(skip / limit) + 1, totalPages: Math.ceil(total / limit) });
});

/** GET /api/reviews/admin/doctor-performance — Doctor performance summary (Admin) */
const adminGetDoctorPerformance = asyncHandler(async (req, res) => {
  const doctors = await User.find({ role: 'doctor' }).select('firstName lastName email');
  const doctorIds = doctors.map(d => d._id);

  // Previously one Review.getDoctorStats() aggregation per doctor (N+1) —
  // fine at current scale, would not stay fine past ~1000 doctors. This is
  // the same aggregation, run once across all doctors and grouped by
  // doctorId, then merged with doctor info in memory.
  const statsRows = await Review.aggregate([
    { $match: { doctorId: { $in: doctorIds } } },
    {
      $group: {
        _id: '$doctorId',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        fiveStars: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        fourStars: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        threeStars: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        twoStars: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        oneStar: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        recommendCount: { $sum: { $cond: ['$wouldRecommend', 1, 0] } }
      }
    }
  ]);
  const statsByDoctor = new Map(statsRows.map(s => [s._id.toString(), s]));
  const emptyStats = { averageRating: 0, totalReviews: 0, fiveStars: 0, fourStars: 0, threeStars: 0, twoStars: 0, oneStar: 0, recommendCount: 0 };

  const performance = doctors.map(d => ({
    doctorId: d._id,
    doctorName: `${d.firstName} ${d.lastName}`,
    email: d.email,
    ...(statsByDoctor.get(d._id.toString()) || emptyStats)
  }));
  performance.sort((a, b) => b.averageRating - a.averageRating);
  res.json({ success: true, performance });
});

/** PATCH /api/reviews/admin/:reviewId/status — Update review status (Admin) */
const adminUpdateReviewStatus = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const { status, adminNotes } = req.body;
  if (!['pending', 'reviewed', 'flagged'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
  const review = await Review.findByIdAndUpdate(reviewId, { reviewStatus: status, adminNotes: adminNotes || '', reviewedBy: req.user._id, reviewedAt: new Date() }, { new: true });
  if (!review) throw new NotFoundError('Review');
  res.json({ success: true, message: 'Review status updated', review });
});

/** PATCH /api/reviews/admin/:reviewId/approve — Approve review for display (Admin) */
const adminApproveReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const { approved } = req.body;
  const review = await Review.findByIdAndUpdate(reviewId, { approvedForDisplay: approved, isPublic: approved, reviewedBy: req.user._id, reviewedAt: new Date() }, { new: true });
  if (!review) throw new NotFoundError('Review');
  res.json({ success: true, message: approved ? 'Review approved for display' : 'Review hidden from display', review });
});

module.exports = { submitReview, checkReview, getPlatformReviews, getDoctorReviews, getMyReviews, adminGetAllReviews, adminGetDoctorPerformance, adminUpdateReviewStatus, adminApproveReview };
