const mongoose = require('mongoose');

const sessionReportSchema = new mongoose.Schema({
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
        required: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reportType: {
        type: String,
        enum: ['session-notes', 'prescription', 'progress-summary', 'treatment-plan', 'other'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    attachments: [{
        filename: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now }
    }],
    isSharedWithPatient: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
sessionReportSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// Index for faster queries
sessionReportSchema.index({ sessionId: 1 });
sessionReportSchema.index({ patientId: 1 });
sessionReportSchema.index({ doctorId: 1 });

const SessionReport = mongoose.model('SessionReport', sessionReportSchema);

module.exports = SessionReport;
