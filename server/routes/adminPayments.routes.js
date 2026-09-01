const express = require('express');
const router = express.Router();
const { verifyAdminToken } = require('../middleware/auth.middleware');
const { requireSuperAdmin } = require('../authz');
const { validateObjectIdParam } = require('../middleware/validation.middleware');
const adminPayments = require('../controllers/adminPayments.controller');

// Tiering note: reading payment state is an admin capability; CHANGING what
// the platform charges, or moving money, is a super-admin one. These four
// routes were gated on verifyAdminToken alone even though the controller
// comments above them said "super admin only" — so any admin account could
// alter the platform fee for every future booking, or issue refunds against
// real payments. The comments and the code now agree.

// ── Phase 2: Platform fee settings ───────────────────────────────────────────
router.get('/settings', verifyAdminToken, adminPayments.getPaymentSettings);
router.patch('/settings/fee', verifyAdminToken, requireSuperAdmin(), adminPayments.updatePlatformFee);
router.patch('/doctors/:doctorId/fee', verifyAdminToken, requireSuperAdmin(), validateObjectIdParam('doctorId'), adminPayments.updateDoctorFee);

// ── Phase 3: Payout onboarding approvals ────────────────────────────────────
router.get('/onboarding-requests', verifyAdminToken, adminPayments.getOnboardingRequests);
router.post('/onboarding-requests/:doctorId/approve', verifyAdminToken, validateObjectIdParam('doctorId'), adminPayments.approveOnboarding);
router.post('/onboarding-requests/:doctorId/reject', verifyAdminToken, validateObjectIdParam('doctorId'), adminPayments.rejectOnboarding);

// ── Phase 5: Admin refunds ────────────────────────────────────────────────────
router.post('/sessions/:sessionId/refund', verifyAdminToken, requireSuperAdmin(), validateObjectIdParam('sessionId'), adminPayments.adminRefundSession);
router.get('/sessions/failed-refunds', verifyAdminToken, adminPayments.getFailedRefunds);
router.post('/sessions/:sessionId/retry-refund', verifyAdminToken, requireSuperAdmin(), validateObjectIdParam('sessionId'), adminPayments.retryRefund);

// ── Phase 8: Revenue analytics ───────────────────────────────────────────────
router.get('/revenue', verifyAdminToken, adminPayments.getRevenueAnalytics);

module.exports = router;
