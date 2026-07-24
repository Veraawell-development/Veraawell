const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// ── Doctor payout onboarding (admin-gated) ───────────────────────────────────
router.post('/request-onboarding', verifyToken, paymentController.requestOnboarding);
router.get('/onboarding-status', verifyToken, paymentController.getOnboardingStatus);

// ── Payment verification (called by frontend after Razorpay modal success) ───
router.post('/verify', verifyToken, paymentController.verifyPayment);

// ── Webhook (no auth — verified via Razorpay signature) ─────────────────────
router.post('/webhook', express.json({ type: 'application/json' }), paymentController.razorpayWebhook);

module.exports = router;
