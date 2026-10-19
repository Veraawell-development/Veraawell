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

/** The account a sign-in, code or reset request is about, normalised. */
function accountOf(req) {
  const body = req.body || {};
  const value = typeof body.username === 'string' ? body.username
    : typeof body.email === 'string' ? body.email
      : '';
  return value.trim().toLowerCase().slice(0, 254);
}

const limitFor = (max) => (isProduction() ? max.production : max.development);

function authLimit({ windowMs, max, key, skipSuccessfulRequests = false, message }) {
  return rateLimit({
    windowMs,
    max: limitFor(max),
    keyGenerator: key,
    skipSuccessfulRequests,
    skip: (req) => req.method === 'OPTIONS', // Skip rate limiting for OPTIONS requests
    standardHeaders: true,
    legacyHeaders: false,
    handler: () => {
      throw new RateLimitError(message);
    }
  });
}

const byAccountAndIp = (req) => `${accountOf(req)}|${ipKeyGenerator(req.ip)}`;
const byIp = (req) => ipKeyGenerator(req.ip);

/**
 * Sign-in limits (see AUTH in config/constants.js): failed attempts per
 * account on one network, and per network. Each place that signs people in
 * gets its own pair — the old single `authLimiter` instance was shared by the
 * user login, signup, code verification and the admin login, so failures on
 * one counted against all of them. Mount AFTER body parsing: the per-account
 * key reads the address from the body.
 */
function signInLimiters(message = 'Too many sign-in attempts. Please wait 15 minutes, or reset your password.') {
  return [
    authLimit({ windowMs: RATE_LIMITS.AUTH.windowMs, max: RATE_LIMITS.AUTH.max.perAccount, key: byAccountAndIp, skipSuccessfulRequests: true, message }),
    authLimit({ windowMs: RATE_LIMITS.AUTH.windowMs, max: RATE_LIMITS.AUTH.max.perIp, key: byIp, skipSuccessfulRequests: true, message: 'Too many sign-in attempts from this network. Please try again in a few minutes.' })
  ];
}

const loginLimiters = signInLimiters();
const verifySignupLimiters = signInLimiters('Too many incorrect codes. Please wait 15 minutes and try again.');
const adminLoginLimiters = signInLimiters('Too many sign-in attempts. Please wait 15 minutes and try again.');

/** POST /api/auth/register — see SIGNUP in config/constants.js. Every request counts. */
const signupLimiter = authLimit({
  windowMs: RATE_LIMITS.SIGNUP.windowMs,
  max: RATE_LIMITS.SIGNUP.max,
  key: byIp,
  message: 'Too many sign-ups from this network. Please try again later.'
});

/**
 * Password reset limiters — see PASSWORD_RESET in config/constants.js. Used
 * by the user and the admin forgot-password routes, each with its own pair.
 */
function passwordResetLimiters() {
  const message = 'Too many password reset attempts, please try again later.';
  return [
    authLimit({ windowMs: RATE_LIMITS.PASSWORD_RESET.windowMs, max: RATE_LIMITS.PASSWORD_RESET.max.perAddress, key: (req) => accountOf(req) || byIp(req), message }),
    authLimit({ windowMs: RATE_LIMITS.PASSWORD_RESET.windowMs, max: RATE_LIMITS.PASSWORD_RESET.max.perIp, key: byIp, message })
  ];
}

const userPasswordResetLimiters = passwordResetLimiters();
const adminPasswordResetLimiters = passwordResetLimiters();

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
 * NAT does not lock out a whole building, with the IP as the fallback.
 *
 * (middleware/rateLimiter.js held the OTP limiters this was modelled on. It
 * went with the dead /api/otp routes that were its only user, so this file is
 * now the one place rate limits live.)
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
    // ipKeyGenerator takes the IP string. It was being handed the request
    // object, which made the fallback key a fresh object per request — so a
    // submission without an email was never counted at all.
    return email || ipKeyGenerator(req.ip);
  },
  handler: () => {
    throw new RateLimitError('Too many enquiries from this address, please try again later.');
  }
});

/**
 * Signup "Resend code" limiter — see SIGNUP_OTP_RESEND in config/constants.js.
 * Keyed on the address AND the caller's IP, so one person retrying cannot
 * lock a shared network out, and one network cannot mail an address
 * without bound.
 */
const signupOtpResendLimiter = rateLimit({
  windowMs: RATE_LIMITS.SIGNUP_OTP_RESEND.windowMs,
  max: isProduction()
    ? RATE_LIMITS.SIGNUP_OTP_RESEND.max.production
    : RATE_LIMITS.SIGNUP_OTP_RESEND.max.development,
  skip: (req) => req.method === 'OPTIONS',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = req.body && typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${email}|${ipKeyGenerator(req.ip)}`;
  },
  handler: () => {
    throw new RateLimitError('Too many verification codes requested. Please wait a few minutes and try again.');
  }
});

/**
 * Call statistics from the browser (POST /sessions/:id/call-events): per
 * person and session. A call reports every minute or so; 30 a minute leaves
 * room for bursts (reconnects) and stops a broken client from flooding.
 */
const callEventsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => `${req.user ? req.user._id : ipKeyGenerator(req.ip)}|${req.params.sessionId}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: () => {
    throw new RateLimitError('Too many call reports — slow down.');
  }
});

module.exports = {
  callEventsLimiter,
  generalLimiter,
  loginLimiters,
  verifySignupLimiters,
  adminLoginLimiters,
  signupLimiter,
  userPasswordResetLimiters,
  adminPasswordResetLimiters,
  publicUploadLimiter,
  enquiryLimiter,
  signupOtpResendLimiter
};
