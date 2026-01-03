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
const sessionToolsRoutes = require('./routes/sessionTools');
const doctorStatusRoutes = require('./routes/doctor-status');
const mentalHealthAssessmentRoutes = require('./routes/mentalHealthAssessment');

const app = express();

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

// Handle preflight OPTIONS requests explicitly for all routes
// Using /.* instead of * to avoid path-to-regexp parse error
app.options(/.*/, (req, res) => {
  appLogger.debug('CORS: Handling OPTIONS preflight request', {
    origin: req.headers.origin,
    method: req.method,
    path: req.path
  });
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(204);
});

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
}

// Request timeout middleware (30 seconds)
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  res.setTimeout(30000, () => {
    res.status(408).json({ error: 'Response timeout' });
  });
  next();
});

// Body parsing middleware
app.use(express.json());
app.use(cookieParser());

// Input sanitization - prevent NoSQL injection
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    appLogger.warn('Removed prohibited key from request', { key, url: req.originalUrl });
  }
}));

// Session middleware with MongoDB store
const sessionStore = createSessionStore();
app.use(session({
  secret: getSessionSecret(),
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: getSessionCookieConfig()
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

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
app.post('/api/auth/register', validateRegistration, authController.register);
app.post('/api/auth/login', validateLogin, authController.login);
app.post('/api/auth/logout', verifyToken, authController.logout);
app.post('/api/auth/forgot-password', authController.forgotPassword);
app.post('/api/auth/reset-password', validatePasswordReset, authController.resetPassword);
app.get('/api/auth/profile', verifyToken, authController.getProfile);
app.get('/api/protected', verifyToken, authController.getProtected);

// Profile routes
app.get('/api/profile/setup', verifyToken, profileController.getProfile);
app.post('/api/profile/setup', verifyToken, profileController.setupProfile);
app.get('/api/profile/status', verifyToken, profileController.getProfileStatus);


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
      scope: ['profile', 'email']
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

// Admin routes
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/approvals', adminApprovalRoutes);

// Protected admin debug/maintenance endpoints
app.post('/api/admin/cleanup-sessions', verifyAdminToken, adminController.cleanupSessions);
app.post('/api/admin/fix-doctor-approvals', verifyAdminToken, adminController.fixDoctorApprovals);
app.get('/api/admin/debug-pending-doctors', verifyAdminToken, adminController.debugPendingDoctors);

// Application routes
app.use('/api/sessions', sessionRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/session-tools', sessionToolsRoutes);
app.use('/api/doctor-status', doctorStatusRoutes);
app.use('/api/assessments', mentalHealthAssessmentRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
