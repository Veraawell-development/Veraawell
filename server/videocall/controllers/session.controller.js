/**
 * Video Call Session Controller
 * Handles session management, recording, and analytics
 */

const VideoCallSession = require('../models/VideoCallSession');
const VideoCallRoom = require('../models/VideoCallRoom');
const logger = require('../utils/logger');
const { generateSessionReport } = require('../utils/reporting');

class SessionController {
  
  /**
   * Start a new video call session
   * POST /api/videocall/sessions/start
   */
  async startSession(req, res) {
    try {
      const { roomId, sessionType = 'therapy' } = req.body;
      const userId = req.user.id;
      
      // Validate room access
      const room = await VideoCallRoom.findOne({ roomId, status: 'active' });
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found or inactive'
        });
      }
      
      if (!room.isUserAllowed(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this room'
        });
      }
      
      // Check for existing active session
      const existingSession = await VideoCallSession.findActiveSession(roomId);
      if (existingSession) {
        return res.status(400).json({
          success: false,
          message: 'Room already has an active session',
          data: {
            sessionId: existingSession.sessionId,
            startTime: existingSession.actualStartTime
          }
        });
      }
      
      // Create new session
      const session = new VideoCallSession({
        sessionId: this.generateSessionId(),
        roomId,
        sessionType,
        scheduledStartTime: new Date(),
        actualStartTime: new Date(),
        status: 'active'
      });
      
      await session.save();
      
      // Add audit log
      await session.addAuditLog('session-started', userId, `Session started by ${req.user.role}`);
      
      logger.info(`Session started: ${session.sessionId} in room ${roomId} by user ${userId}`);
      
      res.status(201).json({
        success: true,
        message: 'Session started successfully',
        data: {
          sessionId: session.sessionId,
          roomId: session.roomId,
          startTime: session.actualStartTime,
          status: session.status
        }
      });
      
    } catch (error) {
      logger.error('Error starting session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start session',
        error: error.message
      });
    }
  }
  
  /**
   * End a video call session
   * POST /api/videocall/sessions/:sessionId/end
   */
  async endSession(req, res) {
    try {
      const { sessionId } = req.params;
      const { notes, rating } = req.body;
      const userId = req.user.id;
      
      const session = await VideoCallSession.findOne({ sessionId });
      
      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }
      
      if (session.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Session is not active'
        });
      }
      
      // Check if user is participant
      const isParticipant = session.participants.some(
        p => p.userId.toString() === userId
      );
      
      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to end this session'
        });
      }
      
      // End session
      session.status = 'ended';
      session.endTime = new Date();
      
      // Add notes if provided (usually by doctor)
      if (notes && req.user.role === 'doctor') {
        session.notes = notes;
      }
      
      // Calculate session metrics
      const duration = Math.floor((session.endTime - session.actualStartTime) / 1000);
      session.metrics.duration = duration;
      
      await session.save();
      
      // Update room statistics
      const room = await VideoCallRoom.findOne({ roomId: session.roomId });
      if (room) {
        await room.updateStatistics(Math.floor(duration / 60)); // duration in minutes
      }
      
      // Add audit log
      await session.addAuditLog('session-ended', userId, `Session ended by ${req.user.role}`);
      
      logger.info(`Session ended: ${sessionId} by user ${userId}, duration: ${duration}s`);
      
      res.json({
        success: true,
        message: 'Session ended successfully',
        data: {
          sessionId: session.sessionId,
          duration: duration,
          endTime: session.endTime
        }
      });
      
    } catch (error) {
      logger.error('Error ending session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to end session',
        error: error.message
      });
    }
  }
  
  /**
   * Get session details
   * GET /api/videocall/sessions/:sessionId
   */
  async getSession(req, res) {
    try {
      const { sessionId } = req.params;
      const userId = req.user.id;
      
      const session = await VideoCallSession.findOne({ sessionId })
        .populate('participants.userId', 'firstName lastName role');
      
      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }
      
      // Check if user is participant or has access
      const isParticipant = session.participants.some(
        p => p.userId._id.toString() === userId
      );
      
      if (!isParticipant && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this session'
        });
      }
      
      res.json({
        success: true,
        data: {
          sessionId: session.sessionId,
          roomId: session.roomId,
          status: session.status,
          sessionType: session.sessionType,
          startTime: session.actualStartTime,
          endTime: session.endTime,
          duration: session.sessionDuration,
          participants: session.participants,
          metrics: session.metrics,
          notes: session.notes,
          recording: session.recording
        }
      });
      
    } catch (error) {
      logger.error('Error getting session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get session',
        error: error.message
      });
    }
  }
  
  /**
   * Get user's session history
   * GET /api/videocall/sessions
   */
  async getUserSessions(req, res) {
    try {
      const userId = req.user.id;
      const { 
        page = 1, 
        limit = 20, 
        status, 
        sessionType,
        startDate,
        endDate 
      } = req.query;
      
      // Build query
      let query = {
        'participants.userId': userId
      };
      
      if (status) {
        query.status = status;
      }
      
      if (sessionType) {
        query.sessionType = sessionType;
      }
      
      if (startDate || endDate) {
        query.actualStartTime = {};
        if (startDate) {
          query.actualStartTime.$gte = new Date(startDate);
        }
        if (endDate) {
          query.actualStartTime.$lte = new Date(endDate);
        }
      }
      
      // Execute query with pagination
      const sessions = await VideoCallSession.find(query)
        .populate('participants.userId', 'firstName lastName role')
        .sort({ actualStartTime: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .select('-privacy.auditLog -technical.errors'); // Exclude sensitive data
      
      const totalSessions = await VideoCallSession.countDocuments(query);
      
      res.json({
        success: true,
        data: {
          sessions,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalSessions / limit),
            totalSessions,
            hasNext: page * limit < totalSessions,
            hasPrev: page > 1
          }
        }
      });
      
    } catch (error) {
      logger.error('Error getting user sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get sessions',
        error: error.message
      });
    }
  }
  
  /**
   * Update session recording consent
   * POST /api/videocall/sessions/:sessionId/recording-consent
   */
  async updateRecordingConsent(req, res) {
    try {
      const { sessionId } = req.params;
      const { consentGiven } = req.body;
      const userId = req.user.id;
      
      const session = await VideoCallSession.findOne({ sessionId });
      
      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }
      
      // Check if user is participant
      const isParticipant = session.participants.some(
        p => p.userId.toString() === userId
      );
      
      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update recording consent'
        });
      }
      
      // Update recording consent
      session.recording.consentGiven = consentGiven;
      session.recording.consentTimestamp = new Date();
      
      if (consentGiven) {
        session.recording.enabled = true;
      }
      
      await session.save();
      
      // Add audit log
      await session.addAuditLog(
        'recording-consent-updated', 
        userId, 
        `Recording consent: ${consentGiven ? 'granted' : 'denied'}`
      );
      
      logger.info(`Recording consent updated for session ${sessionId}: ${consentGiven}`);
      
      res.json({
        success: true,
        message: 'Recording consent updated successfully',
        data: {
          consentGiven: session.recording.consentGiven,
          recordingEnabled: session.recording.enabled
        }
      });
      
    } catch (error) {
      logger.error('Error updating recording consent:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update recording consent',
        error: error.message
      });
    }
  }
  
  /**
   * Generate session report
   * GET /api/videocall/sessions/:sessionId/report
   */
  async generateSessionReport(req, res) {
    try {
      const { sessionId } = req.params;
      const userId = req.user.id;
      
      const session = await VideoCallSession.findOne({ sessionId })
        .populate('participants.userId', 'firstName lastName role');
      
      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }
      
      // Check permissions (only doctors and participants)
      const isParticipant = session.participants.some(
        p => p.userId._id.toString() === userId
      );
      
      if (!isParticipant && req.user.role !== 'doctor' && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied to session report'
        });
      }
      
      // Generate comprehensive report
      const report = await generateSessionReport(session);
      
      res.json({
        success: true,
        data: report
      });
      
    } catch (error) {
      logger.error('Error generating session report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate session report',
        error: error.message
      });
    }
  }
  
  /**
   * Get active sessions for monitoring
   * GET /api/videocall/sessions/active
   */
  async getActiveSessions(req, res) {
    try {
      const userId = req.user.id;
      
      // Only doctors and admins can view all active sessions
      if (req.user.role !== 'doctor' && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      const activeSessions = await VideoCallSession.find({ status: 'active' })
        .populate('participants.userId', 'firstName lastName role')
        .select('sessionId roomId actualStartTime participants metrics')
        .sort({ actualStartTime: -1 });
      
      res.json({
        success: true,
        data: {
          activeSessions,
          totalActive: activeSessions.length
        }
      });
      
    } catch (error) {
      logger.error('Error getting active sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get active sessions',
        error: error.message
      });
    }
  }
  
  // Utility methods
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

module.exports = new SessionController();
