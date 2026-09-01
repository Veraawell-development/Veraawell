const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { validateObjectIdParam, validateObjectIdBody } = require('../middleware/validation.middleware');
const chatController = require('../controllers/chat.controller');

router.get('/conversations', verifyToken, chatController.getConversations);
router.get('/messages/:conversationId', verifyToken, validateObjectIdParam('conversationId'), chatController.getMessages);
router.post('/conversation', verifyToken, validateObjectIdBody('otherUserId'), chatController.findOrCreateConversation);
router.post('/message', verifyToken, validateObjectIdBody('conversationId'), chatController.sendMessage);
router.put('/conversation/:conversationId/read', verifyToken, validateObjectIdParam('conversationId'), chatController.markAsRead);
router.get('/unread-count', verifyToken, chatController.getUnreadCount);

module.exports = router;
