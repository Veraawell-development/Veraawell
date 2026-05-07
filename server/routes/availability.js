const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const availabilityController = require('../controllers/availability.controller');

router.get('/doctor/current', verifyToken, availabilityController.getCurrentDoctorAvailability);
router.get('/doctor/:doctorId', availabilityController.getDoctorAvailabilityById);
router.post('/save', verifyToken, availabilityController.saveAvailability);
router.get('/slots/:doctorId/:date', availabilityController.getSlots);
router.post('/book-slot', verifyToken, availabilityController.bookSlot);
router.post('/release-slot', verifyToken, availabilityController.releaseSlot);
router.get('/upcoming-sessions', verifyToken, availabilityController.getUpcomingSessions);

module.exports = router;
