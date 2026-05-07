const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const doctorStatusController = require('../controllers/doctorStatus.controller');

router.post('/toggle-online', verifyToken, doctorStatusController.toggleOnline);
router.get('/status', verifyToken, doctorStatusController.getStatus);
router.get('/online-doctors', doctorStatusController.getOnlineDoctors);
router.post('/set-offline', verifyToken, doctorStatusController.setOffline);

module.exports = router;
