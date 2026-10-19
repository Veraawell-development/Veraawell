const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const availabilityController = require('../controllers/availability.controller');
const { validateObjectIdParam } = require('../middleware/validation.middleware');

router.get('/doctor/current', verifyToken, availabilityController.getCurrentDoctorAvailability);
// A malformed id is a 400 here; it used to reach Mongo and come back a 500.
router.get('/doctor/:doctorId', validateObjectIdParam('doctorId'), availabilityController.getDoctorAvailabilityById);
router.post('/save', verifyToken, availabilityController.saveAvailability);
router.get('/slots/:doctorId/:date', validateObjectIdParam('doctorId'), availabilityController.getSlots);
// book-slot / release-slot were removed here: they accepted an arbitrary
// doctorId/sessionId from any authenticated caller with no ownership check
// (IDOR — any user could squat or free any other doctor's calendar slots),
// were unreachable from the frontend (confirmed via repo-wide grep), and were
// superseded by the real booking flow in session.controller.js, which calls
// the DoctorAvailability model's bookSlot/releaseSlot methods directly with
// proper ownership already established by that point in the request.
router.get('/upcoming-sessions', verifyToken, availabilityController.getUpcomingSessions);

module.exports = router;
