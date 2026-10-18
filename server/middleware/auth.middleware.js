/**
 * Authentication Middleware
 * Centralized JWT token verification for all routes
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/user');
const { getJWTSecret, getAdminJWTSecret } = require('../config/auth');
const { AuthenticationError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');
const { normalizeActor, CHANNEL } = require('../authz/actor');

const logger = createLogger('AUTH');

/**
 * The two credential realms. Each has its own cookie and its own secret.
 *
 * The secret used to be chosen by asking "does this request carry an
 * adminToken cookie?" and, if so, verifying EVERY token with the admin
 * secret. A browser that had signed in to both the app and the admin portal
 * therefore failed verification on every user route — the `token` cookie and
 * the user's Bearer were checked against the wrong key — and got a 401 on
 * everything until it cleared cookies. The realm is now a property of the
 * middleware, not of whichever cookies happen to be present:
 *
 *   verifyToken       Bearer header, then the `token` cookie       JWT_SECRET
 *   verifyAdminToken  Bearer header, then the `adminToken` cookie  ADMIN_JWT_SECRET
 *
 * A Bearer header is tried against the realm's own secret only. Accepting an
 * admin-realm token on user routes would erase the boundary that
 * clinicalRecords.policy.js and the authz sweep rely on, and nothing in the
 * client sends one there.
 */
const REALM = Object.freeze({
  USER: { cookie: 'token', secret: getJWTSecret },
  ADMIN: { cookie: 'adminToken', secret: getAdminJWTSecret }
});

/** Every credential this request offers for a realm, in priority order. */
function credentialCandidates(req, realm) {
  const out = [];
  const header = req.headers && req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.substring(7).trim();
    if (token) out.push({ token, source: 'header:Authorization' });
  }
  // Guarded: `req.cookies` is undefined unless cookieParser has run. Reading
  // through it unguarded turned "no credentials" into a 500 with a stack
  // trace instead of a 401, and made every authenticated route depend on
  // middleware ordering that nothing asserted.
  const cookies = req.cookies || {};
  if (cookies[realm.cookie]) out.push({ token: cookies[realm.cookie], source: `cookie:${realm.cookie}` });
  return out;
}

/**
 * Is this token older than the account's last password change?
 *
 * Exported for the socket handshake, which loads a lean user. `iat` is whole
 * seconds and passwordChangedAt is truncated to the second (models/user.js),
 * so a token minted in the same second as the change — the fresh one a reset
 * or update hands back — still verifies. A token with no `iat` at all cannot
 * be placed in time and is treated as stale once a change has happened.
 */
function tokenPredatesPasswordChange(user, decoded) {
  if (!user || !user.passwordChangedAt) return false;
  if (!decoded || typeof decoded.iat !== 'number') return true;
  return decoded.iat * 1000 < new Date(user.passwordChangedAt).getTime();
}

/**
 * Account-level refusals that hold whichever token was presented. Returns
 * the error to raise, or null. Exported for the socket handshake.
 */
function accountProblem(user) {
  const refused = (message) => {
    const error = new AuthorizationError(message);
    // The account itself is refused, not this one request: the client signs
    // the browser out on seeing it (utils/csrfFetchInterceptor.ts).
    error.code = 'ACCOUNT_REFUSED';
    error.category = 'authentication';
    return error;
  };
  // Account status was never checked here, only in verifyAdminToken. So
  // suspending a patient or doctor did nothing at all: their existing token
  // kept full access for its 30-day life, and they could continue booking,
  // messaging and joining calls. Verified against the running server — a
  // user with status 'suspended' got HTTP 200 from /api/protected.
  if (user.status !== 'active') {
    return refused('This account has been suspended');
  }
  // Login refuses a rejected doctor, but a token issued before the rejection
  // kept working for its whole 30-day life — a rejected practitioner could
  // still edit a public profile and take calls.
  if (user.role === 'doctor' && user.approvalStatus === 'rejected') {
    return refused('This practitioner account has been rejected');
  }
  // Pending, likewise. Password login has always refused a pending doctor,
  // but verify-signup and Google sign-in used to hand one a session anyway,
  // and with it the whole doctor dashboard before any admin had looked at
  // their licence. Neither issues one now; this retires the ones already out.
  if (user.role === 'doctor' && user.approvalStatus !== 'approved') {
    return refused('Your practitioner account is awaiting approval. We will email you when you can sign in.');
  }
  return null;
}

/**
 * Resolve the account behind the first credential that is actually valid.
 *
 * Each candidate is tried in turn and a failure falls through to the next.
 * That matters after a password change: the client holds its Bearer token in
 * memory, so for the rest of that page's life it keeps sending the token the
 * change just retired alongside the fresh cookie the server set in the same
 * response. Stopping at the first candidate would log the user out of the
 * very session they changed their password from.
 *
 * @returns {Promise<{user, decoded, source}|null>} null when no credential
 *          was offered at all
 */
async function authenticateRealm(req, realm) {
  const candidates = credentialCandidates(req, realm);
  if (candidates.length === 0) return null;

  let failure = null;
  for (const { token, source } of candidates) {
    let decoded;
    try {
      decoded = jwt.verify(token, realm.secret());
    } catch (error) {
      logger.debug('Token verification failed', { source, error: error.message });
      failure = failure || new AuthenticationError('Invalid or expired token');
      continue;
    }

    // Tokens are looked up by userId and nothing else. A legacy branch used
    // to resolve `{ username }` tokens by username — so anyone able to sign a
    // token (a leaked secret, a dev fallback secret reaching production)
    // could name any account without knowing its id, and every username is
    // an email address. No issuer has minted that shape for a long time.
    if (!decoded || !mongoose.isValidObjectId(decoded.userId)) {
      failure = failure || new AuthenticationError('Invalid or expired token');
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const user = await User.findById(decoded.userId);
    if (!user) {
      logger.warn('User not found for token', { source });
      failure = new AuthenticationError('User not found');
      continue;
    }

    if (tokenPredatesPasswordChange(user, decoded)) {
      logger.info('Token predates a password change', {
        userId: user._id.toString().substring(0, 8), source
      });
      failure = new AuthenticationError('Your password was changed. Please sign in again.');
      continue;
    }

    return { user, decoded, source, token };
  }

  throw failure;
}

/**
 * Verify JWT token and attach user to request
 */
async function verifyToken(req, res, next) {
  try {
    const resolved = await authenticateRealm(req, REALM.USER);
    if (!resolved) {
      logger.debug('No token provided', { ip: req.ip });
      throw new AuthenticationError('No token provided');
    }
    const { user, decoded, token } = resolved;

    const problem = accountProblem(user);
    if (problem) {
      logger.warn('Refused account attempted access', {
        userId: user._id.toString().substring(0, 8),
        status: user.status,
        approvalStatus: user.approvalStatus
      });
      throw problem;
    }

    // Attach user to request
    req.user = user;
    req.token = decoded;
    // The credential itself, for GET /api/protected to hand back.
    req.authToken = token;
    // Single normalized view of the caller, correct in both auth realms. See
    // authz/actor.js — handlers read req.actor.id rather than guessing
    // between req.user and req.admin.
    req.actor = normalizeActor(user, CHANNEL.USER);

    logger.debug('Token verified successfully', {
      userId: user._id.toString().substring(0, 8) + '...',
      role: user.role
      // Never log full token or sensitive data
    });

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Verify admin token
 */
async function verifyAdminToken(req, res, next) {
  try {
    let resolved;
    try {
      resolved = await authenticateRealm(req, REALM.ADMIN);
    } catch (error) {
      // Keep the admin realm's single, uninformative refusal.
      throw new AuthenticationError(error.message === 'User not found' ? 'Admin not found' : error.message);
    }
    if (!resolved) {
      throw new AuthenticationError('Admin authentication required');
    }
    const { user: admin, decoded } = resolved;

    if (admin.status !== 'active') {
      throw new AuthorizationError('Admin account is suspended');
    }

    // The role is taken from the DATABASE, not from the JWT claim.
    //
    // Previously the claim alone decided this, so demoting an admin had no
    // effect until their token expired — up to 8 hours of retained privilege
    // after the revocation was supposed to take effect. The claim is now only
    // a hint; a disagreement means the token predates a role change.
    if (!['admin', 'super_admin'].includes(admin.role)) {
      logger.warn('Admin token presented by a non-admin account', {
        claimedRole: decoded.role, actualRole: admin.role
      });
      throw new AuthorizationError('Access denied');
    }
    // Same reasoning for approval: rejecting an admin who is already signed
    // in should take effect on their next request, not when the token lapses.
    if (admin.role === 'admin' && admin.approvalStatus !== 'approved') {
      throw new AuthorizationError('Admin account is not approved');
    }
    if (decoded.role !== admin.role) {
      logger.warn('Admin role claim differs from the stored role — using the stored role', {
        claimedRole: decoded.role, actualRole: admin.role
      });
    }

    req.admin = admin;
    req.token = decoded;
    req.actor = normalizeActor(admin, CHANNEL.ADMIN);

    logger.debug('Admin token verified', {
      adminId: admin._id.toString().substring(0, 8),
      role: admin.role
    });

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Verify super admin role (must be used after verifyAdminToken)
 *
 * Tagged so authz/audit.js counts it as a declared authorization requirement.
 * It predates the policy layer but it genuinely states one, and treating it as
 * "undeclared" would overstate the gap.
 */
function verifySuperAdmin(req, res, next) {
  if (!req.admin || req.admin.role !== 'super_admin') {
    // A tier refusal, tagged as one (category 'authz'), so the dashboard
    // shows it as "not allowed" instead of treating it as the end of the
    // session and signing a normal admin out.
    const { ForbiddenError, CODE } = require('../authz/errors');
    return next(new ForbiddenError(CODE.TIER_REQUIRED, 'Super admin privileges required'));
  }
  next();
}
verifySuperAdmin.__authz = { kind: 'role', roles: ['super_admin'], legacy: true };

/**
 * Optional token verification (doesn't fail if no token)
 *
 * Runs exactly the checks verifyToken does. Anything verifyToken would refuse
 * — a bad signature, a token older than a password change, a suspended or
 * rejected account — is treated as anonymous here rather than as an error,
 * since this middleware is for endpoints that work either way.
 */
async function optionalAuth(req, res, next) {
  try {
    const resolved = await authenticateRealm(req, REALM.USER);
    if (resolved && !accountProblem(resolved.user)) {
      req.user = resolved.user;
      req.token = resolved.decoded;
      req.actor = normalizeActor(resolved.user, CHANNEL.USER);
    }
  } catch (error) {
    // Continue without authentication if the token is unusable.
  }
  next();
}

/**
 * Verify specific role
 */
function requireRole(...roles) {
  const middleware = (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AuthorizationError('Insufficient permissions'));
    }
    next();
  };
  middleware.__authz = { kind: 'role', roles, legacy: true };
  return middleware;
}

module.exports = {
  verifyToken,
  verifyAdminToken,
  verifySuperAdmin,
  requireRole,
  optionalAuth,
  tokenPredatesPasswordChange,
  accountProblem
};
