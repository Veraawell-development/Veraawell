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
  // Per IP, across all of /api. This was 100 per 15 minutes, which ordinary
  // use exceeds on its own: the client polls /api/chat/unread-count every 10
  // seconds (90 requests per window before the user does anything), and a
  // dashboard load is a dozen more. Signed-in users were hitting 429 inside
  // a quarter of an hour, and users behind one carrier-grade NAT or office
  // network share the budget. This limiter is a flood guard, not an auth
  // control — the strict limits are AUTH and PASSWORD_RESET below.
  GENERAL: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: {
      production: 1000,
      development: 10000
    }
  },
  // Failed sign-ins and failed signup codes. It used to be one counter of 5
  // failures per 15 minutes per IP, shared by login, register and
  // verify-signup (and the admin login). Mobile carriers here put thousands
  // of people behind one carrier-grade NAT address, so a handful of strangers'
  // typos locked everyone on that network out — and one person's mistyped
  // password plus a mistyped code was enough to lock themselves out. Now two
  // budgets: a tight one per account on that network (the brute-force guard)
  // and a loose one per network (the password-spraying guard). Successful
  // requests are not counted.
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: {
      perAccount: { production: 10, development: 1000 },
      perIp: { production: 100, development: 10000 }
    },
    skipSuccessfulRequests: true
  },
  // POST /api/auth/register mails a code to whatever address it is given, and
  // succeeds for each new one — so it was not limited at all (only failures
  // counted), and could send unbounded codes to strangers' inboxes. Every
  // request counts here. Per-address resends are capped separately
  // (MAX_SIGNUP_OTP_RESENDS).
  SIGNUP: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: {
      production: 30,
      development: 10000
    }
  },
  // Reset-link requests send email to an address the caller names, so this
  // is also what stops the endpoint being used to mail-bomb someone. Per
  // address (the mail-bomb guard), plus a looser cap per network. It was 3
  // per hour per IP — shared by everyone behind the same mobile-carrier NAT.
  PASSWORD_RESET: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: {
      perAddress: { production: 3, development: 1000 },
      perIp: { production: 30, development: 10000 }
    }
  },
  // "Resend code" on the signup screen. Keyed on email + IP: the per-signup
  // resend cap (MAX_SIGNUP_OTP_RESENDS) bounds guesses on one code sequence,
  // and this bounds how often anyone can make the server mail an address.
  SIGNUP_OTP_RESEND: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: {
      production: 5,
      development: 1000
    }
  },
  // The doctor-document upload endpoints are intentionally public (a career-page
  // applicant uploads verification documents before they have an account), so
  // they can't be gated behind verifyToken like other upload routes — this
  // limiter is the actual abuse guard for that public surface.
  PUBLIC_UPLOAD: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: {
      production: 20,
      development: 1000
    }
  },
  // The enquiry form is public by necessity — nobody filling it in has an
  // account yet — so this limiter is its only abuse guard. Keyed on the
  // submitted email where present, falling back to IP.
  ENQUIRY: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: {
      production: 5,
      development: 1000
    }
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
  MIN_LENGTH: 6,
  MAX_LENGTH: 72,
  REQUIRE_UPPERCASE: false,
  REQUIRE_LOWERCASE: false,
  REQUIRE_NUMBER: false,
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
