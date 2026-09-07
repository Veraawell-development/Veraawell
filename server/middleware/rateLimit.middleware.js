/**
 * Rate Limiting Middleware
 * Configurable rate limiting for different endpoint types
 */

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { RATE_LIMITS } = require('../config/constants');
const { isProduction } = require('../config/environment');
const { RateLimitError } = require('../utils/errors');

/**
 * General rate limiter
 */
const generalLimiter = rateLimit({
  windowMs: RATE_LIMITS.GENERAL.windowMs,
  max: isProduction() 
    ? RATE_LIMITS.GENERAL.max.production 
    : RATE_LIMITS.GENERAL.max.development,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS', // Skip rate limiting for OPTIONS requests
  handler: (req, res) => {
    throw new RateLimitError('Too many requests, please try again later.');
  }
});

/**
 * Authentication rate limiter (stricter)
 */
const authLimiter = rateLimit({
  windowMs: RATE_LIMITS.AUTH.windowMs,
  max: isProduction() 
    ? RATE_LIMITS.AUTH.max.production 
    : RATE_LIMITS.AUTH.max.development,
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: RATE_LIMITS.AUTH.skipSuccessfulRequests,
  skip: (req) => req.method === 'OPTIONS', // Skip rate limiting for OPTIONS requests
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    throw new RateLimitError('Too many authentication attempts, please try again later.');
  }
});

/**
 * Password reset rate limiter
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  message: 'Too many password reset attempts, please try again later.',
  skip: (req) => req.method === 'OPTIONS', // Skip rate limiting for OPTIONS requests
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    throw new RateLimitError('Too many password reset attempts, please try again later.');
  }
});

/**
 * Public document-upload rate limiter — see PUBLIC_UPLOAD in config/constants.js
 * for why these routes can't simply require verifyToken.
 */
const publicUploadLimiter = rateLimit({
  windowMs: RATE_LIMITS.PUBLIC_UPLOAD.windowMs,
  max: isProduction()
    ? RATE_LIMITS.PUBLIC_UPLOAD.max.production
    : RATE_LIMITS.PUBLIC_UPLOAD.max.development,
  message: 'Too many upload attempts from this IP, please try again later.',
  skip: (req) => req.method === 'OPTIONS',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    throw new RateLimitError('Too many upload attempts, please try again later.');
  }
});

/**
 * Public enquiry-form limiter — see ENQUIRY in config/constants.js.
 *
 * Keyed on the submitted email address where there is one, so a shared office
 * NAT does not lock out a whole building, with the IP as the fallback. Same
 * shape as the OTP limiters in middleware/rateLimiter.js.
 */
const enquiryLimiter = rateLimit({
  windowMs: RATE_LIMITS.ENQUIRY.windowMs,
  max: isProduction()
    ? RATE_LIMITS.ENQUIRY.max.production
    : RATE_LIMITS.ENQUIRY.max.development,
  skip: (req) => req.method === 'OPTIONS',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = req.body && typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email || ipKeyGenerator(req);
  },
  handler: () => {
    throw new RateLimitError('Too many enquiries from this address, please try again later.');
  }
});

module.exports = {
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  publicUploadLimiter,
  enquiryLimiter
};
