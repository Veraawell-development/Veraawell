const mongoose = require('mongoose');

const sessionNoteSchema = new mongoose.Schema({
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
  content: {
    type: String,
    required: true
  },
  mood: {
    type: String,
    default: ''
  },
  topicsDiscussed: {
    type: String,
    default: ''
  },
  progressInsights: {
    type: String,
    default: ''
  },
  therapeuticTechniques: {
    type: String,
    default: ''
  },
  isPrivate: {
    type: Boolean,
    default: false // If true, only doctor can see
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
sessionNoteSchema.index({ sessionId: 1 });
sessionNoteSchema.index({ patientId: 1, createdAt: -1 });
sessionNoteSchema.index({ doctorId: 1, createdAt: -1 });

module.exports = mongoose.model('SessionNote', sessionNoteSchema);
