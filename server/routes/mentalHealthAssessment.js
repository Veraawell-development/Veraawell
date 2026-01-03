const express = require('express');
const router = express.Router();
const MentalHealthAssessment = require('../models/mentalHealthAssessment');
const { verifyToken } = require('../middleware/auth.middleware');

// @route   POST /api/assessments
// @desc    Save a mental health assessment result
// @access  Private
router.post('/', verifyToken, async (req, res) => {
    try {
        const { testType, responses, scores } = req.body;
        const userId = req.user._id;

        // Validate required fields
        if (!testType || !responses || !scores) {
            return res.status(400).json({
                message: 'Missing required fields: testType, responses, and scores are required'
            });
        }

        // Validate test type
        const validTestTypes = ['depression', 'anxiety', 'adhd', 'dla20'];
        if (!validTestTypes.includes(testType)) {
            return res.status(400).json({
                message: 'Invalid test type. Must be one of: depression, anxiety, adhd, dla20'
            });
        }

        // Create new assessment
        const assessment = new MentalHealthAssessment({
            userId,
            testType,
            responses,
            scores,
            completedAt: new Date()
        });

        await assessment.save();

        res.status(201).json({
            message: 'Assessment saved successfully',
            assessment: {
                _id: assessment._id,
                testType: assessment.testType,
                scores: assessment.scores,
                completedAt: assessment.completedAt
            }
        });
    } catch (error) {
        console.error('Error saving assessment:', error);
        res.status(500).json({ message: 'Server error while saving assessment' });
    }
});

// @route   GET /api/assessments
// @desc    Get user's assessment history
// @access  Private
router.get('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user._id;
        const { testType } = req.query;

        const assessments = await MentalHealthAssessment.getUserHistory(userId, testType);

        res.json({
            count: assessments.length,
            assessments
        });
    } catch (error) {
        console.error('Error fetching assessments:', error);
        res.status(500).json({ message: 'Server error while fetching assessments' });
    }
});

// @route   GET /api/assessments/latest/:testType
// @desc    Get latest assessment result for a specific test type
// @access  Private
router.get('/latest/:testType', verifyToken, async (req, res) => {
    try {
        const userId = req.user._id;
        const { testType } = req.params;

        // Validate test type
        const validTestTypes = ['depression', 'anxiety', 'adhd', 'dla20'];
        if (!validTestTypes.includes(testType)) {
            return res.status(400).json({
                message: 'Invalid test type. Must be one of: depression, anxiety, adhd, dla20'
            });
        }

        const assessment = await MentalHealthAssessment.getLatestResult(userId, testType);

        if (!assessment) {
            return res.status(404).json({
                message: 'No assessment found for this test type'
            });
        }

        res.json(assessment);
    } catch (error) {
        console.error('Error fetching latest assessment:', error);
        res.status(500).json({ message: 'Server error while fetching assessment' });
    }
});

// @route   GET /api/assessments/:id
// @desc    Get a specific assessment by ID
// @access  Private
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;

        const assessment = await MentalHealthAssessment.findOne({
            _id: id,
            userId // Ensure user can only access their own assessments
        });

        if (!assessment) {
            return res.status(404).json({ message: 'Assessment not found' });
        }

        // Add interpretation
        const result = assessment.toObject();
        result.interpretation = assessment.getInterpretation();

        res.json(result);
    } catch (error) {
        console.error('Error fetching assessment:', error);
        res.status(500).json({ message: 'Server error while fetching assessment' });
    }
});

// @route   DELETE /api/assessments/:id
// @desc    Delete an assessment
// @access  Private
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;

        const assessment = await MentalHealthAssessment.findOneAndDelete({
            _id: id,
            userId // Ensure user can only delete their own assessments
        });

        if (!assessment) {
            return res.status(404).json({ message: 'Assessment not found' });
        }

        res.json({ message: 'Assessment deleted successfully' });
    } catch (error) {
        console.error('Error deleting assessment:', error);
        res.status(500).json({ message: 'Server error while deleting assessment' });
    }
});

// @route   GET /api/assessments/stats/summary
// @desc    Get summary statistics of user's assessments
// @access  Private
router.get('/stats/summary', verifyToken, async (req, res) => {
    try {
        const userId = req.user._id;

        const stats = await MentalHealthAssessment.aggregate([
            { $match: { userId: userId } },
            {
                $group: {
                    _id: '$testType',
                    count: { $sum: 1 },
                    latestScore: { $last: '$scores.total' },
                    latestSeverity: { $last: '$scores.severity' },
                    latestDate: { $last: '$completedAt' }
                }
            }
        ]);

        res.json(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ message: 'Server error while fetching statistics' });
    }
});

module.exports = router;
