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
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
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
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
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

// Static method to calculate doctor's average rating
reviewSchema.statics.getDoctorStats = async function(doctorId) {
  const stats = await this.aggregate([
    { $match: { doctorId: mongoose.Types.ObjectId(doctorId) } },
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

// Prevent duplicate reviews for same session
reviewSchema.index({ sessionId: 1, patientId: 1 }, { unique: true });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
