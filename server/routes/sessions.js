/**
 * Session Routes
 * Thin route definitions only — all logic lives in session.controller.js
 * IMPORTANT: Specific named routes MUST come before parameterized /:sessionId routes
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const s = require('../controllers/session.controller');

// Named routes (must be before /:sessionId)
router.get('/stats', verifyToken, s.getStats);
router.get('/my-doctors', verifyToken, s.getMyDoctors);
router.get('/pending-feedback', verifyToken, s.getPendingFeedback);
router.get('/call-history', verifyToken, s.getCallHistory);
router.get('/my-sessions', verifyToken, s.getMySessions);
router.get('/upcoming', verifyToken, s.getUpcoming);
router.get('/my-therapists', verifyToken, s.getMyTherapists);
router.get('/doctors', s.getAllDoctors);
router.get('/doctors/:doctorId/slots/:date', s.getDoctorSlots);
router.get('/doctors/:doctorId', s.getDoctorById);
router.get('/calendar/:year/:month', verifyToken, s.getCalendar);
router.get('/patients/:patientId/emergency-contact', verifyToken, s.getPatientEmergencyContact);

// Session booking
router.post('/book', verifyToken, s.bookSession);
router.post('/book-immediate', verifyToken, s.bookImmediate);

// Parameterized routes (must come AFTER named routes)
router.get('/join/:sessionId', verifyToken, s.joinSession);
router.post('/:sessionId/complete', verifyToken, s.completeSession);
router.post('/:sessionId/cancel', verifyToken, s.cancelSession);
router.post('/:sessionId/accept', verifyToken, s.acceptSession);
router.post('/:sessionId/delay', verifyToken, s.delaySession);
router.get('/:sessionId', verifyToken, s.getSessionById);

module.exports = router;
