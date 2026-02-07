const express = require('express');
const router = express.Router();
const Review = require('../models/review');
const Session = require('../models/session');
const User = require('../models/user');
const { verifyToken } = require('../middleware/auth.middleware');

// Admin verification middleware
const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Submit review for a session (Patient only)
router.post('/submit', verifyToken, async (req, res) => {
  try {
    const { sessionId, rating, feedback, positives, improvements, wouldRecommend, reviewType } = req.body;
    const patientId = req.user._id.toString();

    console.log('[REVIEW] Submit request:', { sessionId, patientId, rating, reviewType });

    // Validate patient role
    if (req.user.role !== 'patient') {
      return res.status(403).json({ message: 'Only patients can submit reviews' });
    }

    // Validate required fields
    if (!sessionId || !rating || !feedback) {
      return res.status(400).json({ message: 'Session ID, rating, and feedback are required' });
    }

    // Validate rating range
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    // Validate reviewType
    if (reviewType && !['doctor', 'platform'].includes(reviewType)) {
      return res.status(400).json({ message: 'Review type must be either "doctor" or "platform"' });
    }

    // Check if session exists and is completed
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.status !== 'completed') {
      return res.status(400).json({ message: 'Can only review completed sessions' });
    }

    // Verify patient owns this session
    if (session.patientId.toString() !== patientId) {
      return res.status(403).json({ message: 'You can only review your own sessions' });
    }

    // Check if review already exists
    const existingReview = await Review.findOne({ sessionId, patientId });
    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this session' });
    }

    // Create review
    const review = new Review({
      sessionId,
      patientId,
      doctorId: session.doctorId,
      rating,
      feedback,
      positives: positives || '',
      improvements: improvements || '',
      wouldRecommend: wouldRecommend !== undefined ? wouldRecommend : true,
      reviewType: reviewType || 'doctor',
      // Auto-approve platform reviews for landing page display
      // Doctor reviews still require admin approval
      approvedForDisplay: (reviewType || 'doctor') === 'platform',
      isPublic: (reviewType || 'doctor') === 'platform'
    });

    await review.save();

    console.log('[REVIEW] Review submitted successfully');

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      review
    });
  } catch (error) {
    console.error('[REVIEW] Error submitting review:', error);
    res.status(500).json({ message: 'Failed to submit review', error: error.message });
  }
});

// Check if session has been reviewed
router.get('/check/:sessionId', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const patientId = req.user._id.toString();

    const review = await Review.findOne({ sessionId, patientId });

    res.json({
      hasReview: !!review,
      review: review || null
    });
  } catch (error) {
    console.error('[REVIEW] Error checking review:', error);
    res.status(500).json({ message: 'Failed to check review status' });
  }
});

// Get platform reviews for landing page (public)
router.get('/platform', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const skip = parseInt(req.query.skip) || 0;

    const reviews = await Review.find({
      reviewType: 'platform',
      approvedForDisplay: true
    })
      .populate('patientId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Review.countDocuments({
      reviewType: 'platform',
      approvedForDisplay: true
    });

    res.json({
      reviews,
      total
    });
  } catch (error) {
    console.error('[REVIEW] Error fetching platform reviews:', error);
    res.status(500).json({ message: 'Failed to fetch platform reviews' });
  }
});

// Get reviews for a doctor (for display on profile)
router.get('/doctor/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const skip = parseInt(req.query.skip) || 0;
    const includeAll = req.query.includeAll === 'true'; // For doctor's own view

    const filter = {
      doctorId,
      reviewType: 'doctor'
    };

    // Only show approved reviews for public view
    if (!includeAll) {
      filter.approvedForDisplay = true;
    }

    const reviews = await Review.find(filter)
      .populate('patientId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const stats = await Review.getDoctorStats(doctorId);

    res.json({
      reviews,
      stats,
      total: await Review.countDocuments(filter)
    });
  } catch (error) {
    console.error('[REVIEW] Error fetching doctor reviews:', error);
    res.status(500).json({ message: 'Failed to fetch reviews' });
  }
});

// Get all reviews for admin (with filters)
router.get('/admin/all', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { status, doctorId, minRating, maxRating } = req.query;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    const filter = {};
    if (status) filter.reviewStatus = status;
    if (doctorId) filter.doctorId = doctorId;
    if (minRating) filter.rating = { ...filter.rating, $gte: parseInt(minRating) };
    if (maxRating) filter.rating = { ...filter.rating, $lte: parseInt(maxRating) };

    const reviews = await Review.find(filter)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email')
      .populate('sessionId', 'sessionDate sessionTime')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Review.countDocuments(filter);

    // Get statistics
    const stats = {
      total,
      pending: await Review.countDocuments({ reviewStatus: 'pending' }),
      reviewed: await Review.countDocuments({ reviewStatus: 'reviewed' }),
      flagged: await Review.countDocuments({ reviewStatus: 'flagged' }),
      averageRating: await Review.aggregate([
        { $group: { _id: null, avg: { $avg: '$rating' } } }
      ]).then(result => result[0]?.avg || 0)
    };

    res.json({
      reviews,
      stats,
      total,
      page: Math.floor(skip / limit) + 1,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('[REVIEW] Error fetching admin reviews:', error);
    res.status(500).json({ message: 'Failed to fetch reviews' });
  }
});

// Get doctor performance summary for admin
router.get('/admin/doctor-performance', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const doctors = await User.find({ role: 'doctor' }).select('firstName lastName email');

    const performance = await Promise.all(
      doctors.map(async (doctor) => {
        const stats = await Review.getDoctorStats(doctor._id);
        return {
          doctorId: doctor._id,
          doctorName: `${doctor.firstName} ${doctor.lastName}`,
          email: doctor.email,
          ...stats
        };
      })
    );

    // Sort by average rating descending
    performance.sort((a, b) => b.averageRating - a.averageRating);

    res.json(performance);
  } catch (error) {
    console.error('[REVIEW] Error fetching doctor performance:', error);
    res.status(500).json({ message: 'Failed to fetch doctor performance' });
  }
});

// Update review status (Admin only)
router.patch('/admin/:reviewId/status', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { status, adminNotes } = req.body;

    if (!['pending', 'reviewed', 'flagged'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const review = await Review.findByIdAndUpdate(
      reviewId,
      {
        reviewStatus: status,
        adminNotes: adminNotes || '',
        reviewedBy: req.user._id,
        reviewedAt: new Date()
      },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    res.json({
      success: true,
      message: 'Review status updated',
      review
    });
  } catch (error) {
    console.error('[REVIEW] Error updating review status:', error);
    res.status(500).json({ message: 'Failed to update review status' });
  }
});

// Approve review for public display (Admin only)
router.patch('/admin/:reviewId/approve', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { approved } = req.body; // true or false

    const review = await Review.findByIdAndUpdate(
      reviewId,
      {
        approvedForDisplay: approved,
        isPublic: approved,
        reviewedBy: req.user._id,
        reviewedAt: new Date()
      },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    res.json({
      success: true,
      message: approved ? 'Review approved for display' : 'Review hidden from display',
      review
    });
  } catch (error) {
    console.error('[REVIEW] Error approving review:', error);
    res.status(500).json({ message: 'Failed to approve review' });
  }
});

// Get doctor's own reviews (all reviews for their sessions)
router.get('/my-reviews', verifyToken, async (req, res) => {
  try {
    const doctorId = req.user._id;
    const limit = parseInt(req.query.limit) || 20;
    const skip = parseInt(req.query.skip) || 0;

    // Verify user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can access this endpoint' });
    }

    const reviews = await Review.find({
      doctorId,
      reviewType: 'doctor' // Only show doctor-specific reviews
    })
      .populate('patientId', 'firstName lastName')
      .populate('sessionId', 'sessionDate sessionTime')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const stats = await Review.getDoctorStats(doctorId);

    const total = await Review.countDocuments({
      doctorId,
      reviewType: 'doctor'
    });

    res.json({
      reviews,
      stats,
      total,
      page: Math.floor(skip / limit) + 1,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('[REVIEW] Error fetching doctor reviews:', error);
    res.status(500).json({ message: 'Failed to fetch reviews' });
  }
});

module.exports = router;
