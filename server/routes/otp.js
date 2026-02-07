/**
 * OTP Routes
 * Handles OTP generation, verification, and resend
 */

const express = require('express');
const router = express.Router();
const OTP = require('../models/otp');
const { generateOTP, hashOTP, verifyOTP, getExpiryTime } = require('../utils/otpGenerator');
const { sendOTPEmail } = require('../services/email.service');
const { otpSendLimiter, otpVerifyLimiter, otpResendLimiter } = require('../middleware/rateLimiter');
const { createLogger } = require('../utils/logger');

const logger = createLogger('OTP');

/**
 * POST /api/otp/send
 * Send OTP to email for verification
 */
router.post('/send', otpSendLimiter, async (req, res) => {
    try {
        const { email, userType } = req.body;

        // Validation
        if (!email || !userType) {
            return res.status(400).json({
                success: false,
                message: 'Email and user type are required'
            });
        }

        if (!['patient', 'doctor'].includes(userType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user type. Must be patient or doctor'
            });
        }

        // Clean up old OTPs for this email
        await OTP.cleanupOldOTPs(email);

        // Check if there's a recent unverified OTP (prevent spam)
        const recentOTP = await OTP.findOne({
            email,
            verified: false,
            expiresAt: { $gt: new Date() },
            createdAt: { $gt: new Date(Date.now() - 60000) } // Within last 1 minute
        });

        if (recentOTP) {
            return res.status(429).json({
                success: false,
                message: 'An OTP was recently sent. Please wait 1 minute before requesting again.',
                expiresAt: recentOTP.expiresAt
            });
        }

        // Generate OTP
        const otp = generateOTP();
        logger.info('OTP generated', { email, userType, otpLength: otp.length });

        // Hash OTP
        const hashedOTP = await hashOTP(otp);

        // Create OTP record
        const otpRecord = new OTP({
            email: email.toLowerCase(),
            otp: hashedOTP,
            purpose: 'signup',
            userType,
            expiresAt: getExpiryTime()
        });

        await otpRecord.save();
        logger.info('OTP saved to database', { email, expiresAt: otpRecord.expiresAt });

        // Send OTP email
        try {
            await sendOTPEmail(email, otp, userType);
            logger.info('OTP email sent successfully', { email });

            res.json({
                success: true,
                message: 'OTP sent to your email',
                expiresAt: otpRecord.expiresAt,
                email: email
            });
        } catch (emailError) {
            logger.error('Failed to send OTP email', { error: emailError.message, email });

            // Delete OTP record if email failed
            await OTP.deleteOne({ _id: otpRecord._id });

            res.status(500).json({
                success: false,
                message: 'Failed to send OTP email. Please try again.'
            });
        }

    } catch (error) {
        logger.error('Error in OTP send', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Failed to send OTP. Please try again.'
        });
    }
});

/**
 * POST /api/otp/verify
 * Verify OTP code
 */
router.post('/verify', otpVerifyLimiter, async (req, res) => {
    try {
        const { email, otp } = req.body;

        // Validation
        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required'
            });
        }

        if (otp.length !== 6 || !/^\d+$/.test(otp)) {
            return res.status(400).json({
                success: false,
                message: 'OTP must be a 6-digit number'
            });
        }

        // Find OTP record
        const otpRecord = await OTP.findOne({
            email: email.toLowerCase(),
            verified: false
        }).sort({ createdAt: -1 }); // Get most recent

        if (!otpRecord) {
            return res.status(404).json({
                success: false,
                message: 'No OTP found for this email. Please request a new one.'
            });
        }

        // Check if expired
        if (otpRecord.isExpired()) {
            logger.warn('OTP expired', { email });
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new one.',
                expired: true
            });
        }

        // Check max attempts
        if (otpRecord.maxAttemptsReached()) {
            logger.warn('Max OTP attempts reached', { email });
            return res.status(429).json({
                success: false,
                message: 'Maximum verification attempts exceeded. Please request a new OTP.',
                maxAttemptsReached: true
            });
        }

        // Verify OTP
        const isValid = await verifyOTP(otp, otpRecord.otp);

        if (!isValid) {
            // Increment attempts
            otpRecord.attempts += 1;
            await otpRecord.save();

            const attemptsLeft = 3 - otpRecord.attempts;

            logger.warn('Invalid OTP attempt', { email, attempts: otpRecord.attempts });

            return res.status(400).json({
                success: false,
                message: `Invalid OTP. ${attemptsLeft} attempt(s) remaining.`,
                attemptsLeft
            });
        }

        // OTP is valid - mark as verified
        otpRecord.verified = true;
        await otpRecord.save();

        logger.info('OTP verified successfully', { email });

        res.json({
            success: true,
            message: 'Email verified successfully',
            verified: true
        });

    } catch (error) {
        logger.error('Error in OTP verify', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Failed to verify OTP. Please try again.'
        });
    }
});

/**
 * POST /api/otp/resend
 * Resend OTP to email
 */
router.post('/resend', otpResendLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Find existing OTP record
        const existingOTP = await OTP.findOne({
            email: email.toLowerCase(),
            verified: false,
            expiresAt: { $gt: new Date() }
        }).sort({ createdAt: -1 });

        if (!existingOTP) {
            return res.status(404).json({
                success: false,
                message: 'No active OTP found. Please request a new one.'
            });
        }

        // Check resend limit
        if (existingOTP.resendCount >= 3) {
            return res.status(429).json({
                success: false,
                message: 'Maximum resend limit reached. Please request a new OTP.'
            });
        }

        // Generate new OTP
        const newOTP = generateOTP();
        const hashedOTP = await hashOTP(newOTP);

        // Update existing record
        existingOTP.otp = hashedOTP;
        existingOTP.attempts = 0; // Reset attempts
        existingOTP.resendCount += 1;
        existingOTP.expiresAt = getExpiryTime(); // Reset expiry
        await existingOTP.save();

        // Send email
        try {
            await sendOTPEmail(email, newOTP, existingOTP.userType);

            logger.info('OTP resent successfully', {
                email,
                resendCount: existingOTP.resendCount
            });

            res.json({
                success: true,
                message: 'OTP resent to your email',
                expiresAt: existingOTP.expiresAt,
                resendsLeft: 3 - existingOTP.resendCount
            });
        } catch (emailError) {
            logger.error('Failed to resend OTP email', { error: emailError.message, email });

            res.status(500).json({
                success: false,
                message: 'Failed to resend OTP email. Please try again.'
            });
        }

    } catch (error) {
        logger.error('Error in OTP resend', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Failed to resend OTP. Please try again.'
        });
    }
});

module.exports = router;
