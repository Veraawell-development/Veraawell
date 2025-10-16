/**
 * Video Call Session Model
 * Manages therapy session data, participants, and metadata
 */

const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['patient', 'doctor'],
    required: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  leftAt: {
    type: Date
  },
  connectionQuality: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor'],
    default: 'good'
  },
  deviceInfo: {
    browser: String,
    os: String,
    device: String
  }
});

const recordingSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: false
  },
  consentGiven: {
    type: Boolean,
    default: false
  },
  consentTimestamp: Date,
  recordingPath: String,
  duration: Number, // in seconds
  fileSize: Number, // in bytes
  format: {
    type: String,
    enum: ['webm', 'mp4'],
    default: 'webm'
  }
});

const sessionMetricsSchema = new mongoose.Schema({
  duration: {
    type: Number, // in seconds
    default: 0
  },
  connectionIssues: {
    type: Number,
    default: 0
  },
  reconnections: {
    type: Number,
    default: 0
  },
  averageQuality: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor'],
    default: 'good'
  },
  dataTransferred: {
    type: Number, // in bytes
    default: 0
  }
});

const videoCallSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  
  roomId: {
    type: String,
    required: true,
    index: true
  },
  
  // Session participants
  participants: [participantSchema],
  
  // Session status
  status: {
    type: String,
    enum: ['scheduled', 'active', 'ended', 'cancelled', 'failed'],
    default: 'scheduled'
  },
  
  // Timing information
  scheduledStartTime: {
    type: Date,
    required: true
  },
  actualStartTime: Date,
  endTime: Date,
  
  // Session type
  sessionType: {
    type: String,
    enum: ['therapy', 'consultation', 'follow-up', 'emergency'],
    default: 'therapy'
  },
  
  // Recording information
  recording: recordingSchema,
  
  // Session metrics
  metrics: sessionMetricsSchema,
  
  // Session notes (added by doctor)
  notes: {
    type: String,
    maxlength: 5000
  },
  
  // Technical details
  technical: {
    webrtcVersion: String,
    browserSupport: Boolean,
    iceConnectionState: String,
    signalingState: String,
    errors: [{
      timestamp: Date,
      error: String,
      severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical']
      }
    }]
  },
  
  // Privacy and compliance
  privacy: {
    hipaaCompliant: {
      type: Boolean,
      default: true
    },
    encryptionEnabled: {
      type: Boolean,
      default: true
    },
    auditLog: [{
      timestamp: Date,
      action: String,
      userId: mongoose.Schema.Types.ObjectId,
      details: String
    }]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
videoCallSessionSchema.index({ roomId: 1, status: 1 });
videoCallSessionSchema.index({ 'participants.userId': 1 });
videoCallSessionSchema.index({ scheduledStartTime: 1 });
videoCallSessionSchema.index({ createdAt: -1 });

// Virtual for session duration
videoCallSessionSchema.virtual('sessionDuration').get(function() {
  if (this.actualStartTime && this.endTime) {
    return Math.floor((this.endTime - this.actualStartTime) / 1000);
  }
  return 0;
});

// Methods
videoCallSessionSchema.methods.addParticipant = function(userId, role, deviceInfo = {}) {
  this.participants.push({
    userId,
    role,
    deviceInfo,
    joinedAt: new Date()
  });
  return this.save();
};

videoCallSessionSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(p => p.userId.toString() === userId.toString());
  if (participant) {
    participant.leftAt = new Date();
  }
  return this.save();
};

videoCallSessionSchema.methods.updateConnectionQuality = function(userId, quality) {
  const participant = this.participants.find(p => p.userId.toString() === userId.toString());
  if (participant) {
    participant.connectionQuality = quality;
  }
  return this.save();
};

videoCallSessionSchema.methods.addAuditLog = function(action, userId, details = '') {
  this.privacy.auditLog.push({
    timestamp: new Date(),
    action,
    userId,
    details
  });
  return this.save();
};

// Static methods
videoCallSessionSchema.statics.findActiveSession = function(roomId) {
  return this.findOne({ roomId, status: 'active' });
};

videoCallSessionSchema.statics.getUserActiveSessions = function(userId) {
  return this.find({
    'participants.userId': userId,
    status: 'active'
  });
};

module.exports = mongoose.model('VideoCallSession', videoCallSessionSchema);
