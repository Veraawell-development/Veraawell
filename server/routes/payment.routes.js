const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Doctor onboard route (requires authentication)
router.post('/onboard', verifyToken, paymentController.onboardDoctor);

// Webhook route (does not require authentication, verified via signature)
router.post('/webhook', express.json({ type: 'application/json' }), paymentController.razorpayWebhook);

module.exports = router;
