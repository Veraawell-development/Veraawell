const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Whole stars only. A fractional rating passed min/max, and then fell
  // outside every bucket of the star distribution — `distribution[4.5]++`
  // is NaN — so the doctor's breakdown stopped adding up to their total.
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    validate: { validator: Number.isInteger, message: 'Rating must be a whole number from 1 to 5' }
  },
  feedback: {
    type: String,
    required: true,
    trim: true
  },
  // What went well
  positives: {
    type: String,
    trim: true,
    default: ''
  },
  // Areas for improvement
  improvements: {
    type: String,
    trim: true,
    default: ''
  },
  // Would recommend to others
  wouldRecommend: {
    type: Boolean,
    default: true
  },
  // Review type - for doctor profile or platform landing page
  reviewType: {
    type: String,
    enum: ['doctor', 'platform'],
    required: true,
    default: 'doctor'
  },
  // Public display flags
  isPublic: {
    type: Boolean,
    default: false
  },
  approvedForDisplay: {
    type: Boolean,
    default: false
  },
  // Admin review status
  reviewStatus: {
    type: String,
    enum: ['pending', 'reviewed', 'flagged'],
    default: 'pending'
  },
  adminNotes: {
    type: String,
    trim: true,
    default: ''
  },
  // An admin's User id. This ref used to name an 'Admin' model that does not
  // exist (admins are Users with an admin role), so populating it threw
  // MissingSchemaError instead of returning the moderator.
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for faster queries
reviewSchema.index({ doctorId: 1, createdAt: -1 });
reviewSchema.index({ sessionId: 1 });
reviewSchema.index({ reviewStatus: 1 });
reviewSchema.index({ reviewType: 1, approvedForDisplay: 1 });
reviewSchema.index({ doctorId: 1, approvedForDisplay: 1 });

/**
 * What a review must satisfy before anyone outside its own parties and the
 * admins may see it — the public profile, the landing page, and every rating
 * aggregate shown beside them. The two review types answer differently.
 *
 * DOCTOR reviews are public by default and hidden by exception. One can only
 * be written by the patient of a completed session with that doctor, so it is
 * verified by construction; holding every one for an admin meant a patient's
 * review never appeared on the profile at all (found in end-to-end testing),
 * because nothing in the client moderates them. An admin can still take one
 * down: flagging it, or `approve` with `approved: false`, which stamps
 * `reviewedAt`. Rows written before this rule sit at approvedForDisplay:false
 * with no `reviewedAt` — never looked at, not rejected — so they count as
 * visible without a migration. publicDoctorReviewStages adds the
 * completed-session check.
 *
 * PLATFORM reviews stay moderated: they are landing-page testimonials, and
 * nothing ties their wording to a session. `approvedForDisplay` alone is not
 * proof a human approved one — submitReview used to set it on every platform
 * review at submission — but an admin approval always stamps `reviewedAt`, so
 * requiring both hides those self-approved rows without a migration.
 *
 * A flagged review of either type is never public. A function rather than a
 * shared constant because Mongoose casts query filters in place.
 */
function publicFilter(reviewType) {
  if (reviewType === 'platform') {
    return {
      reviewType: 'platform',
      approvedForDisplay: true,
      reviewStatus: { $ne: 'flagged' },
      reviewedAt: { $ne: null }
    };
  }
  return {
    reviewType: 'doctor',
    reviewStatus: { $ne: 'flagged' },
    $or: [{ approvedForDisplay: true }, { reviewedAt: null }]
  };
}
reviewSchema.statics.publicFilter = publicFilter;

/**
 * Aggregation stages selecting one doctor's public reviews: publicFilter, and
 * a session that really was completed. submitReview already refuses anything
 * else, but the legacy rows admitted above were never looked at, so the claim
 * "verified by construction" is checked rather than assumed.
 *
 * Shared by the public list and getDoctorStats so the reviews shown and the
 * rating printed above them can never disagree.
 */
function publicDoctorReviewStages(doctorId) {
  // Required here rather than at the top: it only registers the model, and
  // keeps this file loadable on its own.
  const Session = require('./session');
  return [
    { $match: { doctorId: new mongoose.Types.ObjectId(doctorId), ...publicFilter('doctor') } },
    { $lookup: { from: Session.collection.name, localField: 'sessionId', foreignField: '_id', as: '_session' } },
    { $match: { '_session.status': 'completed' } },
    { $project: { _session: 0 } }
  ];
}
reviewSchema.statics.publicDoctorReviewStages = publicDoctorReviewStages;

/**
 * A doctor's public rating summary — exactly the reviews their public profile
 * lists.
 *
 * It used to match on doctorId alone, so the published average included
 * flagged reviews, which moderation exists to take down, and platform
 * reviews, which also carry the session's doctorId but rate the product, not
 * the therapist.
 */
reviewSchema.statics.getDoctorStats = async function (doctorId) {
  const stats = await this.aggregate([
    ...publicDoctorReviewStages(doctorId),
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

  return stats.length > 0 ? stats[0] : {
    averageRating: 0,
    totalReviews: 0,
    fiveStars: 0,
    fourStars: 0,
    threeStars: 0,
    twoStars: 0,
    oneStar: 0,
    recommendCount: 0
  };
};

// Prevent duplicate reviews of the same type for same session
reviewSchema.index({ sessionId: 1, patientId: 1, reviewType: 1 }, { unique: true });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
