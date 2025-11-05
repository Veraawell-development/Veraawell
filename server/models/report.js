const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  reportType: {
    type: String,
    enum: ['assessment', 'progress', 'diagnosis', 'treatment-plan', 'discharge', 'other'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    default: null // For uploaded PDF/documents
  },
  fileName: {
    type: String,
    default: null
  },
  fileSize: {
    type: Number,
    default: null
  },
  isSharedWithPatient: {
    type: Boolean,
    default: true
  },
  viewedByPatient: {
    type: Boolean,
    default: false
  },
  viewedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
reportSchema.index({ sessionId: 1 });
reportSchema.index({ patientId: 1, isSharedWithPatient: 1, createdAt: -1 });
reportSchema.index({ doctorId: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
