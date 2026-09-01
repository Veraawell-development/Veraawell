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
 * Pattern: issueCsrfToken sets a non-httpOnly cookie the client can read;
 * the client echoes it back in an X-CSRF-Token header on state-changing
 * requests (see client/src/main.tsx's fetch interceptor); verifyCSRF checks
 * the two match. A cross-origin attacker's page can trigger a request that
 * carries the cookie automatically, but cannot read the cookie's value to
 * put it in the header (same-origin policy), so it can't produce a match.
 */

const crypto = require('crypto');
const { isProduction } = require('../config/environment');

const CSRF_COOKIE_NAME = 'csrfToken';
const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function issueCsrfToken(req, res, next) {
  if (!req.cookies || !req.cookies[CSRF_COOKIE_NAME]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // must be readable by client JS to echo back in a header
      secure: isProduction(),
      sameSite: isProduction() ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24h
    });
    // Make the token available to this same request too, in case verifyCSRF
    // runs later in the same request chain before the response is sent.
    req.cookies = req.cookies || {};
    req.cookies[CSRF_COOKIE_NAME] = token;
  }
  next();
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

module.exports = {
  issueCsrfToken,
  verifyCSRF,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
};
