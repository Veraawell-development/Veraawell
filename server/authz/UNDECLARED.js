/**
 * Routes that do not yet declare their authorization through server/authz.
 *
 * This is a RATCHET, not a permanent allowlist. __tests__/authz.routeCoverage.test.js
 * asserts two things about it:
 *
 *   1. no route outside this list may be undeclared — so a NEW route without a
 *      policy fails CI immediately;
 *   2. this list may only shrink — so every conversion PR deletes lines from it
 *      and it can never grow back.
 *
 * Being listed here does not mean a route is unprotected. Many of these carry
 * verifyToken plus an in-controller ownership check, and the admin routes carry
 * verifyAdminToken. It means the check is not yet stated on the route line,
 * where it is visible and auditable — which is the condition under which four
 * of them turned out to have no check at all.
 *
 * Generated: node -e "require('./authz/audit').enumerateUndeclaredRoutes(require('./app'))"
 */

module.exports = new Set([
  'DELETE /api/auth/delete-account',
  'GET /',
  'GET /api/admin/approvals/analytics',
  'GET /api/admin/approvals/doctors/all',
  'GET /api/admin/approvals/doctors/pending',
  'GET /api/admin/approvals/statistics',
  'GET /api/admin/auth/status',
  'GET /api/admin/payments/onboarding-requests',
  'GET /api/admin/payments/revenue',
  'GET /api/admin/payments/sessions/failed-refunds',
  'GET /api/admin/payments/settings',
  'GET /api/auth/google',
  'GET /api/auth/google/callback',
  'GET /api/auth/profile',
  'GET /api/availability/doctor/:doctorId',
  'GET /api/availability/doctor/current',
  'GET /api/availability/slots/:doctorId/:date',
  'GET /api/availability/upcoming-sessions',
  'GET /api/csrf-token',
  'GET /api/doctor-status/online-doctors',
  'GET /api/doctor-status/status',
  'GET /api/health',
  'GET /api/patients/doctor-patients',
  'GET /api/patients/emergency-contact',
  'GET /api/payments/onboarding-status',
  'GET /api/profile/setup',
  'GET /api/profile/status',
  'GET /api/protected',
  'GET /api/sessions/delayed',
  'GET /api/sessions/pending-feedback',
  'PATCH /api/profile/pricing',
  'POST /api/admin/approvals/doctors/:doctorId/approve',
  'POST /api/admin/approvals/doctors/:doctorId/reject',
  'POST /api/admin/auth/change-password',
  'POST /api/admin/auth/forgot-password',
  'POST /api/admin/auth/login',
  'POST /api/admin/auth/logout',
  'POST /api/admin/auth/reset-password/:token',
  'POST /api/admin/auth/setup',
  'POST /api/auth/forgot-password',
  'POST /api/auth/login',
  'POST /api/auth/patient-profile',
  'POST /api/auth/register',
  'POST /api/auth/reset-password',
  'POST /api/auth/validate-registration',
  'POST /api/auth/verify-signup',
  'POST /api/availability/save',
  'POST /api/doctor-status/set-offline',
  'POST /api/doctor-status/toggle-online',
  'POST /api/patients/emergency-contact',
  'POST /api/payments/request-onboarding',
  'POST /api/payments/verify',
  'POST /api/payments/webhook',
  'POST /api/profile/setup',
  'PUT /api/auth/update-password',
  'PUT /api/profile'
]);
