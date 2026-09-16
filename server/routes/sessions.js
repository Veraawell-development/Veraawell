/**
 * Session Routes
 * Thin route definitions only — all logic lives in session.controller.js
 * IMPORTANT: Specific named routes MUST come before parameterized /:sessionId routes
 *
 * Authorization is declared here, on the route line, rather than inside each
 * handler. That is what makes a missing check visible: POST /:sessionId/missed
 * had none, and the route declaration looked exactly like its neighbours that
 * did. See server/authz/policies/session.policy.js for the rules and
 * server/authz/audit.js for the test that fails when a route declares nothing.
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { validateObjectIdParam, validateObjectIdBody } = require('../middleware/validation.middleware');
const { authorize, withScope, requireRole, publicRoute } = require('../authz');
const s = require('../controllers/session.controller');

const Session = require('../models/session');

// Loaders. Declared next to the routes that need them so the populate shape a
// handler depends on is visible from the route, and so the policy and the
// handler are guaranteed to be looking at the same document.
const withParties = (id) => Session.findById(id)
  .populate('patientId', 'firstName lastName email')
  .populate('doctorId', 'firstName lastName email');
const withPartyNames = (id) => Session.findById(id)
  .populate('patientId', 'firstName lastName')
  .populate('doctorId', 'firstName lastName');

// ── Named routes (must come before /:sessionId) ─────────────────────────────
router.get('/stats', verifyToken, requireRole('doctor'), s.getStats);
router.get('/my-doctors', verifyToken, requireRole('patient'), s.getMyDoctors);
router.get('/pending-feedback', verifyToken, s.getPendingFeedback);
router.get('/call-history', verifyToken, withScope('session:list-own'), s.getCallHistory);
router.get('/my-sessions', verifyToken, withScope('session:list-own'), s.getMySessions);
router.get('/calendar', verifyToken, withScope('session:list-own'), s.getCalendar);
router.get('/delayed', verifyToken, s.getDelayedSessions);
// Self-scoped by req.actor.id inside the handler — there is no addressable
// other-doctor resource, so a role gate is the whole policy. Same shape as
// the doctor half of routes/payouts.js.
router.get('/instant-requests', verifyToken, requireRole('doctor'), s.getInstantRequests);
router.get('/upcoming', verifyToken, withScope('session:list-own'), s.getUpcoming);
router.get('/my-therapists', verifyToken, requireRole('patient'), s.getMyTherapists);

// Public discovery surface. Intentionally unauthenticated — this is the
// "browse therapists" page. The response is field-limited by the controller.
router.get('/doctors', publicRoute('public therapist directory'), s.getAllDoctors);
router.get('/doctors/:doctorId/slots/:date', publicRoute('public availability for booking'), validateObjectIdParam('doctorId'), s.getDoctorSlots);
router.get('/doctors/:doctorId', publicRoute('public therapist profile'), validateObjectIdParam('doctorId'), s.getDoctorById);

router.get('/calendar/:year/:month', verifyToken, withScope('session:list-own'), s.getCalendar);

// A doctor may see a patient's emergency contact only for a patient they
// actually treat — the controller checks the treating relationship.
router.get('/patients/:patientId/emergency-contact', verifyToken, requireRole('doctor'), validateObjectIdParam('patientId'), s.getPatientEmergencyContact);

router.get('/turn-credentials', verifyToken, requireRole('patient', 'doctor'), s.getTurnCredentials);

// ── Booking ────────────────────────────────────────────────────────────────
router.post('/book', verifyToken, authorize('session:book'), validateObjectIdBody('doctorId'), s.bookSession);
// book-immediate deliberately does NOT validate doctorId as a required
// ObjectId: bookImmediate() allows it to be absent or the sentinel
// 'test-doctor-id', which it treats as a self-session.
router.post('/book-immediate', verifyToken, authorize('session:book'), s.bookImmediate);

// ── Parameterized routes ───────────────────────────────────────────────────
router.get('/join/:sessionId', verifyToken, validateObjectIdParam('sessionId'), authorize('session:join', { load: withParties }), s.joinSession);
router.post('/:sessionId/complete', verifyToken, validateObjectIdParam('sessionId'), authorize('session:complete', { load: withParties }), s.completeSession);
router.post('/:sessionId/cancel', verifyToken, validateObjectIdParam('sessionId'), authorize('session:cancel'), s.cancelSession);
router.post('/:sessionId/accept', verifyToken, validateObjectIdParam('sessionId'), authorize('session:accept', { load: withPartyNames }), s.acceptSession);
router.post('/:sessionId/delay', verifyToken, validateObjectIdParam('sessionId'), authorize('session:delay', { load: withPartyNames }), s.delaySession);

// Cancels the session and refunds the patient, so it is restricted to that
// session's patient. It previously had no authorization check at all.
router.post('/:sessionId/missed',
  verifyToken,
  validateObjectIdParam('sessionId'),
  authorize('session:mark-missed', { load: withParties }),
  s.missedSession);

router.get('/:sessionId', verifyToken, validateObjectIdParam('sessionId'), authorize('session:read', {
  load: (id) => Session.findById(id)
    .populate('patientId', 'firstName lastName email gender')
    .populate('doctorId', 'firstName lastName email gender')
    .lean()
}), s.getSessionById);

module.exports = router;
