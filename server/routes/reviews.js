const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdminToken } = require('../middleware/auth.middleware');
const reviewController = require('../controllers/review.controller');

// Patient / Public
router.post('/submit', verifyToken, reviewController.submitReview);
router.get('/check/:sessionId', verifyToken, reviewController.checkReview);
router.get('/platform', reviewController.getPlatformReviews);
router.get('/doctor/:doctorId', reviewController.getDoctorReviews);
router.get('/my-reviews', verifyToken, reviewController.getMyReviews);

// Admin
router.get('/admin/all', verifyAdminToken, reviewController.adminGetAllReviews);
router.get('/admin/doctor-performance', verifyAdminToken, reviewController.adminGetDoctorPerformance);
router.patch('/admin/:reviewId/status', verifyAdminToken, reviewController.adminUpdateReviewStatus);
router.patch('/admin/:reviewId/approve', verifyAdminToken, reviewController.adminApproveReview);

module.exports = router;
