const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const availabilityController = require('../controllers/availability.controller');

router.get('/doctor/current', verifyToken, availabilityController.getCurrentDoctorAvailability);
router.get('/doctor/:doctorId', availabilityController.getDoctorAvailabilityById);
router.post('/save', verifyToken, availabilityController.saveAvailability);
router.get('/slots/:doctorId/:date', availabilityController.getSlots);
// book-slot / release-slot were removed here: they accepted an arbitrary
// doctorId/sessionId from any authenticated caller with no ownership check
// (IDOR — any user could squat or free any other doctor's calendar slots),
// were unreachable from the frontend (confirmed via repo-wide grep), and were
// superseded by the real booking flow in session.controller.js, which calls
// the DoctorAvailability model's bookSlot/releaseSlot methods directly with
// proper ownership already established by that point in the request.
router.get('/upcoming-sessions', verifyToken, availabilityController.getUpcomingSessions);

module.exports = router;
