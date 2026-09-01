/**
 * Session Tools Routes
 * Thin route definitions only — all logic lives in controllers
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { validateObjectIdParam } = require('../middleware/validation.middleware');

const noteController = require('../controllers/note.controller');
const taskController = require('../controllers/task.controller');
const reportController = require('../controllers/report.controller');
const journalController = require('../controllers/journal.controller');
const moodEntryController = require('../controllers/moodEntry.controller');

// ==================== SESSION NOTES ====================
router.post('/notes', verifyToken, noteController.createNote);
router.get('/notes/session/:sessionId', verifyToken, validateObjectIdParam('sessionId'), noteController.getNotesBySession);
router.get('/notes/patient/:patientId', verifyToken, validateObjectIdParam('patientId'), noteController.getNotesByPatient);
router.get('/notes/doctor/:doctorId', verifyToken, validateObjectIdParam('doctorId'), noteController.getNotesByDoctor);

// ==================== TASKS ====================
router.post('/tasks', verifyToken, taskController.createTask);
router.get('/tasks/patient/:patientId', verifyToken, validateObjectIdParam('patientId'), taskController.getTasksByPatient);
router.get('/tasks/doctor/:doctorId', verifyToken, validateObjectIdParam('doctorId'), taskController.getTasksByDoctor);
router.put('/tasks/:taskId', verifyToken, validateObjectIdParam('taskId'), taskController.updateTask);

// ==================== REPORTS ====================
router.post('/reports', verifyToken, reportController.createReport);
router.get('/reports/patient/:patientId', verifyToken, validateObjectIdParam('patientId'), reportController.getReportsByPatient);
router.get('/reports/doctor/:doctorId', verifyToken, validateObjectIdParam('doctorId'), reportController.getReportsByDoctor);
router.get('/reports/session/:sessionId', verifyToken, validateObjectIdParam('sessionId'), reportController.getReportsBySession);
router.put('/reports/:reportId/view', verifyToken, validateObjectIdParam('reportId'), reportController.markReportViewed);

// ==================== JOURNAL ====================
router.post('/journal', verifyToken, journalController.createEntry);
router.get('/journal/patient/:patientId', verifyToken, validateObjectIdParam('patientId'), journalController.getEntriesByPatient);
router.put('/journal/:journalId', verifyToken, validateObjectIdParam('journalId'), journalController.updateEntry);
router.delete('/journal/:journalId', verifyToken, validateObjectIdParam('journalId'), journalController.deleteEntry);

// ==================== MOOD CHECK-IN ====================
router.get('/mood/today', verifyToken, moodEntryController.getToday);
router.post('/mood', verifyToken, moodEntryController.createEntry);
router.get('/mood/history', verifyToken, moodEntryController.getHistory);

module.exports = router;
