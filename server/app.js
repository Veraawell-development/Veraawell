/**
 * Express Application Setup
 * Configures Express app with middleware and routes
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');

// Configuration
const { CORS_ORIGINS } = require('./config/constants');
const { createSessionStore } = require('./config/database');
const { getSessionSecret, getSessionCookieConfig } = require('./config/auth');
const { isProduction } = require('./config/environment');
const { createLogger } = require('./utils/logger');

// Logger
const appLogger = createLogger('APP');

// Middleware
const { generalLimiter, authLimiter, passwordResetLimiter } = require('./middleware/rateLimit.middleware');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const { validateRegistration, validateLogin, validatePasswordReset } = require('./middleware/validation.middleware');
const { verifyToken, verifyAdminToken } = require('./middleware/auth.middleware');

// Controllers
const authController = require('./controllers/auth.controller');
const profileController = require('./controllers/profile.controller');
const adminController = require('./controllers/admin.controller');

// Services
const oauthService = require('./services/oauth.service');

// Routes
const adminAuthRoutes = require('./routes/admin/auth');
const adminApprovalRoutes = require('./routes/admin/approvals');
const sessionRoutes = require('./routes/sessions');
const availabilityRoutes = require('./routes/availability');
const chatRoutes = require('./routes/chat');
const patientRoutes = require('./routes/patients');
const reviewRoutes = require('./routes/reviews');
const enquiryRoutes = require('./routes/enquiries');
const sessionToolsRoutes = require('./routes/sessionTools');
const doctorStatusRoutes = require('./routes/doctor-status');
const mentalHealthAssessmentRoutes = require('./routes/mentalHealthAssessment');
const uploadRoutes = require('./routes/upload');
const sessionReportsRoutes = require('./routes/sessionReports');

const app = express();

// SEO Prerendering (Intercept bots before other middleware)
const prerender = require('prerender-node');
// In production, set your prerender token here or via ENV
// prerender.set('prerenderToken', process.env.PRERENDER_TOKEN);
app.use(prerender);

// Custom branding headers (The "Hacker" signature)
app.disable('x-powered-by'); // Remove default Express header for security
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'Veraawell Core');
  res.setHeader('X-Author', 'Abhigyan ( IIIT Delhi 27 )');
  res.setHeader('X-Developer', 'Abhigyan ( IIIT Delhi 27 )');
  next();
});

// Trust proxy - CRITICAL for rate limiting behind Render proxy
app.set('trust proxy', 1);

// CORS configuration - MUST be before other middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      appLogger.debug('CORS: Allowing request with no origin');
      return callback(null, true);
    }

    if (CORS_ORIGINS.indexOf(origin) !== -1) {
      appLogger.debug('CORS: Allowing whitelisted origin', { origin });
      callback(null, true);
    } else if (!isProduction()) {
      // In development, allow all origins for easier debugging
      appLogger.warn('CORS: Allowing non-whitelisted origin in development', { origin, allowedOrigins: CORS_ORIGINS });
      callback(null, true);
    } else {
      appLogger.warn('CORS: Blocked origin', { origin, allowedOrigins: CORS_ORIGINS });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Note: a manual `app.options(/.*/, ...)` preflight handler used to live here,
// unconditionally reflecting `req.headers.origin` regardless of the whitelist
// above. With `preflightContinue: false` set on cors() (line 99), the cors()
// middleware already fully handles OPTIONS preflight requests itself and does
// not call next() for them — so that second handler was both unreachable
// under normal operation and, if it were ever reached, a real whitelist
// bypass. Removed rather than left as dead-but-wrong policy.

// Security: Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable for now to avoid breaking existing functionality
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Performance: Compression middleware
app.use(compression());

// Rate limiting
if (isProduction()) {
  app.use('/api/', generalLimiter);
  appLogger.info('Rate limiting enabled for production');
} else {
  appLogger.warn('Rate limiting DISABLED for development');
}

// Stricter rate limiting for auth endpoints
if (isProduction()) {
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/forgot-password', passwordResetLimiter);
  // Signup OTP verification previously had no rate limit at all — a 6-digit
  // code with unlimited guesses is brute-forceable in well under a minute.
  app.use('/api/auth/verify-signup', authLimiter);
}

// Request timeout middleware (60 seconds)
app.use((req, res, next) => {
  req.setTimeout(60000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  res.setTimeout(60000, () => {
    res.status(408).json({ error: 'Response timeout' });
  });
  next();
});

// Body parsing middleware
// 1mb is sufficient for JSON payloads. Upload routes handle their own multipart limits.
// `verify` stashes the raw request bytes on req.rawBody — the Razorpay webhook
// handler needs to HMAC-verify against the exact bytes Razorpay signed, not a
// JSON.stringify(req.body) reconstruction, which isn't guaranteed byte-identical
// (key order, numeric formatting, unicode escaping can all differ) and can cause
// legitimate webhooks to intermittently fail signature verification.
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ── CSRF protection (double-submit cookie) ──────────────────────────────────
// See middleware/csrf.middleware.js for the full rationale. issueCsrfToken
// runs on every request so any page load hands the browser a token before it
// ever needs to submit one; verifyCSRF then requires that token to be echoed
// back in a header on state-changing (non-GET/HEAD/OPTIONS) requests.
//
// Excluded from verification, deliberately:
//  - /api/payments/webhook: authenticated via Razorpay's HMAC signature, not
//    cookies — Razorpay's servers cannot supply a CSRF token, and don't need to.
//  - /api/auth/* and /api/admin/auth/*: pre-session bootstrap (login/register/
//    verify-signup/forgot-password/reset-password) — there is no authenticated
//    session yet for a cross-site request to ride along on, so the CSRF threat
//    model this protects against doesn't apply here the way it does to
//    already-authenticated actions (booking, cancelling, profile changes, etc).
//  - /api/upload/doctor-document(s): intentionally public, unauthenticated
//    endpoints (a career-page applicant uploads documents before they have an
//    account or any session cookie — see the note in routes/upload.js).
const { issueCsrfToken, verifyCSRF } = require('./middleware/csrf.middleware');
// NOTE: req.path inside `app.use('/api', ...)` is relative to the '/api'
// mount point (Express strips the matched prefix, same as it does for a
// Router) — these must NOT include the leading '/api' or they will never match.
const CSRF_EXEMPT_PREFIXES = [
  '/payments/webhook',
  '/auth/',
  '/admin/auth/',
  '/upload/doctor-document'
];
app.use(issueCsrfToken);
app.use('/api', (req, res, next) => {
  if (CSRF_EXEMPT_PREFIXES.some(p => req.path.startsWith(p))) return next();
  return verifyCSRF(req, res, next);
});

// The frontend and API are on different origins in production
// (veraawell.vercel.app vs api.veraawell.com) — client-side JS on the
// frontend's page cannot read a cookie that was set for the API's domain via
// document.cookie (cookies are only readable by script running on the same
// origin that set them), even though the browser will still attach that
// cookie automatically on requests to the API (SameSite=None allows that).
// So the client can't self-serve the token value out of document.cookie the
// way a same-origin double-submit-cookie setup normally would; instead it
// fetches the value once from this endpoint's response body (readable
// cross-origin here because the server's CORS policy explicitly allows the
// whitelisted frontend origin to read it — an attacker's origin is not
// whitelisted, so their page can't read this response even if they trigger
// the request) and echoes that value back as the X-CSRF-Token header on
// subsequent mutating requests. See client/src/utils/csrfToken.ts.
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.cookies.csrfToken });
});

// HTTP request logging (development only)
if (!isProduction()) {
  // ANSI helpers
  const R = '\x1b[0m';
  const D = '\x1b[2m';
  const B = '\x1b[1m';
  const METHOD_COLORS = { GET: '\x1b[32m', POST: '\x1b[34m', PUT: '\x1b[33m', PATCH: '\x1b[35m', DELETE: '\x1b[31m' };
  const STATUS_COLOR  = (s) => s >= 500 ? '\x1b[31m' : s >= 400 ? '\x1b[33m' : s >= 300 ? '\x1b[36m' : '\x1b[32m';

  morgan.token('colored-method', (req) => {
    const c = METHOD_COLORS[req.method] || '';
    return `${c}${B}${req.method.padEnd(6)}${R}`;
  });
  morgan.token('colored-status', (req, res) => {
    const s = res.statusCode;
    return `${STATUS_COLOR(s)}${B}${s}${R}`;
  });
  morgan.token('short-url', (req) => req.originalUrl);

  const httpFormat = ':colored-method :short-url :colored-status :response-time ms';
  app.use(morgan(httpFormat, {
    skip: (req) => {
      // Skip socket.io polling noise and health checks
      return req.originalUrl.includes('socket.io') || req.originalUrl === '/health';
    }
  }));
}

// Input sanitization - prevent NoSQL injection
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    appLogger.warn('Removed prohibited key from request', { key, url: req.originalUrl });
  }
}));

// Session middleware with MongoDB store
// Using a lazy store or initializing early to ensure routes have access to req.session
const sessionStore = createSessionStore();

app.use(session({
  secret: getSessionSecret(),
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: getSessionCookieConfig()
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

appLogger.info('Session and Passport middleware initialized');

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const User = require('./models/user');
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Initialize Google OAuth strategy
oauthService.initializeGoogleStrategy();

// Health check route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Veraawell Backend is running!',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const { isConnected } = require('./config/database');
  const { getOAuthConfig } = require('./config/auth');
  const oauthConfig = getOAuthConfig();

  res.json({
    success: true,
    message: 'Backend is running',
    timestamp: new Date().toISOString(),
    mongoConnected: isConnected(),
    googleOAuthEnabled: oauthConfig.enabled,
    envVars: {
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      hasMongoUri: !!process.env.MONGO_URI,
      hasJwtSecret: !!process.env.JWT_SECRET
    }
  });
});

// Test Google OAuth routes endpoint
app.get('/api/test-google-routes', (req, res) => {
  const { getOAuthConfig } = require('./config/auth');
  const oauthConfig = getOAuthConfig();

  res.json({
    success: true,
    googleOAuthEnabled: oauthConfig.enabled,
    routes: {
      '/api/auth/google': 'Available',
      '/api/auth/google/callback': 'Available'
    }
  });
});

// Authentication routes
app.post('/api/auth/validate-registration', validateRegistration, (req, res) => {
  res.json({ success: true, message: 'Validation successful' });
});
app.post('/api/auth/register', validateRegistration, authController.register);
app.post('/api/auth/verify-signup', authController.verifySignup);
app.post('/api/auth/login', validateLogin, authController.login);
app.post('/api/auth/logout', verifyToken, authController.logout);
app.post('/api/auth/forgot-password', authController.forgotPassword);
app.post('/api/auth/reset-password', validatePasswordReset, authController.resetPassword);
app.put('/api/auth/update-password', verifyToken, authController.updatePassword);
app.delete('/api/auth/delete-account', verifyToken, authController.deleteAccount);
app.get('/api/auth/profile', verifyToken, authController.getProfile);
app.get('/api/protected', verifyToken, authController.getProtected);

// Profile routes
// Profile routes
app.get('/api/profile/setup', verifyToken, profileController.getProfile);
app.post('/api/profile/setup', verifyToken, profileController.setupProfile);
app.put('/api/profile', verifyToken, profileController.updateProfile);
app.get('/api/profile/status', verifyToken, profileController.getProfileStatus);
app.patch('/api/profile/pricing', verifyToken, profileController.updatePricing);


// Patient profile route (alias for backward compatibility)
app.post('/api/auth/patient-profile', verifyToken, profileController.setupProfile);


// Google OAuth routes
const { getOAuthConfig } = require('./config/auth');
const oauthConfig = getOAuthConfig();

if (oauthConfig.enabled) {
  app.get('/api/auth/google', (req, res, next) => {
    const role = req.query.role || 'patient';
    oauthService.validateOAuthRole(role);

    // Store role in session for callback
    req.session.oauthRole = role;

    passport.authenticate('google', {
      scope: ['profile', 'email'],
      prompt: 'select_account'
    })(req, res, next);
  });

  app.get('/api/auth/google/callback', (req, res, next) => {
    const role = req.session.oauthRole || 'patient';

    // Regenerate session to prevent reuse
    req.session.regenerate((err) => {
      if (err) {
        return next(err);
      }

      req.session.oauthRole = role;

      passport.authenticate('google', async (err, user) => {
        if (err || !user) {
          const { getFrontendUrl } = require('./config/auth');
          const frontendUrl = getFrontendUrl();
          return res.redirect(`${frontendUrl}/login?error=google-auth-failed`);
        }

        await oauthService.handleOAuthCallback(req, res, user, role);
      })(req, res, next);
    });
  });
} else {
  // Fallback routes if Google OAuth is not configured
  app.get('/api/auth/google', (req, res) => {
    res.status(400).json({
      success: false,
      message: 'Google OAuth not configured'
    });
  });

  app.get('/api/auth/google/callback', (req, res) => {
    res.status(400).json({
      success: false,
      message: 'Google OAuth not configured'
    });
  });
}


app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/approvals', adminApprovalRoutes);
app.use('/api/admin/payments', require('./routes/adminPayments.routes'));


// Protected admin debug/maintenance endpoints
app.post('/api/admin/cleanup-sessions', verifyAdminToken, adminController.cleanupSessions);
app.post('/api/admin/fix-doctor-approvals', verifyAdminToken, adminController.fixDoctorApprovals);
app.get('/api/admin/debug-pending-doctors', verifyAdminToken, adminController.debugPendingDoctors);

// Application routes
app.use('/api/sessions', sessionRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/enquiries', enquiryRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/session-tools', sessionToolsRoutes);
app.use('/api/doctor-status', doctorStatusRoutes);
app.use('/api/assessments', mentalHealthAssessmentRoutes);
app.use('/api/upload', uploadRoutes);
// /api/ratings (rating.controller.js) was removed: it was a fully separate,
// fully unused rating system — the live RatingModal posts to /reviews/submit
// instead, and this one had zero references anywhere in the client. It also
// independently reimplemented the same doctor-rating-average recalculation
// logic that review.controller.js already does, which is exactly the kind of
// duplicate-but-dead code that's a landmine for whoever edits the wrong copy.
app.use('/api/session-reports', sessionReportsRoutes);

// Article routes
const articleRoutes = require('./routes/articles');
app.use('/api/articles', articleRoutes);

// Payment routes
const paymentRoutes = require('./routes/payment.routes');
app.use('/api/payments', paymentRoutes);

// SEO Routes (Sitemap and Robots.txt)
const seoRoutes = require('./routes/seo');
app.use('/', seoRoutes);

// OTP routes (for email verification during signup)
const otpRoutes = require('./routes/otp');
app.use('/api/otp', otpRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
