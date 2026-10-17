const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { validateObjectIdParam, validateObjectIdBody } = require('../middleware/validation.middleware');
const { authorize, requireRole } = require('../authz');
const chatController = require('../controllers/chat.controller');

// Chat is between a patient and a doctor who have had a session. The three
// routes that address a conversation run the same participant policy the
// /chat socket events do (authz/policies/conversation.policy.js); the other
// three are self-scoped by req.actor.id, so a role gate is the whole policy.
router.get('/conversations', verifyToken, requireRole('patient', 'doctor'), chatController.getConversations);
router.get('/messages/:conversationId', verifyToken, validateObjectIdParam('conversationId'), authorize('conversation:participate'), chatController.getMessages);
router.post('/conversation', verifyToken, requireRole('patient', 'doctor'), validateObjectIdBody('otherUserId'), chatController.findOrCreateConversation);
router.post('/message', verifyToken, validateObjectIdBody('conversationId'), authorize('conversation:participate', { from: 'body' }), chatController.sendMessage);
router.put('/conversation/:conversationId/read', verifyToken, validateObjectIdParam('conversationId'), authorize('conversation:participate'), chatController.markAsRead);
router.get('/unread-count', verifyToken, requireRole('patient', 'doctor'), chatController.getUnreadCount);

module.exports = router;
