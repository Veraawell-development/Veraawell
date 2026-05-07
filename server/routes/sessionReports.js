const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const sessionReportController = require('../controllers/sessionReport.controller');

router.get('/patient/:patientId', verifyToken, sessionReportController.getReportsByPatient);
router.get('/session/:sessionId', verifyToken, sessionReportController.getReportsBySession);
router.post('/', verifyToken, sessionReportController.createReport);
router.get('/:reportId', verifyToken, sessionReportController.getReportById);

module.exports = router;
