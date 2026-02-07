/**
 * Rate Limiter Middleware
 * Prevents abuse of OTP endpoints
 */

const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for OTP send endpoint
 * Limits: 3 requests per hour per IP
 */
const otpSendLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 requests per hour
    message: {
        success: false,
        message: 'Too many OTP requests. Please try again after 1 hour.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Use email from request body as key (more accurate than IP)
    keyGenerator: (req) => {
        return req.body.email || req.ip;
    }
});

/**
 * Rate limiter for OTP verify endpoint
 * Limits: 10 requests per hour per IP
 */
const otpVerifyLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 requests per hour
    message: {
        success: false,
        message: 'Too many verification attempts. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.body.email || req.ip;
    }
});

/**
 * Rate limiter for OTP resend endpoint
 * Limits: 5 requests per hour per IP
 */
const otpResendLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 requests per hour
    message: {
        success: false,
        message: 'Too many resend requests. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.body.email || req.ip;
    }
});

module.exports = {
    otpSendLimiter,
    otpVerifyLimiter,
    otpResendLimiter
};
