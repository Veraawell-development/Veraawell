/**
 * Session Tools Routes
 * Thin route definitions only — all logic lives in controllers
 *
 * Every route here declares its authorization on the route line:
 *   authorize(...)  — a single record; loads it and checks ownership
 *   withScope(...)  — a list; resolves the actor's query constraint
 *   requireRole(...)— depends only on the caller's role
 *
 * These are the app's most sensitive endpoints (therapy notes, diagnoses,
 * assigned homework) and previously had no in-route authorization at all —
 * each controller re-implemented its own check, three of them built a Mongo
 * filter with no default-deny branch, and three trusted a `patientId` supplied
 * in the request body. See authz/policies/clinicalRecords.policy.js.
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { validateObjectIdParam } = require('../middleware/validation.middleware');
const { authorize, withScope, requireRole } = require('../authz');

const noteController = require('../controllers/note.controller');
const taskController = require('../controllers/task.controller');
const reportController = require('../controllers/report.controller');
const journalController = require('../controllers/journal.controller');
const moodEntryController = require('../controllers/moodEntry.controller');

// ==================== SESSION NOTES ====================
router.post('/notes', verifyToken, authorize('note:create'), noteController.createNote);
router.get('/notes/session/:sessionId', verifyToken, validateObjectIdParam('sessionId'), withScope('note:list-by-session'), noteController.getNotesBySession);
router.get('/notes/patient/:patientId', verifyToken, validateObjectIdParam('patientId'), withScope('note:list-by-patient'), noteController.getNotesByPatient);
router.get('/notes/doctor/:doctorId', verifyToken, validateObjectIdParam('doctorId'), withScope('note:list-by-doctor'), noteController.getNotesByDoctor);

// ==================== TASKS ====================
router.post('/tasks', verifyToken, authorize('task:create'), taskController.createTask);
router.get('/tasks/patient/:patientId', verifyToken, validateObjectIdParam('patientId'), withScope('task:list-by-patient'), taskController.getTasksByPatient);
router.get('/tasks/doctor/:doctorId', verifyToken, validateObjectIdParam('doctorId'), withScope('task:list-by-doctor'), taskController.getTasksByDoctor);
router.put('/tasks/:taskId', verifyToken, validateObjectIdParam('taskId'), authorize('task:update'), taskController.updateTask);

// ==================== REPORTS ====================
router.post('/reports', verifyToken, authorize('report:create'), reportController.createReport);
router.get('/reports/patient/:patientId', verifyToken, validateObjectIdParam('patientId'), withScope('report:list-by-patient'), reportController.getReportsByPatient);
router.get('/reports/doctor/:doctorId', verifyToken, validateObjectIdParam('doctorId'), withScope('report:list-by-doctor'), reportController.getReportsByDoctor);
router.get('/reports/session/:sessionId', verifyToken, validateObjectIdParam('sessionId'), authorize('session:read'), reportController.getReportsBySession);
router.put('/reports/:reportId/view', verifyToken, validateObjectIdParam('reportId'), authorize('report:mark-viewed'), reportController.markReportViewed);

// ==================== JOURNAL ====================
// A journal is a patient's private diary — owner-only, no doctor or admin read.
router.post('/journal', verifyToken, requireRole('patient'), journalController.createEntry);
router.get('/journal/patient/:patientId', verifyToken, validateObjectIdParam('patientId'), withScope('journal:list-own'), journalController.getEntriesByPatient);
router.put('/journal/:journalId', verifyToken, validateObjectIdParam('journalId'), authorize('journal:update'), journalController.updateEntry);
router.delete('/journal/:journalId', verifyToken, validateObjectIdParam('journalId'), authorize('journal:delete'), journalController.deleteEntry);

// ==================== MOOD CHECK-IN ====================
// Always self-scoped by req.actor.id inside the controller; there is no
// addressable other-user resource, so a role gate is the whole policy.
router.get('/mood/today', verifyToken, requireRole('patient'), moodEntryController.getToday);
router.post('/mood', verifyToken, requireRole('patient'), moodEntryController.createEntry);
router.get('/mood/history', verifyToken, requireRole('patient'), moodEntryController.getHistory);

module.exports = router;
