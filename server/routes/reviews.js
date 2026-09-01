const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdminToken } = require('../middleware/auth.middleware');
const { validateObjectIdParam, validateObjectIdBody } = require('../middleware/validation.middleware');
const reviewController = require('../controllers/review.controller');

// Patient / Public
router.post('/submit', verifyToken, validateObjectIdBody('sessionId'), reviewController.submitReview);
router.get('/check/:sessionId', verifyToken, validateObjectIdParam('sessionId'), reviewController.checkReview);
router.get('/platform', reviewController.getPlatformReviews);
router.get('/doctor/:doctorId', validateObjectIdParam('doctorId'), reviewController.getDoctorReviews);
router.get('/my-reviews', verifyToken, reviewController.getMyReviews);

// Admin
router.get('/admin/all', verifyAdminToken, reviewController.adminGetAllReviews);
router.get('/admin/doctor-performance', verifyAdminToken, reviewController.adminGetDoctorPerformance);
router.patch('/admin/:reviewId/status', verifyAdminToken, validateObjectIdParam('reviewId'), reviewController.adminUpdateReviewStatus);
router.patch('/admin/:reviewId/approve', verifyAdminToken, validateObjectIdParam('reviewId'), reviewController.adminApproveReview);

module.exports = router;
