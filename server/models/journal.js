const mongoose = require('mongoose');

const journalSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Limits enforced (with readable messages) in controllers/journal.controller.js.
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    maxlength: 20000
  },
  mood: {
    type: String,
    default: '',
    maxlength: 50
  },
  tags: [{
    type: String
  }],
  isPrivate: {
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
}, {
  timestamps: true
});

// Index for efficient queries
journalSchema.index({ patientId: 1, createdAt: -1 });

module.exports = mongoose.model('Journal', journalSchema);
