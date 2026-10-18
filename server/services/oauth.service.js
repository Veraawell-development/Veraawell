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
 * Where passport-oauth2 keeps the `state` nonce in the session. Named
 * explicitly so the callback route in app.js can carry it across the session
 * regeneration it does before verifying.
 */
const GOOGLE_STATE_KEY = 'oauth2:accounts.google.com';

/**
 * Why a Google sign-in is refused, as the `?error=` code the login page
 * explains. Everything a password login refuses is refused here too: this
 * used to issue a session to any account Google vouched for, so a pending or
 * rejected practitioner, a suspended account or an admin got in through the
 * Google button that the password form would have stopped.
 */
function refusalFor(user) {
  if (['admin', 'super_admin'].includes(user.role)) return 'admin-account';
  if (user.status && user.status !== 'active') return 'account-suspended';
  if (user.role === 'doctor' && user.approvalStatus === 'rejected') return 'account-rejected';
  if (user.role === 'doctor' && user.approvalStatus !== 'approved') return 'account-pending';
  return null;
}

/** An error the strategy raises to refuse a sign-in with a specific code. */
function refusal(code) {
  const error = new Error(code);
  error.oauthRefusal = code;
  return error;
}

/**
 * The login-page address for a failed or refused Google sign-in.
 */
function failureRedirect(code = 'google-auth-failed') {
  const url = new URL('/login', getFrontendUrl());
  url.searchParams.set('error', code);
  return url.toString();
}

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
    // A nonce in the session, checked on the way back. Without it the
    // callback accepted any authorization code, so a link carrying the
    // attacker's own code signed the victim in to the attacker's account
    // (login CSRF) — and on a mental-health platform whatever they then
    // wrote, journal and assessments included, went to that account.
    state: true,
    sessionKey: GOOGLE_STATE_KEY,
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
            logger.warn('Refusing an unverified Google email for an existing account', { email });
            return cb(refusal('google-email-unverified'), null);
          }
          // Signed in, NOT linked. Writing googleId onto the account used to
          // switch its password off for good: password login and "forgot
          // password" both refuse any account with a googleId, so one click
          // on the Google button cost a patient their password — and a
          // practitioner applicant, refused at the next step as pending,
          // their only way in once approved. Google has vouched for the
          // address, which is what matching on it here relies on.
          logger.info('Existing account signed in with Google', { email: existing.email });
          return cb(null, existing);
        }

        // Practitioners apply through the careers page, with a licence and
        // documents for an admin to review. A Google account carries none of
        // that, so ?role=doctor used to create an empty application that
        // could only ever be rejected. The button is not offered to
        // doctors; this covers the URL.
        const intent = req.session && req.session.oauthRole;
        if (intent === 'doctor') {
          logger.info('Refused to create a practitioner account through Google', { email });
          return cb(refusal('google-doctor-signup'), null);
        }

        const firstName = profile.name?.givenName || profile.displayName || 'Google';
        const lastName = profile.name?.familyName || 'User';
        const role = 'patient';

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
          approvalStatus: 'approved'
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

    const refused = refusalFor(user);
    if (refused) {
      logger.warn('Google sign-in refused', {
        userId: user._id.toString().substring(0, 8),
        reason: refused
      });
      return res.redirect(failureRedirect(refused));
    }

    // Generate token
    const token = generateToken(user);

    // Set cookie (HTTP-only, secure)
    setAuthCookie(res, token);

    logger.info('OAuth authentication successful', {
      userId: user._id.toString().substring(0, 8),
      email: user.email
    });

    // Redirect to frontend. The session travels in the cookie set above:
    // veraawell.com and api.veraawell.com are the same site, so no browser
    // treats it as a third-party cookie. The token used to ride along in the
    // URL as a "fallback", which put a 30-day credential into the frontend
    // host's access logs on every Google sign-in.
    const redirectUrl = new URL(getFrontendUrl());
    redirectUrl.searchParams.set('auth', 'success');
    redirectUrl.searchParams.set('role', user.role);

    return res.redirect(redirectUrl.toString());
  } catch (error) {
    logger.error('OAuth callback error', { error: error.message });
    return res.redirect(failureRedirect('google-auth-failed'));
  }
}

/**
 * GET /api/auth/google — the Google button. The role is only a signup intent
 * (see the strategy); it is carried across Google's redirect in the session,
 * next to passport's state nonce.
 */
function startGoogleSignIn(req, res, next) {
  const role = req.query.role || 'patient';
  if (!['patient', 'doctor'].includes(role)) {
    return res.redirect(failureRedirect('google-auth-failed'));
  }

  req.session.oauthRole = role;

  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })(req, res, next);
}

/**
 * GET /api/auth/google/callback — Google sends the person back here.
 * Every way this can end lands them on a page of ours: signed in, or the
 * login page with a code it explains. None of them is a bare JSON error on
 * the API host.
 */
function finishGoogleSignIn(req, res) {
  const role = req.session.oauthRole || 'patient';
  // The state nonce GET /api/auth/google stored. Regenerating the session
  // (against fixation) would otherwise drop it before passport checks it.
  const pendingState = req.session[GOOGLE_STATE_KEY];

  req.session.regenerate((regenerateError) => {
    if (regenerateError) {
      logger.error('Could not regenerate the session for a Google sign-in', { error: regenerateError.message });
      return res.redirect(failureRedirect('google-auth-failed'));
    }

    req.session.oauthRole = role;
    if (pendingState) req.session[GOOGLE_STATE_KEY] = pendingState;

    return passport.authenticate('google', async (err, user) => {
      // The session existed only to carry the role and the nonce across
      // Google's redirect; it has nothing left to do.
      req.session.destroy(() => {});

      if (err || !user) {
        // Cancelling on Google's consent screen comes back as
        // ?error=access_denied — not a failure worth alarming anyone about.
        const code = (err && err.oauthRefusal)
          || (req.query.error === 'access_denied' ? 'google-cancelled' : 'google-auth-failed');
        if (err && !err.oauthRefusal) logger.warn('Google sign-in failed', { error: err.message });
        return res.redirect(failureRedirect(code));
      }

      return handleOAuthCallback(req, res, user, role);
    })(req, res, () => res.redirect(failureRedirect('google-auth-failed')));
  });
}

/** Both Google routes, when this deployment has no Google credentials. */
function googleUnavailable(req, res) {
  res.redirect(failureRedirect('google-unavailable'));
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
  GOOGLE_STATE_KEY,
  refusalFor,
  failureRedirect,
  startGoogleSignIn,
  finishGoogleSignIn,
  googleUnavailable,
  initializeGoogleStrategy,
  handleOAuthCallback,
  validateOAuthRole
};
