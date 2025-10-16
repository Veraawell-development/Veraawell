/**
 * Video Call Room Model
 * Manages virtual therapy rooms for video sessions
 */

const mongoose = require('mongoose');

const roomSecuritySchema = new mongoose.Schema({
  accessCode: {
    type: String,
    required: true
  },
  encryptionKey: String,
  allowedUsers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['patient', 'doctor', 'observer']
    },
    permissions: {
      canShare: { type: Boolean, default: false },
      canRecord: { type: Boolean, default: false },
      canMute: { type: Boolean, default: false }
    }
  }],
  waitingRoom: {
    enabled: { type: Boolean, default: true },
    autoAdmit: { type: Boolean, default: false }
  }
});

const roomSettingsSchema = new mongoose.Schema({
  maxParticipants: {
    type: Number,
    default: 2,
    min: 2,
    max: 10
  },
  recordingEnabled: {
    type: Boolean,
    default: false
  },
  screenSharingEnabled: {
    type: Boolean,
    default: true
  },
  chatEnabled: {
    type: Boolean,
    default: true
  },
  backgroundBlurEnabled: {
    type: Boolean,
    default: true
  },
  qualitySettings: {
    videoQuality: {
      type: String,
      enum: ['low', 'medium', 'high', 'hd'],
      default: 'high'
    },
    audioQuality: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'high'
    }
  }
});

const videoCallRoomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  
  roomName: {
    type: String,
    required: true,
    maxlength: 100
  },
  
  // Room creator (usually the doctor)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Room type
  roomType: {
    type: String,
    enum: ['therapy', 'consultation', 'group-therapy', 'emergency'],
    default: 'therapy'
  },
  
  // Room status
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived', 'suspended'],
    default: 'active'
  },
  
  // Security settings
  security: roomSecuritySchema,
  
  // Room configuration
  settings: roomSettingsSchema,
  
  // Scheduled sessions for this room
  scheduledSessions: [{
    sessionId: String,
    startTime: Date,
    endTime: Date,
    participants: [{
      userId: mongoose.Schema.Types.ObjectId,
      role: String
    }],
    status: {
      type: String,
      enum: ['scheduled', 'active', 'completed', 'cancelled']
    }
  }],
  
  // Room statistics
  statistics: {
    totalSessions: { type: Number, default: 0 },
    totalDuration: { type: Number, default: 0 }, // in minutes
    averageSessionDuration: { type: Number, default: 0 },
    lastUsed: Date,
    popularTimes: [{
      hour: Number,
      count: Number
    }]
  },
  
  // Room metadata
  metadata: {
    description: String,
    tags: [String],
    department: String,
    specialization: String
  },
  
  // Expiration settings
  expiration: {
    expiresAt: Date,
    autoDelete: { type: Boolean, default: false },
    warningsSent: { type: Number, default: 0 }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
videoCallRoomSchema.index({ createdBy: 1, status: 1 });
videoCallRoomSchema.index({ roomType: 1, status: 1 });
videoCallRoomSchema.index({ 'security.allowedUsers.userId': 1 });
videoCallRoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for active sessions count
videoCallRoomSchema.virtual('activeSessionsCount').get(function() {
  return this.scheduledSessions.filter(session => session.status === 'active').length;
});

// Methods
videoCallRoomSchema.methods.addAllowedUser = function(userId, role, permissions = {}) {
  const defaultPermissions = {
    canShare: role === 'doctor',
    canRecord: role === 'doctor',
    canMute: role === 'doctor'
  };
  
  this.security.allowedUsers.push({
    userId,
    role,
    permissions: { ...defaultPermissions, ...permissions }
  });
  
  return this.save();
};

videoCallRoomSchema.methods.removeAllowedUser = function(userId) {
  this.security.allowedUsers = this.security.allowedUsers.filter(
    user => user.userId.toString() !== userId.toString()
  );
  return this.save();
};

videoCallRoomSchema.methods.isUserAllowed = function(userId) {
  return this.security.allowedUsers.some(
    user => user.userId.toString() === userId.toString()
  );
};

videoCallRoomSchema.methods.getUserPermissions = function(userId) {
  const user = this.security.allowedUsers.find(
    user => user.userId.toString() === userId.toString()
  );
  return user ? user.permissions : null;
};

videoCallRoomSchema.methods.scheduleSession = function(sessionData) {
  this.scheduledSessions.push({
    sessionId: sessionData.sessionId,
    startTime: sessionData.startTime,
    endTime: sessionData.endTime,
    participants: sessionData.participants,
    status: 'scheduled'
  });
  return this.save();
};

videoCallRoomSchema.methods.updateStatistics = function(sessionDuration) {
  this.statistics.totalSessions += 1;
  this.statistics.totalDuration += sessionDuration;
  this.statistics.averageSessionDuration = 
    this.statistics.totalDuration / this.statistics.totalSessions;
  this.statistics.lastUsed = new Date();
  
  // Update popular times
  const hour = new Date().getHours();
  const timeSlot = this.statistics.popularTimes.find(slot => slot.hour === hour);
  if (timeSlot) {
    timeSlot.count += 1;
  } else {
    this.statistics.popularTimes.push({ hour, count: 1 });
  }
  
  return this.save();
};

// Static methods
videoCallRoomSchema.statics.findUserRooms = function(userId) {
  return this.find({
    $or: [
      { createdBy: userId },
      { 'security.allowedUsers.userId': userId }
    ],
    status: 'active'
  });
};

videoCallRoomSchema.statics.findAvailableRooms = function(userId, roomType = null) {
  const query = {
    'security.allowedUsers.userId': userId,
    status: 'active'
  };
  
  if (roomType) {
    query.roomType = roomType;
  }
  
  return this.find(query);
};

videoCallRoomSchema.statics.generateRoomId = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

module.exports = mongoose.model('VideoCallRoom', videoCallRoomSchema);
