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

/** `?limit=` / `?skip=` for a list, bounded so one request cannot ask for the table. */
function pageParams(query, defaultLimit, maxLimit) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  const skip = Math.max(parseInt(query.skip, 10) || 0, 0);
  return { limit, skip };
}

/**
 * The shape a review takes on an unauthenticated page.
 *
 * Both public list endpoints used to return the whole document with the
 * patient populated as `firstName lastName` — so anyone could read the full
 * name of a person in therapy, and with whom, next to their account id, the
 * moderator's private notes and the "areas for improvement" the patient wrote
 * for the doctor. The client only ever rendered a first name and a last
 * initial; the rest was published by accident.
 *
 * `patientId` keeps its object shape because every client renderer reads
 * `patientId.firstName` and `patientId.lastName.charAt(0)`. A deleted account
 * populates as null, which used to crash those renderers; it is "Anonymous".
 *
 * A review of a THERAPIST names nobody: it is "Verified patient". Even a
 * first name and an initial, next to a named therapist, can tell people who
 * know you that you are in therapy — and the review form now says plainly how
 * it will appear. Platform testimonials (landing page, admin-approved) keep
 * the first name and initial.
 */
const VERIFIED_PATIENT = { firstName: 'Verified patient', lastName: '' };
// What the form used to send for a star-only rating; shown as a quote.
const LEGACY_FILLER = 'No additional comments provided.';

function toPublicReview(review) {
  const patient = review.patientId;
  const first = patient && typeof patient.firstName === 'string' ? patient.firstName.trim() : '';
  const last = patient && typeof patient.lastName === 'string' ? patient.lastName.trim() : '';
  const feedback = typeof review.feedback === 'string' && review.feedback.trim() !== LEGACY_FILLER ? review.feedback : '';
  let shownAs;
  if (review.reviewType === 'platform') {
    shownAs = first ? { firstName: first, lastName: last ? last.charAt(0).toUpperCase() : '' } : { firstName: 'Anonymous', lastName: '' };
  } else {
    shownAs = VERIFIED_PATIENT;
  }
  return {
    _id: review._id,
    rating: review.rating,
    feedback,
    positives: review.positives,
    wouldRecommend: review.wouldRecommend,
    reviewType: review.reviewType,
    createdAt: review.createdAt,
    patientId: shownAs
  };
}

/**
 * Mirror a doctor's PUBLIC rating onto DoctorProfile.rating, which
 * GET /api/sessions/my-doctors hands to patients as stored.
 *
 * It used to be rebuilt from every Session.rating.score, so a review an admin
 * had flagged or hidden still moved the published number, and a fractional
 * score wrote NaN into the distribution. It is derived from
 * Review.getDoctorStats now — the same figure the profile page shows — and
 * re-run on submission and whenever moderation changes what is public.
 */
async function _syncDoctorRating(doctorId) {
  const s = await Review.getDoctorStats(doctorId);
  await DoctorProfile.updateOne({ userId: doctorId }, {
    $set: {
      rating: {
        average: Math.round((s.averageRating || 0) * 100) / 100,
        totalReviews: s.totalReviews,
        distribution: { 5: s.fiveStars, 4: s.fourStars, 3: s.threeStars, 2: s.twoStars, 1: s.oneStar }
      }
    }
  });
}

/** POST /api/reviews/submit — Submit a session review (Patient only) */
const submitReview = asyncHandler(async (req, res) => {
  const { sessionId, rating, feedback, positives, improvements, wouldRecommend, reviewType } = req.body;
  const patientId = req.actor.id;

  // requireRole('patient') is declared on the route. A comment is optional: a
  // star-only rating used to be sent with the filler "No additional comments
  // provided.", which then appeared on the therapist's profile as a quote.
  if (!sessionId || !rating) return res.status(400).json({ success: false, message: 'Session ID and rating are required' });
  // A non-numeric rating (e.g. the string "abc") used to slip past both
  // range checks below silently — "abc" < 1 and "abc" > 5 both evaluate to
  // false in JS, so neither branch rejected it, and it would have been
  // persisted as-is.
  //
  // It must also be a whole number. 4.5 passed the range check, and then
  // _syncDoctorRating's `distribution[4.5]++` wrote NaN into the doctor's
  // star breakdown. Booleans are refused outright: Number(true) is 1.
  const numericRating = typeof rating === 'number' || typeof rating === 'string' ? Number(rating) : NaN;
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ success: false, message: 'Rating must be a whole number from 1 to 5' });
  }
  if (feedback !== undefined && feedback !== null && typeof feedback !== 'string') return res.status(400).json({ success: false, message: 'Feedback must be text' });
  const comment = typeof feedback === 'string' ? feedback.trim() : '';
  if (comment.length > 2000) return res.status(400).json({ success: false, message: 'Please keep your comment under 2000 characters' });
  if (reviewType && !['doctor', 'platform'].includes(reviewType)) return res.status(400).json({ success: false, message: 'Review type must be either "doctor" or "platform"' });

  const session = await Session.findById(sessionId);
  if (!session) throw new NotFoundError('Session');
  if (session.status !== 'completed') return res.status(400).json({ success: false, message: 'Can only review completed sessions' });
  if (session.patientId.toString() !== patientId) throw new AuthorizationError('You can only review your own sessions');

  const existingReview = await Review.findOne({ sessionId, patientId, reviewType: reviewType || 'doctor' });
  if (existingReview) return res.status(400).json({ success: false, message: `You have already submitted a ${reviewType || 'doctor'} review for this session` });

  const effectiveType = reviewType || 'doctor';
  const review = new Review({
    sessionId, patientId, doctorId: session.doctorId, rating: numericRating, feedback: comment,
    positives: positives || '', improvements: improvements || '',
    wouldRecommend: wouldRecommend !== undefined ? wouldRecommend : true,
    reviewType: effectiveType,
    // A doctor review is the patient of a completed session rating that
    // session — verified by construction — so it is public on submission and
    // an admin can take it down (see Review.publicFilter). A platform review
    // is a landing-page testimonial and waits for an admin; it used to be
    // approved here and go straight onto the landing page, unread.
    approvedForDisplay: effectiveType === 'doctor',
    isPublic: effectiveType === 'doctor'
  });
  await review.save();

  if (effectiveType === 'doctor') {
    try {
      await Session.findByIdAndUpdate(sessionId, { rating: { score: numericRating, review: comment, ratedAt: new Date() } });
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
  const patientId = req.actor.id;
  // "Has the patient rated this session" means rated the therapist: a
  // platform review alone used to answer yes, hiding the therapist rating.
  const [review, platform] = await Promise.all([
    Review.findOne({ sessionId, patientId, reviewType: 'doctor' }),
    Review.exists({ sessionId, patientId, reviewType: 'platform' })
  ]);
  res.json({ success: true, hasReview: !!review, hasPlatformReview: !!platform, review: review || null });
});

/** GET /api/reviews/platform — Public platform reviews for landing page */
const getPlatformReviews = asyncHandler(async (req, res) => {
  const { limit, skip } = pageParams(req.query, 10, 50);
  const filter = Review.publicFilter('platform');
  const reviews = await Review.find(filter).populate('patientId', 'firstName lastName').sort({ createdAt: -1 }).limit(limit).skip(skip).lean();
  const total = await Review.countDocuments(filter);
  res.json({ success: true, reviews: reviews.map(toPublicReview), total });
});

/** GET /api/reviews/doctor/:doctorId — Get reviews for a doctor profile */
const getDoctorReviews = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { limit, skip } = pageParams(req.query, 10, 50);

  // This is an unauthenticated public endpoint, and it used to honour
  // `?includeAll=true` by dropping the moderation filter — so anyone could
  // read reviews that had been flagged or were still awaiting approval, which
  // is the entire point of holding them back. Verified: default returned 0
  // reviews, `?includeAll=true` returned the unapproved one.
  //
  // The parameter is ignored. Doctor reviews are now public by default, so
  // what it would reveal is the ones an admin took down. A doctor sees all of
  // their own at GET /api/reviews/my-reviews; admins at /api/reviews/admin/all.
  //
  // The same stages feed getDoctorStats, so the list and the rating above it
  // always count the same reviews.
  const [page] = await Review.aggregate([
    ...Review.publicDoctorReviewStages(doctorId),
    { $sort: { createdAt: -1, _id: -1 } },
    { $facet: { rows: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'n' }] } }
  ]);
  const reviews = await Review.populate(page.rows, { path: 'patientId', select: 'firstName lastName' });
  const stats = await Review.getDoctorStats(doctorId);
  const total = page.total.length ? page.total[0].n : 0;
  res.json({ success: true, reviews: reviews.map(toPublicReview), stats, total });
});

/** GET /api/reviews/my-reviews — Doctor's own received reviews */
const getMyReviews = asyncHandler(async (req, res) => {
  // requireRole('doctor') is declared on the route.
  const doctorId = req.actor.id;
  const { limit, skip } = pageParams(req.query, 20, 100);
  const reviews = await Review.find({ doctorId, reviewType: 'doctor' }).populate('patientId', 'firstName lastName').populate('sessionId', 'sessionDate sessionTime').sort({ createdAt: -1 }).limit(limit).skip(skip);
  const stats = await Review.getDoctorStats(doctorId);
  const total = await Review.countDocuments({ doctorId, reviewType: 'doctor' });
  res.json({ success: true, reviews, stats, total, page: Math.floor(skip / limit) + 1, totalPages: Math.ceil(total / limit) });
});

// ==================== ADMIN ====================

/** GET /api/reviews/admin/all — All reviews with filters (Admin) */
const adminGetAllReviews = asyncHandler(async (req, res) => {
  const { status, doctorId, minRating, maxRating, reviewType } = req.query;
  const { limit, skip } = pageParams(req.query, 50, 100);
  const filter = {};
  if (typeof status === 'string' && ['pending', 'reviewed', 'flagged'].includes(status)) filter.reviewStatus = status;
  if (typeof doctorId === 'string' && /^[0-9a-fA-F]{24}$/.test(doctorId)) filter.doctorId = doctorId;
  // Lets the moderation screen show testimonials awaiting approval apart
  // from doctor reviews, which are public on submission.
  if (typeof reviewType === 'string' && ['doctor', 'platform'].includes(reviewType)) filter.reviewType = reviewType;
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
    // The same reviews each public profile shows — this averaged in platform
    // testimonials and flagged reviews too, so the admin saw a different
    // rating from the one patients see.
    { $match: { doctorId: { $in: doctorIds }, ...Review.publicFilter('doctor') } },
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
  if (adminNotes !== undefined && typeof adminNotes !== 'string') return res.status(400).json({ success: false, message: 'Admin notes must be text' });
  // Notes are kept unless new ones are sent — changing a status used to wipe them.
  const update = { reviewStatus: status, reviewedBy: req.actor.id, reviewedAt: new Date() };
  if (adminNotes !== undefined) update.adminNotes = adminNotes;
  const review = await Review.findByIdAndUpdate(reviewId, update, { new: true });
  if (!review) throw new NotFoundError('Review');
  // Flagging (or un-flagging) changes what is public, so the stored rating follows.
  if (review.reviewType === 'doctor') await _syncDoctorRating(review.doctorId);
  res.json({ success: true, message: 'Review status updated', review });
});

/** PATCH /api/reviews/admin/:reviewId/approve — Approve review for display (Admin) */
const adminApproveReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const { approved } = req.body;
  // Anything but a real boolean is a malformed request, not a "no". An absent
  // `approved` used to be written through as undefined.
  if (typeof approved !== 'boolean') return res.status(400).json({ success: false, message: '`approved` must be true or false' });
  const review = await Review.findByIdAndUpdate(reviewId, { approvedForDisplay: approved, isPublic: approved, reviewedBy: req.actor.id, reviewedAt: new Date() }, { new: true });
  if (!review) throw new NotFoundError('Review');
  if (review.reviewType === 'doctor') await _syncDoctorRating(review.doctorId);
  res.json({ success: true, message: approved ? 'Review approved for display' : 'Review hidden from display', review });
});

module.exports = { submitReview, checkReview, getPlatformReviews, getDoctorReviews, getMyReviews, adminGetAllReviews, adminGetDoctorPerformance, adminUpdateReviewStatus, adminApproveReview };
