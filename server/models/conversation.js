const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
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
    lastReadAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastMessage: {
    text: String,
    senderId: mongoose.Schema.Types.ObjectId,
    timestamp: Date
  },
  // Track if this conversation is based on a session
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session'
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

// Index for fast lookups
conversationSchema.index({ 'participants.userId': 1 });
conversationSchema.index({ updatedAt: -1 });

// Method to get unread count for a user
conversationSchema.methods.getUnreadCount = function(userId) {
  const participant = this.participants.find(p => p.userId.toString() === userId.toString());
  if (!participant || !this.lastMessage) return 0;
  
  // Count messages after lastReadAt
  return this.lastMessage.timestamp > participant.lastReadAt ? 1 : 0;
};

// Static method to find or create conversation between two users
conversationSchema.statics.findOrCreateConversation = async function(user1Id, user2Id, sessionId = null) {
  // Find existing conversation
  let conversation = await this.findOne({
    'participants.userId': { $all: [user1Id, user2Id] }
  }).populate('participants.userId', 'firstName lastName email role');
  
  if (!conversation) {
    // Create new conversation
    const User = mongoose.model('User');
    const user1 = await User.findById(user1Id);
    const user2 = await User.findById(user2Id);
    
    if (!user1 || !user2) {
      throw new Error('Users not found');
    }
    
    conversation = await this.create({
      participants: [
        { userId: user1Id, role: user1.role },
        { userId: user2Id, role: user2.role }
      ],
      sessionId: sessionId
    });
    
    conversation = await conversation.populate('participants.userId', 'firstName lastName email role');
  }
  
  return conversation;
};

// Static method to get conversations for a user
conversationSchema.statics.getConversationsForUser = async function(userId) {
  const conversations = await this.find({
    'participants.userId': userId
  })
  .populate('participants.userId', 'firstName lastName email role')
  .sort({ updatedAt: -1 });
  
  return conversations;
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
