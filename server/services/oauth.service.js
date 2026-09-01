/**
 * OAuth Service
 * Handles Google OAuth authentication
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/user');
const { getOAuthConfig, getFrontendUrl } = require('../config/auth');
const { generateToken, setAuthCookie } = require('./auth.service');
const { createLogger } = require('../utils/logger');
const { ValidationError } = require('../utils/errors');

const logger = createLogger('OAUTH');

/**
 * Initialize Google OAuth strategy
 */
function initializeGoogleStrategy() {
  const oauthConfig = getOAuthConfig();

  if (!oauthConfig.enabled) {
    logger.warn('Google OAuth not configured');
    return false;
  }

  const callbackURL = process.env.NODE_ENV === 'production'
    ? "https://api.veraawell.com/api/auth/google/callback"
    : `http://localhost:${process.env.PORT || 8000}/api/auth/google/callback`;

  passport.use(new GoogleStrategy({
    clientID: oauthConfig.clientId,
    clientSecret: oauthConfig.clientSecret,
    callbackURL: callbackURL,
    // Needed so the strategy can read the signup intent that
    // GET /api/auth/google stashed in the session. The intent is applied only
    // when creating a brand-new account — never to an existing one.
    passReqToCallback: true
  }, async function (req, accessToken, refreshToken, profile, cb) {
    try {
      logger.debug('Google profile received', {
        id: profile.id,
        email: profile.emails?.[0]?.value
      });

      const email = profile.emails?.[0]?.value;
      const emailVerified = profile.emails?.[0]?.verified;
      if (!email) return cb(new Error('Google account has no email address'), null);

      let user = await User.findOne({ googleId: profile.id });

      if (!user) {
        // Account linking. Previously this only looked up by googleId, so a
        // user who had registered with email+password and later clicked
        // "Sign in with Google" fell through to the create branch, hit the
        // unique index on `email`, and got a generic
        // "?error=google-auth-failed" with no way to recover.
        //
        // Linking is gated on Google asserting the address is verified. Without
        // that check, anyone able to create a Google account claiming an
        // address could take over the matching local account.
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
          if (!emailVerified) {
            logger.warn('Refusing to link an unverified Google email to an existing account', { email });
            return cb(new Error('EMAIL_NOT_VERIFIED'), null);
          }
          existing.googleId = profile.id;
          await existing.save();
          logger.info('Linked Google identity to an existing account', { email: existing.email });
          return cb(null, existing);
        }

        const firstName = profile.name?.givenName || profile.displayName || 'Google';
        const lastName = profile.name?.familyName || 'User';

        // The signup intent (?role=) is applied HERE, at creation, and nowhere
        // else — see handleOAuthCallback. A doctor created this way starts
        // 'pending' and must still be approved by an admin.
        const intent = req.session && req.session.oauthRole;
        const role = intent === 'doctor' ? 'doctor' : 'patient';

        user = new User({
          googleId: profile.id,
          email,
          firstName,
          lastName,
          username: email,
          // Never used for authentication: comparePassword() returns false
          // outright for a googleId account. Generated with a CSPRNG rather
          // than Math.random() so it is not a weak secret sitting in the DB.
          password: `google-auth-${require('crypto').randomBytes(24).toString('hex')}`,
          role,
          approvalStatus: role === 'doctor' ? 'pending' : 'approved'
        });
        await user.save();
        logger.info('New Google user created', { email: user.email, role, approvalStatus: user.approvalStatus });
      } else {
        logger.debug('Existing Google user found', { email: user.email });
      }

      return cb(null, user);
    } catch (error) {
      logger.error('Google OAuth error', { error: error.message });
      return cb(error, null);
    }
  }));

  logger.info('Google OAuth strategy initialized');
  return true;
}

/**
 * Handle OAuth callback
 */
async function handleOAuthCallback(req, res, user, requestedRole) {
  try {
    logger.info('OAuth callback received', {
      userId: user._id.toString().substring(0, 8),
      email: user.email,
      currentRole: user.role,
      requestedRole
    });

    // A role is NEVER taken from the request here.
    //
    // This used to copy `requestedRole` — which comes straight from the
    // `?role=` query parameter on /api/auth/google — onto the user and save,
    // without resetting approvalStatus. Since a Google user is created as a
    // patient (and patients are auto-approved), visiting
    //     /api/auth/google?role=doctor
    // flipped the account to role 'doctor' while it kept approvalStatus
    // 'approved'. Verified against the running server: patient/approved ->
    // doctor/approved. Anyone with a Google account became a live, bookable
    // therapist with no admin review, no licence and no documents.
    //
    // The signup intent is now applied exactly once, at account creation, in
    // the strategy above — where 'doctor' also forces approvalStatus
    // 'pending'. An existing account's role can only be changed by an admin.
    if (requestedRole && requestedRole !== user.role) {
      logger.warn('Ignoring a role change requested via the OAuth query string', {
        userId: user._id.toString().substring(0, 8),
        currentRole: user.role,
        requestedRole
      });
    }

    // Generate token
    const token = generateToken(user);

    // Set cookie (HTTP-only, secure)
    setAuthCookie(res, token);

    logger.info('OAuth authentication successful', {
      userId: user._id.toString().substring(0, 8),
      email: user.email
    });

    // Redirect to frontend. We are passing the token in the URL as a fallback
    // because cookies are blocked in production due to cross-domain setup.
    // Frontend should extract it and save to localStorage, then clean the URL.
    const frontendBaseUrl = getFrontendUrl();
    const redirectUrl = new URL(frontendBaseUrl);
    redirectUrl.searchParams.set('auth', 'success');
    redirectUrl.searchParams.set('role', user.role);
    redirectUrl.searchParams.set('isGoogle', 'true');
    redirectUrl.searchParams.set('token', token); // Fallback for blocked cookies

    logger.debug('Redirecting to frontend', { 
      url: redirectUrl.toString().split('?')[0] // Don't log query params with sensitive data
    });
    return res.redirect(redirectUrl.toString());
  } catch (error) {
    logger.error('OAuth callback error', { error: error.message });
    const frontendBaseUrl = getFrontendUrl();
    return res.redirect(`${frontendBaseUrl}/login?error=oauth-failed`);
  }
}

/**
 * Validate OAuth role
 */
function validateOAuthRole(role) {
  if (role && !['patient', 'doctor'].includes(role)) {
    throw new ValidationError('Invalid role specified. Must be either patient or doctor.');
  }
}

module.exports = {
  initializeGoogleStrategy,
  handleOAuthCallback,
  validateOAuthRole
};
