const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { validateObjectIdParam } = require('../middleware/validation.middleware');
const { requireRole } = require('../authz');
const assessmentController = require('../controllers/assessment.controller');

// A patient's own self-assessments. Every handler is scoped by req.actor.id —
// reads and deletes by id include `userId` in the filter — so there is no
// addressable other-user record and a role gate is the whole policy. The
// client only offers these screens to patients.

// NOTE: /stats/summary MUST come before /:id to avoid Express matching 'stats' as an ID param
router.get('/stats/summary', verifyToken, requireRole('patient'), assessmentController.getSummaryStats);
router.get('/latest/:testType', verifyToken, requireRole('patient'), assessmentController.getLatest);
router.post('/', verifyToken, requireRole('patient'), assessmentController.saveAssessment);
router.get('/', verifyToken, requireRole('patient'), assessmentController.getHistory);
router.get('/:id', verifyToken, requireRole('patient'), validateObjectIdParam('id'), assessmentController.getById);
router.delete('/:id', verifyToken, requireRole('patient'), validateObjectIdParam('id'), assessmentController.deleteAssessment);

module.exports = router;
