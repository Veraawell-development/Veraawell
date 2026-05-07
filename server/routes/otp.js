const express = require('express');
const router = express.Router();
const { otpSendLimiter, otpVerifyLimiter, otpResendLimiter } = require('../middleware/rateLimiter');
const otpController = require('../controllers/otp.controller');

router.post('/send', otpSendLimiter, otpController.sendOtp);
router.post('/verify', otpVerifyLimiter, otpController.verifyOtp);
router.post('/resend', otpResendLimiter, otpController.resendOtp);

module.exports = router;
