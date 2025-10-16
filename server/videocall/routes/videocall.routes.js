/**
 * Video Call Routes
 * Defines REST API endpoints for video call functionality
 */

const express = require('express');
const router = express.Router();

// Controllers
const roomController = require('../controllers/room.controller');
const sessionController = require('../controllers/session.controller');

// Middleware
const { 
  authenticateToken, 
  authorizeVideoCall, 
  rateLimitVideoCall,
  ensureHIPAACompliance,
  handleAuthErrors
} = require('../middleware/auth.middleware');

// Services
const webrtcService = require('../services/webrtc.service');
const logger = require('../utils/logger');

// Apply common middleware to all routes
router.use(authenticateToken);
router.use(authorizeVideoCall);
router.use(ensureHIPAACompliance);
router.use(rateLimitVideoCall(20, 15 * 60 * 1000)); // 20 requests per 15 minutes

// ============================================================================
// ROOM MANAGEMENT ROUTES
// ============================================================================

/**
 * @route   POST /api/videocall/rooms
 * @desc    Create a new video call room
 * @access  Private (Doctor, Admin)
 */
router.post('/rooms', async (req, res) => {
  try {
    await roomController.createRoom(req, res);
  } catch (error) {
    logger.error('Route error - create room', { error: error.message, userId: req.user.id });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   GET /api/videocall/rooms
 * @desc    Get user's video call rooms
 * @access  Private
 */
router.get('/rooms', async (req, res) => {
  try {
    await roomController.getUserRooms(req, res);
  } catch (error) {
    logger.error('Route error - get user rooms', { error: error.message, userId: req.user.id });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   GET /api/videocall/rooms/:roomId
 * @desc    Get specific room details
 * @access  Private
 */
router.get('/rooms/:roomId', async (req, res) => {
  try {
    await roomController.getRoomDetails(req, res);
  } catch (error) {
    logger.error('Route error - get room details', { 
      error: error.message, 
      userId: req.user.id,
      roomId: req.params.roomId 
    });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   POST /api/videocall/rooms/:roomId/join
 * @desc    Join a room with access code
 * @access  Private
 */
router.post('/rooms/:roomId/join', async (req, res) => {
  try {
    await roomController.joinRoom(req, res);
  } catch (error) {
    logger.error('Route error - join room', { 
      error: error.message, 
      userId: req.user.id,
      roomId: req.params.roomId 
    });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   PUT /api/videocall/rooms/:roomId
 * @desc    Update room settings
 * @access  Private (Room Creator, Admin)
 */
router.put('/rooms/:roomId', async (req, res) => {
  try {
    await roomController.updateRoom(req, res);
  } catch (error) {
    logger.error('Route error - update room', { 
      error: error.message, 
      userId: req.user.id,
      roomId: req.params.roomId 
    });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   DELETE /api/videocall/rooms/:roomId
 * @desc    Archive/Delete a room
 * @access  Private (Room Creator, Admin)
 */
router.delete('/rooms/:roomId', async (req, res) => {
  try {
    await roomController.deleteRoom(req, res);
  } catch (error) {
    logger.error('Route error - delete room', { 
      error: error.message, 
      userId: req.user.id,
      roomId: req.params.roomId 
    });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   GET /api/videocall/rooms/:roomId/stats
 * @desc    Get room statistics and analytics
 * @access  Private (Room Creator, Participants, Admin)
 */
router.get('/rooms/:roomId/stats', async (req, res) => {
  try {
    await roomController.getRoomStatistics(req, res);
  } catch (error) {
    logger.error('Route error - get room stats', { 
      error: error.message, 
      userId: req.user.id,
      roomId: req.params.roomId 
    });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ============================================================================
// SESSION MANAGEMENT ROUTES
// ============================================================================

/**
 * @route   POST /api/videocall/sessions/start
 * @desc    Start a new video call session
 * @access  Private
 */
router.post('/sessions/start', async (req, res) => {
  try {
    await sessionController.startSession(req, res);
  } catch (error) {
    logger.error('Route error - start session', { error: error.message, userId: req.user.id });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   POST /api/videocall/sessions/:sessionId/end
 * @desc    End a video call session
 * @access  Private (Session Participants)
 */
router.post('/sessions/:sessionId/end', async (req, res) => {
  try {
    await sessionController.endSession(req, res);
  } catch (error) {
    logger.error('Route error - end session', { 
      error: error.message, 
      userId: req.user.id,
      sessionId: req.params.sessionId 
    });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   GET /api/videocall/sessions/:sessionId
 * @desc    Get session details
 * @access  Private (Session Participants, Admin)
 */
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    await sessionController.getSession(req, res);
  } catch (error) {
    logger.error('Route error - get session', { 
      error: error.message, 
      userId: req.user.id,
      sessionId: req.params.sessionId 
    });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   GET /api/videocall/sessions
 * @desc    Get user's session history
 * @access  Private
 */
router.get('/sessions', async (req, res) => {
  try {
    await sessionController.getUserSessions(req, res);
  } catch (error) {
    logger.error('Route error - get user sessions', { error: error.message, userId: req.user.id });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   POST /api/videocall/sessions/:sessionId/recording-consent
 * @desc    Update recording consent for session
 * @access  Private (Session Participants)
 */
router.post('/sessions/:sessionId/recording-consent', async (req, res) => {
  try {
    await sessionController.updateRecordingConsent(req, res);
  } catch (error) {
    logger.error('Route error - update recording consent', { 
      error: error.message, 
      userId: req.user.id,
      sessionId: req.params.sessionId 
    });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   GET /api/videocall/sessions/:sessionId/report
 * @desc    Generate session report
 * @access  Private (Doctor, Admin)
 */
router.get('/sessions/:sessionId/report', async (req, res) => {
  try {
    await sessionController.generateSessionReport(req, res);
  } catch (error) {
    logger.error('Route error - generate session report', { 
      error: error.message, 
      userId: req.user.id,
      sessionId: req.params.sessionId 
    });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   GET /api/videocall/sessions/active
 * @desc    Get active sessions (monitoring)
 * @access  Private (Doctor, Admin)
 */
router.get('/sessions/active', async (req, res) => {
  try {
    await sessionController.getActiveSessions(req, res);
  } catch (error) {
    logger.error('Route error - get active sessions', { error: error.message, userId: req.user.id });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ============================================================================
// WEBRTC CONFIGURATION ROUTES
// ============================================================================

/**
 * @route   GET /api/videocall/webrtc/config
 * @desc    Get WebRTC configuration for client
 * @access  Private
 */
router.get('/webrtc/config', (req, res) => {
  try {
    const { sessionType = 'therapy', quality = 'high' } = req.query;
    
    const config = {
      iceServers: webrtcService.createPeerConnectionConfig(null, req.user.id).iceServers,
      mediaConstraints: webrtcService.getMediaConstraints(sessionType, quality),
      screenShareConstraints: webrtcService.getScreenShareConstraints()
    };
    
    logger.info('WebRTC config requested', {
      userId: req.user.id,
      sessionType,
      quality
    });
    
    res.json({
      success: true,
      data: config
    });
    
  } catch (error) {
    logger.error('Route error - get WebRTC config', { error: error.message, userId: req.user.id });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   GET /api/videocall/webrtc/stats
 * @desc    Get WebRTC service statistics
 * @access  Private (Admin only)
 */
router.get('/webrtc/stats', (req, res) => {
  try {
    // Only admins can view service statistics
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const stats = webrtcService.getStatsSummary();
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    logger.error('Route error - get WebRTC stats', { error: error.message, userId: req.user.id });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ============================================================================
// HEALTH CHECK ROUTES
// ============================================================================

/**
 * @route   GET /api/videocall/health
 * @desc    Health check for video call service
 * @access  Private
 */
router.get('/health', (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'videocall',
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      webrtc: webrtcService.getStatsSummary()
    };
    
    res.json({
      success: true,
      data: health
    });
    
  } catch (error) {
    logger.error('Route error - health check', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: 'Health check failed',
      status: 'unhealthy'
    });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Handle authentication errors
router.use(handleAuthErrors);

// Handle 404 for undefined routes
router.use('*', (req, res) => {
  logger.warn('Video call route not found', {
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.id
  });
  
  res.status(404).json({
    success: false,
    message: 'Video call endpoint not found'
  });
});

// General error handler
router.use((error, req, res, next) => {
  logger.error('Unhandled video call route error', {
    error: error.message,
    stack: error.stack,
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.id
  });
  
  res.status(500).json({
    success: false,
    message: 'Internal server error in video call service'
  });
});

module.exports = router;
