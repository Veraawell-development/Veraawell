/**
 * Application Constants
 * Centralized constants used throughout the application
 */

const VALID_ROLES = ['patient', 'doctor', 'admin', 'super_admin'];
const VALID_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
const VALID_USER_STATUSES = ['active', 'suspended'];

const SESSION_STATUSES = ['scheduled', 'in-progress', 'completed', 'cancelled'];
const CALL_STATUSES = ['not-started', 'in-progress', 'completed', 'failed'];

const TOKEN_EXPIRY = {
  ACCESS_TOKEN: '30d', // 30 days
  ADMIN_TOKEN: '8h', // 8 hours for admin
  REFRESH_TOKEN: '90d' // 90 days (for future implementation)
};

const RATE_LIMITS = {
  GENERAL: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: {
      production: 100,
      development: 10000
    }
  },
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: {
      production: 5,
      development: 1000
    },
    skipSuccessfulRequests: true
  }
};

const CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://veraawell.com',
  'https://www.veraawell.com',
  'https://veraawell.vercel.app',
  'https://veraawell-projects-veraawell.vercel.app'
];

// Add FRONTEND_URL from env if present (for flexibility)
if (process.env.FRONTEND_URL) {
  const envUrl = process.env.FRONTEND_URL.replace(/\/$/, ''); // Remove trailing slash
  if (!CORS_ORIGINS.includes(envUrl)) {
    CORS_ORIGINS.push(envUrl);
  }
}

const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBER: true,
  REQUIRE_SPECIAL: false
};

const RESET_TOKEN_EXPIRY = 3600000; // 1 hour in milliseconds

module.exports = {
  VALID_ROLES,
  VALID_APPROVAL_STATUSES,
  VALID_USER_STATUSES,
  SESSION_STATUSES,
  CALL_STATUSES,
  TOKEN_EXPIRY,
  RATE_LIMITS,
  CORS_ORIGINS,
  PASSWORD_POLICY,
  RESET_TOKEN_EXPIRY
};
