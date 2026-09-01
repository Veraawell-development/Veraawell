/**
 * Session Routes
 * Thin route definitions only — all logic lives in session.controller.js
 * IMPORTANT: Specific named routes MUST come before parameterized /:sessionId routes
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { validateObjectIdParam, validateObjectIdBody } = require('../middleware/validation.middleware');
const s = require('../controllers/session.controller');

// A malformed :sessionId/:doctorId/:patientId (e.g. "undefined", a truncated
// ID, a crafted request) used to reach Session.findById()/similar directly
// and throw an uncaught Mongoose CastError — a generic 500 instead of a
// clean 400. These routes are the highest-traffic, most money-adjacent ones
// in the app, so they're the first to get ID format validation.

// Named routes (must be before /:sessionId)
router.get('/stats', verifyToken, s.getStats);
router.get('/my-doctors', verifyToken, s.getMyDoctors);
router.get('/pending-feedback', verifyToken, s.getPendingFeedback);
router.get('/call-history', verifyToken, s.getCallHistory);
router.get('/my-sessions', verifyToken, s.getMySessions);
router.get('/calendar', verifyToken, s.getCalendar);
router.get('/delayed', verifyToken, s.getDelayedSessions);
router.get('/upcoming', verifyToken, s.getUpcoming);
router.get('/my-therapists', verifyToken, s.getMyTherapists);
router.get('/doctors', s.getAllDoctors);
router.get('/doctors/:doctorId/slots/:date', validateObjectIdParam('doctorId'), s.getDoctorSlots);
router.get('/doctors/:doctorId', validateObjectIdParam('doctorId'), s.getDoctorById);
router.get('/calendar/:year/:month', verifyToken, s.getCalendar);
router.get('/patients/:patientId/emergency-contact', verifyToken, validateObjectIdParam('patientId'), s.getPatientEmergencyContact);
router.get('/turn-credentials', verifyToken, s.getTurnCredentials);

// Session booking
router.post('/book', verifyToken, validateObjectIdBody('doctorId'), s.bookSession);
// book-immediate deliberately does NOT validate doctorId as a required
// ObjectId here — bookImmediate() explicitly allows it to be missing or the
// sentinel 'test-doctor-id', which it treats as a self-session (falls back
// to patientId). See session.controller.js:232-235.
router.post('/book-immediate', verifyToken, s.bookImmediate);

// Parameterized routes (must come AFTER named routes)
router.get('/join/:sessionId', verifyToken, validateObjectIdParam('sessionId'), s.joinSession);
router.post('/:sessionId/complete', verifyToken, validateObjectIdParam('sessionId'), s.completeSession);
router.post('/:sessionId/cancel', verifyToken, validateObjectIdParam('sessionId'), s.cancelSession);
router.post('/:sessionId/accept', verifyToken, validateObjectIdParam('sessionId'), s.acceptSession);
router.post('/:sessionId/delay', verifyToken, validateObjectIdParam('sessionId'), s.delaySession);
router.post('/:sessionId/missed', verifyToken, validateObjectIdParam('sessionId'), s.missedSession);
router.get('/:sessionId', verifyToken, validateObjectIdParam('sessionId'), s.getSessionById);

module.exports = router;
