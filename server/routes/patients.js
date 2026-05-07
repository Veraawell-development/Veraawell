const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const patientController = require('../controllers/patient.controller');

router.post('/emergency-contact', verifyToken, patientController.saveEmergencyContact);
router.get('/emergency-contact', verifyToken, patientController.getEmergencyContact);
router.get('/doctor-patients', verifyToken, patientController.getDoctorPatients);

module.exports = router;
