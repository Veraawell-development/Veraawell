const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { validateObjectIdParam } = require('../middleware/validation.middleware');
const { authorize, withScope } = require('../authz');
const sessionReportController = require('../controllers/sessionReport.controller');

// The list-by-patient route was the app's worst PHI leak: it accepted any
// caller with role 'doctor' as authorized, so any approved doctor could read
// any patient's session reports. It now requires a real doctor-patient Session
// to exist — see authz/policies/clinicalRecords.policy.js.
router.get('/patient/:patientId',
  verifyToken,
  validateObjectIdParam('patientId'),
  withScope('session-report:list-by-patient'),
  sessionReportController.getReportsByPatient);

router.get('/session/:sessionId',
  verifyToken,
  validateObjectIdParam('sessionId'),
  authorize('session:read'),
  sessionReportController.getReportsBySession);

router.post('/',
  verifyToken,
  authorize('session-report:create'),
  sessionReportController.createReport);

router.get('/:reportId',
  verifyToken,
  validateObjectIdParam('reportId'),
  authorize('session-report:read'),
  sessionReportController.getReportById);

module.exports = router;
