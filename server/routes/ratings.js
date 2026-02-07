const express = require('express');
const router = express.Router();
const Session = require('../models/session');
const DoctorProfile = require('../models/doctorProfile');
const { verifyToken } = require('../middleware/auth.middleware');

// Submit rating for a session
router.post('/:sessionId/rate', verifyToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { score, review } = req.body;
        const patientId = req.user._id.toString();

        console.log('[RATING] Submitting rating:', { sessionId, score, patientId: patientId.substring(0, 8) });

        // Validate score
        if (!score || score < 1 || score > 5) {
            return res.status(400).json({ message: 'Rating score must be between 1 and 5' });
        }

        // Find the session
        const session = await Session.findById(sessionId);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        // Verify the user is the patient of this session
        if (session.patientId.toString() !== patientId) {
            return res.status(403).json({ message: 'You can only rate your own sessions' });
        }

        // Check if session is completed
        if (session.status !== 'completed') {
            return res.status(400).json({ message: 'You can only rate completed sessions' });
        }

        // Check if already rated
        if (session.rating && session.rating.score) {
            return res.status(400).json({ message: 'You have already rated this session' });
        }

        // Update session with rating
        session.rating = {
            score: parseInt(score),
            review: review || '',
            ratedAt: new Date()
        };
        await session.save();

        console.log('[RATING] Session rated successfully');

        // Update doctor's rating
        await updateDoctorRating(session.doctorId);

        res.json({
            message: 'Rating submitted successfully',
            rating: session.rating
        });
    } catch (error) {
        console.error('[RATING] Error submitting rating:', error);
        res.status(500).json({ message: 'Failed to submit rating', error: error.message });
    }
});

// Get ratings for a doctor
router.get('/doctor/:doctorId/ratings', async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { limit = 10, skip = 0 } = req.query;

        console.log('[RATING] Fetching ratings for doctor:', doctorId.substring(0, 8));

        // Find all rated sessions for this doctor
        const sessions = await Session.find({
            doctorId,
            'rating.score': { $exists: true, $ne: null }
        })
            .populate('patientId', 'firstName lastName')
            .sort({ 'rating.ratedAt': -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .select('rating sessionDate');

        // Format ratings (anonymize patient names)
        const ratings = sessions.map(session => ({
            score: session.rating.score,
            review: session.rating.review,
            ratedAt: session.rating.ratedAt,
            sessionDate: session.sessionDate,
            patientName: session.patientId ?
                `${session.patientId.firstName.charAt(0)}***` :
                'Anonymous'
        }));

        res.json(ratings);
    } catch (error) {
        console.error('[RATING] Error fetching ratings:', error);
        res.status(500).json({ message: 'Failed to fetch ratings', error: error.message });
    }
});

// Helper function to update doctor's rating
async function updateDoctorRating(doctorId) {
    try {
        console.log('[RATING] Updating doctor rating:', doctorId.toString().substring(0, 8));

        // Get all rated sessions for this doctor
        const sessions = await Session.find({
            doctorId,
            'rating.score': { $exists: true, $ne: null }
        });

        if (sessions.length === 0) {
            console.log('[RATING] No ratings found for doctor');
            return;
        }

        // Calculate average and distribution
        const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let total = 0;

        sessions.forEach(session => {
            const score = session.rating.score;
            total += score;
            distribution[score]++;
        });

        const average = parseFloat((total / sessions.length).toFixed(2));

        console.log('[RATING] Calculated rating:', {
            average,
            totalReviews: sessions.length,
            distribution
        });

        // Update doctor profile
        await DoctorProfile.findOneAndUpdate(
            { userId: doctorId },
            {
                rating: {
                    average,
                    totalReviews: sessions.length,
                    distribution
                }
            }
        );

        console.log('[RATING] Doctor rating updated successfully');
    } catch (error) {
        console.error('[RATING] Error updating doctor rating:', error);
        throw error;
    }
}

module.exports = router;
