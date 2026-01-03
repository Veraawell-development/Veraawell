const mongoose = require('mongoose');

const mentalHealthAssessmentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    testType: {
        type: String,
        required: true,
        enum: ['depression', 'anxiety', 'adhd', 'dla20'],
        index: true
    },
    responses: [{
        questionId: {
            type: Number,
            required: true
        },
        answer: {
            type: Number,
            required: true
        }
    }],
    scores: {
        total: {
            type: Number,
            required: true
        },
        severity: {
            type: String,
            required: true,
            enum: ['minimal', 'mild', 'moderate', 'severe', 'moderately-severe']
        },
        percentage: Number
    },
    completedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    testVersion: {
        type: String,
        default: '1.0'
    }
}, {
    timestamps: true
});

// Index for efficient queries
mentalHealthAssessmentSchema.index({ userId: 1, testType: 1, completedAt: -1 });

// Static method to get user's test history
mentalHealthAssessmentSchema.statics.getUserHistory = async function (userId, testType = null) {
    const query = { userId };
    if (testType) {
        query.testType = testType;
    }

    return this.find(query)
        .sort({ completedAt: -1 })
        .select('-responses') // Exclude detailed responses for list view
        .lean();
};

// Static method to get latest test result
mentalHealthAssessmentSchema.statics.getLatestResult = async function (userId, testType) {
    return this.findOne({ userId, testType })
        .sort({ completedAt: -1 })
        .lean();
};

// Instance method to get severity interpretation
mentalHealthAssessmentSchema.methods.getInterpretation = function () {
    const interpretations = {
        minimal: {
            label: 'Minimal',
            description: 'Your responses suggest minimal symptoms.',
            color: 'green'
        },
        mild: {
            label: 'Mild',
            description: 'Your responses suggest mild symptoms.',
            color: 'yellow'
        },
        moderate: {
            label: 'Moderate',
            description: 'Your responses suggest moderate symptoms. Consider speaking with a healthcare professional.',
            color: 'orange'
        },
        'moderately-severe': {
            label: 'Moderately Severe',
            description: 'Your responses suggest moderately severe symptoms. We recommend consulting with a mental health professional.',
            color: 'red'
        },
        severe: {
            label: 'Severe',
            description: 'Your responses suggest severe symptoms. Please consult with a mental health professional as soon as possible.',
            color: 'red'
        }
    };

    return interpretations[this.scores.severity] || interpretations.minimal;
};

const MentalHealthAssessment = mongoose.model('MentalHealthAssessment', mentalHealthAssessmentSchema);

module.exports = MentalHealthAssessment;
