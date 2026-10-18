/**
 * Express Application Setup
 * Configures Express app with middleware and routes
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');

// Configuration
const { CORS_ORIGINS } = require('./config/constants');
const { isProduction } = require('./config/environment');
const { createLogger } = require('./utils/logger');

// Logger
const appLogger = createLogger('APP');

// Middleware
const { generalLimiter, authLimiter, passwordResetLimiter, signupOtpResendLimiter } = require('./middleware/rateLimit.middleware');
const { publicRoute } = require('./authz');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const { validateRegistration, validateLogin, validatePasswordReset } = require('./middleware/validation.middleware');
const { verifyToken, optionalAuth } = require('./middleware/auth.middleware');

// Controllers
const authController = require('./controllers/auth.controller');
const profileController = require('./controllers/profile.controller');

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

// prerender-node used to be mounted here, ahead of everything else. On an
// API server it does nothing useful — crawlers fetch the Vercel-hosted
// frontend, not api.veraawell.com — and with no token configured it
// forwarded every request with a bot-like User-Agent to the public
// prerender service, request path and all, before CORS, rate limiting or
// auth had run. SEO prerendering, if wanted, belongs on the frontend host.

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
  // X-CSRF-Token is what client/src/utils/csrfFetchInterceptor.ts sets on
  // every POST/PUT/PATCH/DELETE. It is not a CORS-safelisted header, so the
  // browser asks for it in the preflight and refuses to send the request when
  // it is absent from this list — which made every mutation in production
  // (Vercel frontend -> api.veraawell.com) fail before it left the browser.
  // Development never saw it: Vite's proxy makes those requests same-origin.
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-CSRF-Token'],
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
// See middleware/csrf.middleware.js for the full rationale. The token is
// minted only by GET /api/csrf-token below — it used to be minted by
// middleware on any cookie-less request, and concurrent first requests each
// set a different one — and verifyCSRF requires it to be echoed back in a
// header on state-changing (non-GET/HEAD/OPTIONS) requests.
//
// The endpoints excluded from verification — pre-session sign-in and
// recovery, the Razorpay webhook, the public document uploads — are listed
// one by one, with the reasons, as CSRF_EXEMPT_PATHS in that file. The list
// lives there rather than here so the tests check the list the app actually
// uses instead of a copy of it.
const { issueCsrfToken, csrfProtection } = require('./middleware/csrf.middleware');
app.use('/api', csrfProtection);

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
app.get('/api/csrf-token', issueCsrfToken);

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

// No server-side sessions. Sign-in is the JWT cookie, and the one thing a
// session ever carried — Google sign-in's state across Google's redirect — is
// a signed cookie now (services/oauth.service.js). express-session, its Mongo
// store and passport.session() used to sit here; in production the store
// never saved a row, so they did nothing but hold a second Mongo connection
// open, until Google sign-in came to depend on them and broke.
app.use(passport.initialize());

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
//
// Unauthenticated, so it answers "is it up, can it reach the database" and
// nothing else. It used to publish which secrets were configured
// (hasJwtSecret, hasMongoUri, the Google OAuth pair) — a free map of the
// deployment's configuration for anyone probing it. A debug sibling,
// GET /api/test-google-routes, did the same for OAuth and is gone.
app.get('/api/health', (req, res) => {
  const { isConnected } = require('./config/database');

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    mongoConnected: isConnected()
  });
});

// Authentication routes
app.post('/api/auth/validate-registration', validateRegistration, (req, res) => {
  res.json({ success: true, message: 'Validation successful' });
});
app.post('/api/auth/register', validateRegistration, authController.register);
app.post('/api/auth/verify-signup', authController.verifySignup);
// The signup screen's "Resend code" button. Pre-session, so public by
// necessity; bounded by the email+IP limiter here and the per-signup resend
// cap in the controller.
app.post('/api/auth/resend-signup-otp',
  signupOtpResendLimiter,
  publicRoute('signup verification: resend a code to a pending, unverified signup'),
  authController.resendSignupOtp);
app.post('/api/auth/login', validateLogin, authController.login);
// Signing out needs no valid session: a token that has expired, or been
// retired by a password change, still sits in the browser as a cookie, and
// only this response can clear it. It used to be behind verifyToken, so
// exactly those sessions got a 401 and kept their dead cookie.
app.post('/api/auth/logout',
  optionalAuth,
  publicRoute('sign out: clears the session cookie whether or not it is still valid'),
  authController.logout);
app.post('/api/auth/forgot-password', authController.forgotPassword);
app.post('/api/auth/reset-password', validatePasswordReset, authController.resetPassword);
app.put('/api/auth/update-password', verifyToken, authController.updatePassword);
app.delete('/api/auth/delete-account', verifyToken, authController.deleteAccount);
app.get('/api/auth/profile', verifyToken, authController.getProfile);
// The client's "am I signed in?" check. When the answer is no, the cookie
// that failed is cleared in the same response, so a dead session ends here
// instead of being re-sent (and re-refused) on every request until it
// expires.
app.get('/api/protected', verifyToken, authController.getProtected, authController.clearRefusedSession);

// Profile routes
// Profile routes
app.get('/api/profile/setup', verifyToken, profileController.getProfile);
app.post('/api/profile/setup', verifyToken, profileController.setupProfile);
app.put('/api/profile', verifyToken, profileController.updateProfile);
app.get('/api/profile/status', verifyToken, profileController.getProfileStatus);
app.patch('/api/profile/pricing', verifyToken, profileController.updatePricing);

// The practitioner's drawn signature, used on their generated reports.
// Policy is declared on the route line — the older /api/profile routes above
// predate that convention and are grandfathered in authz/UNDECLARED.js, which
// only ever shrinks, so nothing new may be added to it. All three are
// self-scoped by req.actor.id inside the handler: there is no addressable
// other-doctor resource here, which makes the role gate the whole policy.
const { requireRole } = require('./authz');
app.get('/api/profile/signature', verifyToken, requireRole('doctor'), profileController.getSignature);
app.put('/api/profile/signature', verifyToken, requireRole('doctor'), profileController.saveSignature);
app.delete('/api/profile/signature', verifyToken, requireRole('doctor'), profileController.deleteSignature);


// Patient profile route (alias for backward compatibility)
app.post('/api/auth/patient-profile', verifyToken, profileController.setupProfile);


// Google OAuth routes
const { getOAuthConfig } = require('./config/auth');
const oauthConfig = getOAuthConfig();

// The handlers live in services/oauth.service.js, where they are tested
// against a stubbed Google. Without Google configured, both send the person
// back to the login page with a message instead of a bare JSON error.
if (oauthConfig.enabled) {
  app.get('/api/auth/google', oauthService.startGoogleSignIn);
  app.get('/api/auth/google/callback', oauthService.finishGoogleSignIn);
} else {
  app.get('/api/auth/google', oauthService.googleUnavailable);
  app.get('/api/auth/google/callback', oauthService.googleUnavailable);
}


app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/approvals', adminApprovalRoutes);
app.use('/api/admin/payments', require('./routes/adminPayments.routes'));

// Payouts. Two mount points on purpose: the doctor-facing half sits behind
// verifyToken, the admin half behind verifyAdminToken. Sharing one router
// across both auth realms is how a route ends up reachable from the wrong one.
const payoutRoutes = require('./routes/payouts');
app.use('/api/payouts', payoutRoutes);
app.use('/api/admin/payments/payouts', payoutRoutes.adminRouter);


// Three admin "maintenance" endpoints used to be mounted here, and are gone:
//  - POST /api/admin/cleanup-sessions ran deleteMany({}) on the `sessions`
//    collection. It was written to clear express-session's login store, but
//    that store shared the collection with the therapy Session model (see
//    config/database.js), so it deleted every booking, payment record and
//    refund trail on the platform — and outside production a plain admin
//    could call it.
//  - POST /api/admin/fix-doctor-approvals bulk-reset approved doctors to
//    pending, de-listing practitioners mid-schedule.
//  - GET /api/admin/debug-pending-doctors duplicated
//    /api/admin/approvals/doctors/pending.

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

// /api/otp/{send,verify,resend} — a second, standalone email-OTP system —
// used to be mounted here. Signup verifies through the PendingUser code at
// /api/auth/verify-signup; nothing in the client called these, and they were
// an unauthenticated way to make the server send email to any address.

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
