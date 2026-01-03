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
    ? "https://veraawell-backend.onrender.com/api/auth/google/callback"
    : `http://localhost:${process.env.PORT || 8000}/api/auth/google/callback`;

  passport.use(new GoogleStrategy({
    clientID: oauthConfig.clientId,
    clientSecret: oauthConfig.clientSecret,
    callbackURL: callbackURL
  }, async function (accessToken, refreshToken, profile, cb) {
    try {
      logger.debug('Google profile received', {
        id: profile.id,
        email: profile.emails?.[0]?.value
      });

      // Check if user exists
      let user = await User.findOne({ googleId: profile.id });

      if (!user) {
        // Create new user
        const firstName = profile.name?.givenName || profile.displayName || 'Google';
        const lastName = profile.name?.familyName || 'User';
        const role = 'patient'; // Default role

        user = new User({
          googleId: profile.id,
          email: profile.emails[0].value,
          firstName: firstName,
          lastName: lastName,
          username: profile.emails[0].value,
          password: 'google-auth-' + Math.random().toString(36).substring(7),
          role: role
        });
        await user.save();
        logger.info('New Google user created', { email: user.email });
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

    // Update user's role if different
    if (requestedRole && requestedRole !== user.role) {
      logger.info('Updating user role', {
        from: user.role,
        to: requestedRole
      });
      user.role = requestedRole;
      await user.save();
    }

    // Generate token
    const token = generateToken(user);

    // Set cookie (HTTP-only, secure)
    setAuthCookie(res, token);

    logger.info('OAuth authentication successful', {
      userId: user._id.toString().substring(0, 8),
      email: user.email
    });

    // Redirect to frontend WITHOUT token in URL (security fix)
    // Token is in HTTP-only cookie, frontend will check cookie
    const frontendBaseUrl = getFrontendUrl();
    const redirectUrl = new URL(frontendBaseUrl);
    redirectUrl.searchParams.set('auth', 'success');
    redirectUrl.searchParams.set('role', user.role);
    redirectUrl.searchParams.set('isGoogle', 'true');
    // NO token in URL - security vulnerability fixed

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
