/**
 * OAuth Service
 * Handles Google OAuth authentication
 */

const crypto = require('crypto');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/user');
const { getOAuthConfig, getFrontendUrl, getSessionSecret } = require('../config/auth');
const { isProduction } = require('../config/environment');
const { generateToken, setAuthCookie } = require('./auth.service');
const { createLogger } = require('../utils/logger');
const { ValidationError } = require('../utils/errors');

const logger = createLogger('OAUTH');

/**
 * The Google round trip's own state: a nonce (checked against the `state`
 * Google hands back, so a callback this browser never started is refused —
 * login CSRF) and the signup intent from the button. It lives in a signed,
 * short-lived cookie scoped to the two Google routes, not in a server-side
 * session.
 *
 * It used to live in express-session, backed by a Mongo store. In production
 * that store never saved a row — each request got a fresh session — which
 * went unnoticed while the session only carried an optional role. The day
 * the state check came to depend on it, every Google sign-in failed. A
 * cookie needs no store: the browser carries it to Google and back.
 *
 * SameSite=Lax is enough: Google returns the person with a top-level GET,
 * and Lax cookies travel on those.
 */
const STATE_COOKIE = 'vw_google';
const STATE_TTL_MS = 10 * 60 * 1000;

function stateCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/api/auth/google',
    maxAge: STATE_TTL_MS
  };
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

/** The payload of a cookie this server signed, or null. */
function readState(value) {
  if (typeof value !== 'string' || value.length > 512) return null;
  const [body, mac] = value.split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
}

function sameString(x, y) {
  if (typeof x !== 'string' || typeof y !== 'string') return false;
  const a = Buffer.from(x);
  const b = Buffer.from(y);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * passport-oauth2's state store interface, over the cookie above. A failure
 * carries the login-page code to show (see finishGoogleSignIn).
 */
const cookieStateStore = {
  store(req, meta, callback) {
    const nonce = crypto.randomBytes(24).toString('base64url');
    const intent = req.googleIntent === 'doctor' ? 'doctor' : 'patient';
    req.res.cookie(STATE_COOKIE, signState({ n: nonce, r: intent, t: Date.now() }), stateCookieOptions());
    callback(null, nonce);
  },

  verify(req, providedState, meta, callback) {
    const saved = readState(req.cookies && req.cookies[STATE_COOKIE]);
    if (!saved) {
      return callback(null, false, { code: 'google-expired', message: 'No Google sign-in was started in this browser' });
    }
    if (typeof saved.t !== 'number' || Date.now() - saved.t > STATE_TTL_MS) {
      return callback(null, false, { code: 'google-expired', message: 'The Google sign-in took too long' });
    }
    if (!sameString(saved.n, providedState)) {
      return callback(null, false, { code: 'google-expired', message: 'Google returned a different state than this browser started with' });
    }
    req.googleIntent = saved.r === 'doctor' ? 'doctor' : 'patient';
    return callback(null, true);
  }
};

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
    // A nonce, checked on the way back. Without it the callback accepted
    // any authorization code, so a link carrying the attacker's own code
    // signed the victim in to the attacker's account (login CSRF) — and on a
    // mental-health platform whatever they then wrote, journal and
    // assessments included, went to that account.
    store: cookieStateStore,
    // Needed so the strategy can read the signup intent the state store
    // restored (req.googleIntent). It is applied only when creating a
    // brand-new account — never to an existing one.
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
        if (req.googleIntent === 'doctor') {
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
 * (see the strategy); the state store carries it across Google's redirect.
 */
function startGoogleSignIn(req, res, next) {
  const role = req.query.role || 'patient';
  if (!['patient', 'doctor'].includes(role)) {
    return res.redirect(failureRedirect('google-auth-failed'));
  }

  req.googleIntent = role;

  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })(req, res, next);
}

/**
 * GET /api/auth/google/callback — Google sends the person back here.
 * Every way this can end lands them on a page of ours: signed in, or the
 * login page with a code it explains. None of them is a bare JSON error on
 * the API host. Every failure is logged with its reason.
 */
function finishGoogleSignIn(req, res) {
  // One use only, whatever happens next.
  const { maxAge, ...clearOptions } = stateCookieOptions();
  res.clearCookie(STATE_COOKIE, clearOptions);

  const fail = (code, reason) => {
    logger.warn('Google sign-in did not complete', { code, reason });
    return res.redirect(failureRedirect(code));
  };

  return passport.authenticate('google', async (err, user, info) => {
    if (err) {
      if (err.oauthRefusal) return res.redirect(failureRedirect(err.oauthRefusal));
      return fail('google-auth-failed', err.message);
    }
    if (!user) {
      // Cancelling on Google's consent screen comes back as
      // ?error=access_denied.
      if (req.query.error === 'access_denied') return res.redirect(failureRedirect('google-cancelled'));
      return fail((info && info.code) || 'google-auth-failed', (info && info.message) || String(req.query.error || 'no user'));
    }

    try {
      return await handleOAuthCallback(req, res, user, req.googleIntent || 'patient');
    } catch (callbackError) {
      return fail('google-auth-failed', callbackError.message);
    }
  })(req, res, () => fail('google-auth-failed', 'passport passed the request on'));
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
  STATE_COOKIE,
  stateCookieOptions,
  refusalFor,
  failureRedirect,
  startGoogleSignIn,
  finishGoogleSignIn,
  googleUnavailable,
  initializeGoogleStrategy,
  handleOAuthCallback,
  validateOAuthRole
};
