const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const assessmentController = require('../controllers/assessment.controller');

// NOTE: /stats/summary MUST come before /:id to avoid Express matching 'stats' as an ID param
router.get('/stats/summary', verifyToken, assessmentController.getSummaryStats);
router.get('/latest/:testType', verifyToken, assessmentController.getLatest);
router.post('/', verifyToken, assessmentController.saveAssessment);
router.get('/', verifyToken, assessmentController.getHistory);
router.get('/:id', verifyToken, assessmentController.getById);
router.delete('/:id', verifyToken, assessmentController.deleteAssessment);

module.exports = router;
