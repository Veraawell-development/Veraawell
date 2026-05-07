const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const ratingController = require('../controllers/rating.controller');

router.post('/:sessionId/rate', verifyToken, ratingController.submitRating);
router.get('/doctor/:doctorId/ratings', ratingController.getDoctorRatings);

module.exports = router;
