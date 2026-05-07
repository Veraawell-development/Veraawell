const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const chatController = require('../controllers/chat.controller');

router.get('/conversations', verifyToken, chatController.getConversations);
router.get('/messages/:conversationId', verifyToken, chatController.getMessages);
router.post('/conversation', verifyToken, chatController.findOrCreateConversation);
router.post('/message', verifyToken, chatController.sendMessage);
router.put('/conversation/:conversationId/read', verifyToken, chatController.markAsRead);
router.get('/unread-count', verifyToken, chatController.getUnreadCount);

module.exports = router;
