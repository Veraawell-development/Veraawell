/**
 * Admin: call statistics (the Calls tab) — success rate, relay share, recent
 * failures. Read-only, any admin.
 */
const express = require('express');
const router = express.Router();
const { verifyAdminToken } = require('../middleware/auth.middleware');
const { validateObjectIdParam } = require('../middleware/validation.middleware');
const { requireRole } = require('../authz');
const calls = require('../controllers/callEvents.controller');

const admin = [verifyAdminToken, requireRole('admin', 'super_admin')];
router.get('/summary', ...admin, calls.getCallSummary);
router.get('/', ...admin, calls.listCalls);
router.get('/:sessionId', ...admin, validateObjectIdParam('sessionId'), calls.getCall);

module.exports = router;
