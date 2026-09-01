/**
 * Authorization errors carrying a machine-readable discriminator.
 *
 * Why `category` exists: the client cannot currently tell an authorization
 * 403 from a CSRF 403, and two places behave badly as a result —
 *
 *   - client/src/utils/csrfFetchInterceptor.ts treats EVERY 403 from an API
 *     mutation as a stale CSRF token and drops its cached token, so a genuine
 *     permission denial makes the next mutation pay an extra round trip.
 *   - client/src/context/AuthContext.tsx treats a 403 from /api/protected
 *     exactly like a 401 and silently logs the user out.
 *
 * Adding `category: 'authz' | 'csrf'` and a specific `code` lets the client
 * branch correctly, and makes "the right kind of 403 was returned" something
 * a test can assert rather than something a reviewer has to eyeball.
 */

const { AppError } = require('../utils/errors');

const CATEGORY = Object.freeze({
  AUTHZ: 'authz',
  CSRF: 'csrf',
  AUTHENTICATION: 'authentication'
});

const CODE = Object.freeze({
  FORBIDDEN: 'AUTHZ_FORBIDDEN',
  NOT_OWNER: 'AUTHZ_NOT_OWNER',
  NOT_PARTICIPANT: 'AUTHZ_NOT_PARTICIPANT',
  WRONG_ROLE: 'AUTHZ_WRONG_ROLE',
  NO_SCOPE: 'AUTHZ_NO_SCOPE',
  MISSING_SUBJECT: 'AUTHZ_MISSING_SUBJECT',
  NOT_IN_ROOM: 'AUTHZ_NOT_IN_ROOM',
  TIER_REQUIRED: 'AUTHZ_TIER_REQUIRED',
  ACCOUNT_SUSPENDED: 'AUTHZ_ACCOUNT_SUSPENDED',
  WRONG_REALM: 'AUTHZ_WRONG_REALM'
});

class ForbiddenError extends AppError {
  /**
   * @param {string} code    one of CODE.* — stable, safe to branch on
   * @param {string} message human-readable; safe to show a user
   */
  constructor(code = CODE.FORBIDDEN, message = 'You do not have permission to do this') {
    super(message, 403, true);
    this.code = code;
    this.category = CATEGORY.AUTHZ;
  }
}

module.exports = { ForbiddenError, CATEGORY, CODE };
