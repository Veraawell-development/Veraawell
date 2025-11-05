const express = require('express');
const router = express.Router();
const Conversation = require('../models/conversation');
const Message = require('../models/message');
const Session = require('../models/session');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'veraawell_jwt_secret_key_2024_development_environment_secure_token_generation';

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.cookies.token;
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Get all conversations for the logged-in user
// Only shows conversations with users they've had sessions with
router.get('/conversations', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get all conversations for this user
    const conversations = await Conversation.getConversationsForUser(userId);
    
    // Format conversations for frontend
    const formattedConversations = await Promise.all(conversations.map(async (conv) => {
      // Find the other participant
      const otherParticipant = conv.participants.find(
        p => p.userId._id.toString() !== userId.toString()
      );
      
      if (!otherParticipant) return null;
      
      // Get unread count
      const unreadCount = await Message.getUnreadCount(conv._id, userId);
      
      return {
        _id: conv._id,
        userId: otherParticipant.userId._id,
        userName: `${otherParticipant.userId.firstName} ${otherParticipant.userId.lastName}`,
        userRole: otherParticipant.role,
        lastMessage: conv.lastMessage?.text || '',
        lastMessageTime: conv.lastMessage?.timestamp 
          ? new Date(conv.lastMessage.timestamp).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            })
          : '',
        unreadCount: unreadCount,
        updatedAt: conv.updatedAt
      };
    }));
    
    // Filter out null values and sort by updatedAt
    const validConversations = formattedConversations
      .filter(c => c !== null)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    
    res.json(validConversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ message: 'Failed to fetch conversations', error: error.message });
  }
});

// Get messages for a specific conversation
router.get('/messages/:conversationId', verifyToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
    // Verify user is part of this conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    const isParticipant = conversation.participants.some(
      p => p.userId.toString() === userId.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Get messages
    const messages = await Message.getMessagesForConversation(conversationId, limit, skip);
    
    // Format messages for frontend
    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      text: msg.text,
      timestamp: new Date(msg.createdAt).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }),
      senderId: msg.senderId._id,
      senderName: `${msg.senderId.firstName} ${msg.senderId.lastName}`,
      isSentByMe: msg.senderId._id.toString() === userId.toString(),
      isRead: msg.isRead,
      createdAt: msg.createdAt
    }));
    
    // Mark messages as read
    await Message.markAsRead(conversationId, userId);
    
    // Update lastReadAt for this user in conversation
    await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $set: {
          'participants.$[elem].lastReadAt': new Date()
        }
      },
      {
        arrayFilters: [{ 'elem.userId': userId }]
      }
    );
    
    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages', error: error.message });
  }
});

// Create or get conversation with another user
// Only allows if they have had a session together
router.post('/conversation', verifyToken, async (req, res) => {
  try {
    const { otherUserId } = req.body;
    const userId = req.userId;
    
    if (!otherUserId) {
      return res.status(400).json({ message: 'Other user ID is required' });
    }
    
    // Check if users have had a session together
    const session = await Session.findOne({
      $or: [
        { patientId: userId, doctorId: otherUserId },
        { patientId: otherUserId, doctorId: userId }
      ]
    });
    
    if (!session) {
      return res.status(403).json({ 
        message: 'Cannot create conversation. Users must have had a session together.' 
      });
    }
    
    // Find or create conversation
    const conversation = await Conversation.findOrCreateConversation(
      userId, 
      otherUserId, 
      session._id
    );
    
    res.json({ conversationId: conversation._id });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ message: 'Failed to create conversation', error: error.message });
  }
});

// Send a message (REST endpoint - also handled by Socket.IO)
router.post('/message', verifyToken, async (req, res) => {
  try {
    const { conversationId, text } = req.body;
    const senderId = req.userId;
    
    if (!conversationId || !text) {
      return res.status(400).json({ message: 'Conversation ID and text are required' });
    }
    
    // Verify conversation exists and user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    const isParticipant = conversation.participants.some(
      p => p.userId.toString() === senderId.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Find receiver
    const receiver = conversation.participants.find(
      p => p.userId.toString() !== senderId.toString()
    );
    
    // Create message
    const message = await Message.create({
      conversationId,
      senderId,
      receiverId: receiver.userId,
      text,
      isDelivered: true,
      deliveredAt: new Date()
    });
    
    // Update conversation's last message
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: {
        text,
        senderId,
        timestamp: message.createdAt
      },
      updatedAt: new Date()
    });
    
    // Populate sender info
    await message.populate('senderId', 'firstName lastName email role');
    
    res.json({
      _id: message._id,
      text: message.text,
      timestamp: new Date(message.createdAt).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }),
      senderId: message.senderId._id,
      senderName: `${message.senderId.firstName} ${message.senderId.lastName}`,
      isSentByMe: true,
      createdAt: message.createdAt
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Failed to send message', error: error.message });
  }
});

// Mark conversation as read
router.put('/conversation/:conversationId/read', verifyToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    
    await Message.markAsRead(conversationId, userId);
    
    await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $set: {
          'participants.$[elem].lastReadAt': new Date()
        }
      },
      {
        arrayFilters: [{ 'elem.userId': userId }]
      }
    );
    
    res.json({ message: 'Marked as read' });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ message: 'Failed to mark as read', error: error.message });
  }
});

module.exports = router;
