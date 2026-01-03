const express = require('express');
const router = express.Router();
const Conversation = require('../models/conversation');
const Message = require('../models/message');
const Session = require('../models/session');
const { verifyToken } = require('../middleware/auth.middleware');

// Get all conversations for the logged-in user
// Only shows conversations with users they've had sessions with
router.get('/conversations', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const userRole = req.user.role;
    
    console.log('[CHAT] Fetching conversations for user:', {
      userId,
      role: userRole
    });
    
    // Get all conversations for this user
    const conversations = await Conversation.getConversationsForUser(userId);
    
    console.log('[CHAT] Found conversations:', {
      count: conversations.length,
      conversationIds: conversations.map(c => c._id.toString())
    });
    
    // Format conversations for frontend
    const formattedConversations = await Promise.all(conversations.map(async (conv, index) => {
      console.log(`[CHAT] Processing conversation ${index + 1}/${conversations.length}:`, {
        conversationId: conv._id,
        participantCount: conv.participants.length,
        participants: conv.participants.map(p => ({
          userId: p.userId?._id || p.userId || 'null',
          role: p.role,
          hasUserData: !!(p.userId?.firstName)
        }))
      });
      
      // Find the other participant (skip if userId is null)
      const otherParticipant = conv.participants.find(
        p => p.userId && p.userId._id && p.userId._id.toString() !== userId
      );
      
      if (!otherParticipant) {
        console.log(`[CHAT] WARNING: No valid other participant found in conversation ${conv._id} - skipping`);
        return null;
      }
      
      console.log(`[CHAT] Other participant found:`, {
        userId: otherParticipant.userId._id,
        name: `${otherParticipant.userId.firstName} ${otherParticipant.userId.lastName}`,
        role: otherParticipant.role
      });
      
      // Get unread count
      const unreadCount = await Message.getUnreadCount(conv._id, userId.toString());
      
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
    const userId = req.user._id.toString();
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
    // Verify user is part of this conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    const isParticipant = conversation.participants.some(
      p => p.userId && p.userId.toString() === userId
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
      isSentByMe: msg.senderId._id.toString() === userId,
      isRead: msg.isRead,
      createdAt: msg.createdAt
    }));
    
    // Mark messages as read
    await Message.markAsRead(conversationId, userId.toString());
    
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
    const userId = req.user._id.toString();
    
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
    const senderId = req.user._id.toString();
    
    if (!conversationId || !text) {
      return res.status(400).json({ message: 'Conversation ID and text are required' });
    }
    
    // Verify conversation exists and user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    const isParticipant = conversation.participants.some(
      p => p.userId && p.userId.toString() === senderId
    );
    
    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Find receiver
    const receiver = conversation.participants.find(
      p => p.userId && p.userId.toString() !== senderId
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
    const userId = req.user._id.toString();
    
    await Message.markAsRead(conversationId, userId);
    
    await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $set: {
          'participants.$[elem].lastReadAt': new Date()
        }
      },
      {
        arrayFilters: [{ 'elem.userId': req.user._id }]
      }
    );
    
    res.json({ message: 'Marked as read' });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ message: 'Failed to mark as read', error: error.message });
  }
});

// Get total unread message count for the logged-in user
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    
    // Get all conversations for this user
    const conversations = await Conversation.find({
      'participants.userId': req.user._id
    });
    
    // Calculate total unread count across all conversations
    let totalUnread = 0;
    for (const conv of conversations) {
      const unreadCount = await Message.getUnreadCount(conv._id, userId);
      totalUnread += unreadCount;
    }
    
    res.json({ unreadCount: totalUnread });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ message: 'Failed to fetch unread count', error: error.message });
  }
});

module.exports = router;
