const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  isDelivered: {
    type: Boolean,
    default: false
  },
  deliveredAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, receiverId: 1 });

// Static method to get messages for a conversation
messageSchema.statics.getMessagesForConversation = async function(conversationId, limit = 50, skip = 0) {
  const messages = await this.find({ conversationId })
    .populate('senderId', 'firstName lastName email role')
    .populate('receiverId', 'firstName lastName email role')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
  
  return messages.reverse(); // Return in chronological order
};

// Static method to mark messages as read
messageSchema.statics.markAsRead = async function(conversationId, userId) {
  const result = await this.updateMany(
    {
      conversationId,
      receiverId: userId,
      isRead: false
    },
    {
      $set: {
        isRead: true,
        readAt: new Date()
      }
    }
  );
  
  return result;
};

// Static method to get unread count
messageSchema.statics.getUnreadCount = async function(conversationId, userId) {
  const count = await this.countDocuments({
    conversationId,
    receiverId: userId,
    isRead: false
  });
  
  return count;
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
