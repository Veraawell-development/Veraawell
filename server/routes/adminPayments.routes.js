const express = require('express');
const router = express.Router();
const { verifyAdminToken } = require('../middleware/auth.middleware');
const adminPayments = require('../controllers/adminPayments.controller');

// ── Phase 2: Platform fee settings ───────────────────────────────────────────
router.get('/settings', verifyAdminToken, adminPayments.getPaymentSettings);
router.patch('/settings/fee', verifyAdminToken, adminPayments.updatePlatformFee);
router.patch('/doctors/:doctorId/fee', verifyAdminToken, adminPayments.updateDoctorFee);

// ── Phase 3: Payout onboarding approvals ────────────────────────────────────
router.get('/onboarding-requests', verifyAdminToken, adminPayments.getOnboardingRequests);
router.post('/onboarding-requests/:doctorId/approve', verifyAdminToken, adminPayments.approveOnboarding);
router.post('/onboarding-requests/:doctorId/reject', verifyAdminToken, adminPayments.rejectOnboarding);

// ── Phase 5: Admin refunds ────────────────────────────────────────────────────
router.post('/sessions/:sessionId/refund', verifyAdminToken, adminPayments.adminRefundSession);

// ── Phase 8: Revenue analytics ───────────────────────────────────────────────
router.get('/revenue', verifyAdminToken, adminPayments.getRevenueAnalytics);

module.exports = router;
