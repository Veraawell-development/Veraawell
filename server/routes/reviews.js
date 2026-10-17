const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdminToken } = require('../middleware/auth.middleware');
const { validateObjectIdParam, validateObjectIdBody } = require('../middleware/validation.middleware');
const { publicRoute, requireRole } = require('../authz');
const reviewController = require('../controllers/review.controller');

// Patient / Public
//
// The patient and doctor handlers are self-scoped by req.actor.id (submit also
// checks the session is the caller's own), so a role gate is the whole policy.
router.post('/submit', verifyToken, requireRole('patient'), validateObjectIdBody('sessionId'), reviewController.submitReview);
router.get('/check/:sessionId', verifyToken, requireRole('patient'), validateObjectIdParam('sessionId'), reviewController.checkReview);
router.get('/platform', publicRoute('moderated platform testimonials on the landing page'), reviewController.getPlatformReviews);
router.get('/doctor/:doctorId', publicRoute('moderated reviews on a public therapist profile'), validateObjectIdParam('doctorId'), reviewController.getDoctorReviews);
router.get('/my-reviews', verifyToken, requireRole('doctor'), reviewController.getMyReviews);

// Admin
router.get('/admin/all', verifyAdminToken, requireRole('admin', 'super_admin'), reviewController.adminGetAllReviews);
router.get('/admin/doctor-performance', verifyAdminToken, requireRole('admin', 'super_admin'), reviewController.adminGetDoctorPerformance);
router.patch('/admin/:reviewId/status', verifyAdminToken, requireRole('admin', 'super_admin'), validateObjectIdParam('reviewId'), reviewController.adminUpdateReviewStatus);
router.patch('/admin/:reviewId/approve', verifyAdminToken, requireRole('admin', 'super_admin'), validateObjectIdParam('reviewId'), reviewController.adminApproveReview);

module.exports = router;
