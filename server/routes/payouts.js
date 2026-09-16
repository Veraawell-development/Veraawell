/**
 * Payout routes.
 *
 * Authorization is declared on the route line, as everywhere else — see
 * server/authz. Nothing here may be added to authz/UNDECLARED.js: that list
 * is a ratchet that only shrinks.
 *
 * The tiering follows the rule already stated in adminPayments.routes.js:
 * READING payment state is an admin capability; changing what the platform
 * charges, deciding who gets paid, or moving money is a super-admin one.
 * Approving a bank account is squarely in the second group — it decides where
 * real money is sent — so it requires requireSuperAdmin(), the same gate as
 * issuing a refund.
 */

const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdminToken } = require('../middleware/auth.middleware');
const { requireRole, requireSuperAdmin } = require('../authz');
const { validateObjectIdParam } = require('../middleware/validation.middleware');
const payouts = require('../controllers/payout.controller');

// ── Doctor: their own bank details and payout history ──────────────────────
// Always self-scoped by req.actor.id inside the controller — there is no
// addressable other-doctor resource here, so a role gate is the whole policy.
router.get('/bank-details', verifyToken, requireRole('doctor'), payouts.getMyBankDetails);
router.post('/bank-details', verifyToken, requireRole('doctor'), payouts.submitBankDetails);
router.get('/my-payouts', verifyToken, requireRole('doctor'), payouts.getMyPayouts);

module.exports = router;

/**
 * The admin half is mounted separately under /api/admin/payments/payouts so
 * that it sits behind verifyAdminToken with the rest of the admin surface,
 * rather than behind verifyToken. Mixing the two auth realms on one router is
 * how a route ends up reachable from the wrong one.
 */
module.exports.adminRouter = (() => {
  const admin = express.Router();

  // Read-only: any admin.
  admin.get('/', verifyAdminToken, requireRole('admin', 'super_admin'), payouts.listPayouts);
  admin.get('/preview', verifyAdminToken, requireRole('admin', 'super_admin'), payouts.previewPayouts);
  admin.get('/bank-details', verifyAdminToken, requireSuperAdmin(), payouts.listBankDetailSubmissions);

  // Moves money, or decides where money goes: super admin only.
  admin.post('/generate', verifyAdminToken, requireSuperAdmin(), payouts.generatePayouts);
  admin.post('/:payoutId/lock', verifyAdminToken, requireSuperAdmin(),
    validateObjectIdParam('payoutId'), payouts.lockPayout);
  admin.post('/:payoutId/mark-paid', verifyAdminToken, requireSuperAdmin(),
    validateObjectIdParam('payoutId'), payouts.markPayoutPaid);
  admin.post('/bank-details/:doctorId/approve', verifyAdminToken, requireSuperAdmin(),
    validateObjectIdParam('doctorId'), payouts.approveBankDetails);
  admin.post('/bank-details/:doctorId/reject', verifyAdminToken, requireSuperAdmin(),
    validateObjectIdParam('doctorId'), payouts.rejectBankDetails);

  return admin;
})();
