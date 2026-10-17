/**
 * CSRF Protection Middleware — double-submit cookie pattern.
 *
 * This file used to be a fully commented-out placeholder (verifyCSRF just
 * called next()), and was never imported by any route. Meanwhile both the
 * session cookie and the auth cookie use SameSite=None in production
 * (required for the cross-origin frontend/backend split) — the specific
 * cookie configuration that most needs CSRF protection, since SameSite=
 * Strict/Lax is what normally provides *implicit* CSRF protection for
 * cookie-based auth. With cookie-based credentials and no CSRF token, there
 * was zero CSRF protection on any state-changing endpoint.
 *
 * No new dependency: uses only Node's built-in crypto, not the commented-out
 * `csrf` package this file used to reference.
 *
 * Pattern: GET /api/csrf-token (issueCsrfToken) sets a non-httpOnly cookie
 * and returns the same value in the body; the client echoes it back in an
 * X-CSRF-Token header on state-changing requests; verifyCSRF checks the two
 * match. A cross-origin attacker's page can trigger a request that carries
 * the cookie automatically, but cannot read the cookie's value to put it in
 * the header (same-origin policy), so it can't produce a match.
 */

const crypto = require('crypto');
const { isProduction } = require('../config/environment');

const CSRF_COOKIE_NAME = 'csrfToken';
const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

// As long as the auth cookie. The client caches the token for the life of
// the tab; a cookie that lapsed sooner (it was 24 hours) left a long-lived
// tab echoing a value the browser no longer sent.
const CSRF_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function csrfCookieOptions() {
  return {
    httpOnly: false, // must be readable by client JS to echo back in a header
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    maxAge: CSRF_COOKIE_MAX_AGE_MS,
    path: '/'
  };
}

/**
 * GET /api/csrf-token — the ONLY place a token is minted.
 *
 * This used to be middleware on every request that minted a fresh token
 * whenever the request arrived without the cookie. On a first page load —
 * always, in a private window — the app fires several credentialed calls at
 * once; each arrived cookie-less, each minted a different token and set it,
 * and whichever Set-Cookie the browser applied last won. The value the
 * client had cached from this endpoint then no longer matched the cookie,
 * and the next mutation failed with "Invalid CSRF token" — reliably, right
 * after a successful payment, which is the first POST most patients make.
 *
 * Now ordinary requests never touch the cookie, and this endpoint is
 * idempotent while the cookie exists: it returns the value the browser
 * already holds (re-setting it only to extend its life). Only a request with
 * no usable cookie gets a new one. Two concurrent cookie-less calls to THIS
 * endpoint can still race; the client must make one request and share it.
 */
function issueCsrfToken(req, res) {
  const existing = req.cookies && req.cookies[CSRF_COOKIE_NAME];
  const token = typeof existing === 'string' && TOKEN_SHAPE.test(existing)
    ? existing
    : crypto.randomBytes(32).toString('hex');

  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions());
  // A cached copy of this response is a token the browser may no longer hold.
  res.set('Cache-Control', 'no-store');
  res.json({ csrfToken: token });
}

function verifyCSRF(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken) {
    // `category` lets the client tell a CSRF failure from an authorization
    // failure. Its fetch interceptor drops its cached token on any 403; it
    // should only do that for these two responses.
    return res.status(403).json({ success: false, category: 'csrf', code: 'CSRF_TOKEN_MISSING', message: 'CSRF token missing. Please refresh the page and try again.' });
  }

  const cookieBuf = Buffer.from(String(cookieToken));
  const headerBuf = Buffer.from(String(headerToken));
  const isValid = cookieBuf.length === headerBuf.length && crypto.timingSafeEqual(cookieBuf, headerBuf);

  if (!isValid) {
    return res.status(403).json({ success: false, category: 'csrf', code: 'CSRF_TOKEN_INVALID', message: 'Invalid CSRF token. Please refresh the page and try again.' });
  }

  next();
}

/**
 * Endpoints that skip verification, as paths relative to the '/api' mount
 * (Express strips the mount prefix from req.path, so these must NOT start
 * with '/api' or they never match).
 *
 * Every entry is an exact endpoint, and every one is reachable before a
 * session exists — there is no authenticated session yet for a cross-site
 * request to ride on — or is authenticated by something other than cookies:
 *
 *  - user sign-up, sign-in and password recovery, and the Google OAuth hop;
 *  - admin sign-in, first-time setup and password recovery;
 *  - /payments/webhook: Razorpay's HMAC signature, not cookies. Razorpay's
 *    servers cannot supply a CSRF token, and don't need to.
 *  - /upload/doctor-document(s): intentionally public uploads (a career-page
 *    applicant has no account yet — see routes/upload.js).
 *
 * This used to be a list of PREFIXES — '/auth/' and '/admin/auth/' — which
 * also exempted everything under them that runs on an existing session:
 * update-password, delete-account, logout and patient-profile for users,
 * change-password and create for admins. A page on any origin could
 * submit a form that deleted the visitor's account, or had a signed-in
 * super admin mint a new admin. Anything not named here is verified.
 */
const CSRF_EXEMPT_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/validate-registration',
  '/auth/verify-signup',
  '/auth/resend-signup-otp',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/google',
  '/auth/google/callback',
  '/admin/auth/login',
  '/admin/auth/setup',
  '/admin/auth/forgot-password',
  '/payments/webhook',
  '/upload/doctor-document',
  '/upload/doctor-documents'
]);

// The one parameterised pre-session route: /admin/auth/reset-password/:token.
const CSRF_EXEMPT_PREFIXES = ['/admin/auth/reset-password/'];

function isCsrfExempt(path) {
  // Express matches '/auth/login/' to the '/auth/login' route (non-strict
  // routing), so the exemption has to as well.
  const normalized = String(path || '').replace(/\/+$/, '') || '/';
  return CSRF_EXEMPT_PATHS.has(normalized)
    || CSRF_EXEMPT_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/** verifyCSRF for everything except the exemptions above. Mount on '/api'. */
function csrfProtection(req, res, next) {
  if (isCsrfExempt(req.path)) return next();
  return verifyCSRF(req, res, next);
}

module.exports = {
  issueCsrfToken,
  csrfCookieOptions,
  verifyCSRF,
  csrfProtection,
  isCsrfExempt,
  CSRF_EXEMPT_PATHS,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
};
