/**
 * Session Tools Routes
 * Thin route definitions only — all logic lives in controllers
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');

const noteController = require('../controllers/note.controller');
const taskController = require('../controllers/task.controller');
const reportController = require('../controllers/report.controller');
const journalController = require('../controllers/journal.controller');

// ==================== SESSION NOTES ====================
router.post('/notes', verifyToken, noteController.createNote);
router.get('/notes/session/:sessionId', verifyToken, noteController.getNotesBySession);
router.get('/notes/patient/:patientId', verifyToken, noteController.getNotesByPatient);
router.get('/notes/doctor/:doctorId', verifyToken, noteController.getNotesByDoctor);

// ==================== TASKS ====================
router.post('/tasks', verifyToken, taskController.createTask);
router.get('/tasks/patient/:patientId', verifyToken, taskController.getTasksByPatient);
router.get('/tasks/doctor/:doctorId', verifyToken, taskController.getTasksByDoctor);
router.put('/tasks/:taskId', verifyToken, taskController.updateTask);

// ==================== REPORTS ====================
router.post('/reports', verifyToken, reportController.createReport);
router.get('/reports/patient/:patientId', verifyToken, reportController.getReportsByPatient);
router.get('/reports/doctor/:doctorId', verifyToken, reportController.getReportsByDoctor);
router.put('/reports/:reportId/view', verifyToken, reportController.markReportViewed);

// ==================== JOURNAL ====================
router.post('/journal', verifyToken, journalController.createEntry);
router.get('/journal/patient/:patientId', verifyToken, journalController.getEntriesByPatient);
router.put('/journal/:journalId', verifyToken, journalController.updateEntry);
router.delete('/journal/:journalId', verifyToken, journalController.deleteEntry);

module.exports = router;
