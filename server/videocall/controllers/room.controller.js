/**
 * Video Call Room Controller
 * Handles REST API endpoints for room management
 */

const VideoCallRoom = require('../models/VideoCallRoom');
const VideoCallSession = require('../models/VideoCallSession');
const logger = require('../utils/logger');
const { generateAccessCode, validateRoomAccess } = require('../utils/security');

class RoomController {
  
  /**
   * Create a new video call room
   * POST /api/videocall/rooms
   */
  async createRoom(req, res) {
    try {
      const { roomName, roomType, settings, allowedUsers } = req.body;
      const createdBy = req.user.id;
      
      // Generate unique room ID
      let roomId;
      let isUnique = false;
      while (!isUnique) {
        roomId = VideoCallRoom.generateRoomId();
        const existingRoom = await VideoCallRoom.findOne({ roomId });
        isUnique = !existingRoom;
      }
      
      // Create room with security settings
      const room = new VideoCallRoom({
        roomId,
        roomName,
        roomType: roomType || 'therapy',
        createdBy,
        security: {
          accessCode: generateAccessCode(),
          allowedUsers: allowedUsers || []
        },
        settings: {
          maxParticipants: 2,
          recordingEnabled: false,
          screenSharingEnabled: true,
          chatEnabled: true,
          backgroundBlurEnabled: true,
          qualitySettings: {
            videoQuality: 'high',
            audioQuality: 'high'
          },
          ...settings
        }
      });
      
      // Add creator as allowed user
      await room.addAllowedUser(createdBy, req.user.role, {
        canShare: true,
        canRecord: req.user.role === 'doctor',
        canMute: req.user.role === 'doctor'
      });
      
      await room.save();
      
      logger.info(`Room created: ${roomId} by user ${createdBy}`);
      
      res.status(201).json({
        success: true,
        message: 'Room created successfully',
        data: {
          roomId: room.roomId,
          roomName: room.roomName,
          accessCode: room.security.accessCode,
          settings: room.settings
        }
      });
      
    } catch (error) {
      logger.error('Error creating room:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create room',
        error: error.message
      });
    }
  }
  
  /**
   * Get room details
   * GET /api/videocall/rooms/:roomId
   */
  async getRoomDetails(req, res) {
    try {
      const { roomId } = req.params;
      const userId = req.user.id;
      
      const room = await VideoCallRoom.findOne({ roomId })
        .populate('createdBy', 'firstName lastName role')
        .populate('security.allowedUsers.userId', 'firstName lastName role');
      
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }
      
      // Check access permissions
      if (!room.isUserAllowed(userId) && room.createdBy._id.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this room'
        });
      }
      
      // Get active session if any
      const activeSession = await VideoCallSession.findActiveSession(roomId);
      
      res.json({
        success: true,
        data: {
          roomId: room.roomId,
          roomName: room.roomName,
          roomType: room.roomType,
          status: room.status,
          createdBy: room.createdBy,
          settings: room.settings,
          statistics: room.statistics,
          activeSession: activeSession ? {
            sessionId: activeSession.sessionId,
            participants: activeSession.participants,
            startTime: activeSession.actualStartTime
          } : null,
          userPermissions: room.getUserPermissions(userId)
        }
      });
      
    } catch (error) {
      logger.error('Error getting room details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get room details',
        error: error.message
      });
    }
  }
  
  /**
   * Get user's rooms
   * GET /api/videocall/rooms
   */
  async getUserRooms(req, res) {
    try {
      const userId = req.user.id;
      const { type, status = 'active' } = req.query;
      
      let query = {
        $or: [
          { createdBy: userId },
          { 'security.allowedUsers.userId': userId }
        ],
        status
      };
      
      if (type) {
        query.roomType = type;
      }
      
      const rooms = await VideoCallRoom.find(query)
        .populate('createdBy', 'firstName lastName role')
        .sort({ updatedAt: -1 })
        .limit(50);
      
      // Get active sessions for each room
      const roomsWithSessions = await Promise.all(
        rooms.map(async (room) => {
          const activeSession = await VideoCallSession.findActiveSession(room.roomId);
          return {
            roomId: room.roomId,
            roomName: room.roomName,
            roomType: room.roomType,
            createdBy: room.createdBy,
            statistics: room.statistics,
            activeSession: activeSession ? {
              sessionId: activeSession.sessionId,
              participantCount: activeSession.participants.length,
              startTime: activeSession.actualStartTime
            } : null,
            lastUsed: room.statistics.lastUsed,
            userPermissions: room.getUserPermissions(userId)
          };
        })
      );
      
      res.json({
        success: true,
        data: roomsWithSessions
      });
      
    } catch (error) {
      logger.error('Error getting user rooms:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get rooms',
        error: error.message
      });
    }
  }
  
  /**
   * Join room with access code
   * POST /api/videocall/rooms/:roomId/join
   */
  async joinRoom(req, res) {
    try {
      const { roomId } = req.params;
      const { accessCode } = req.body;
      const userId = req.user.id;
      
      const room = await VideoCallRoom.findOne({ roomId, status: 'active' });
      
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found or inactive'
        });
      }
      
      // Validate access code
      if (room.security.accessCode !== accessCode) {
        return res.status(401).json({
          success: false,
          message: 'Invalid access code'
        });
      }
      
      // Check if user is already allowed
      if (!room.isUserAllowed(userId)) {
        // Add user to allowed list (for guest access)
        await room.addAllowedUser(userId, req.user.role);
      }
      
      res.json({
        success: true,
        message: 'Access granted to room',
        data: {
          roomId: room.roomId,
          roomName: room.roomName,
          settings: room.settings,
          userPermissions: room.getUserPermissions(userId)
        }
      });
      
    } catch (error) {
      logger.error('Error joining room:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to join room',
        error: error.message
      });
    }
  }
  
  /**
   * Update room settings
   * PUT /api/videocall/rooms/:roomId
   */
  async updateRoom(req, res) {
    try {
      const { roomId } = req.params;
      const userId = req.user.id;
      const updates = req.body;
      
      const room = await VideoCallRoom.findOne({ roomId });
      
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }
      
      // Check if user has permission to update
      if (room.createdBy.toString() !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Permission denied'
        });
      }
      
      // Update allowed fields
      const allowedUpdates = ['roomName', 'settings', 'metadata'];
      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
          if (key === 'settings') {
            room.settings = { ...room.settings.toObject(), ...updates.settings };
          } else {
            room[key] = updates[key];
          }
        }
      });
      
      await room.save();
      
      logger.info(`Room updated: ${roomId} by user ${userId}`);
      
      res.json({
        success: true,
        message: 'Room updated successfully',
        data: {
          roomId: room.roomId,
          roomName: room.roomName,
          settings: room.settings
        }
      });
      
    } catch (error) {
      logger.error('Error updating room:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update room',
        error: error.message
      });
    }
  }
  
  /**
   * Delete/Archive room
   * DELETE /api/videocall/rooms/:roomId
   */
  async deleteRoom(req, res) {
    try {
      const { roomId } = req.params;
      const userId = req.user.id;
      
      const room = await VideoCallRoom.findOne({ roomId });
      
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }
      
      // Check permissions
      if (room.createdBy.toString() !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Permission denied'
        });
      }
      
      // Check for active sessions
      const activeSession = await VideoCallSession.findActiveSession(roomId);
      if (activeSession) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete room with active session'
        });
      }
      
      // Archive instead of delete (for audit purposes)
      room.status = 'archived';
      await room.save();
      
      logger.info(`Room archived: ${roomId} by user ${userId}`);
      
      res.json({
        success: true,
        message: 'Room archived successfully'
      });
      
    } catch (error) {
      logger.error('Error deleting room:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete room',
        error: error.message
      });
    }
  }
  
  /**
   * Get room statistics
   * GET /api/videocall/rooms/:roomId/stats
   */
  async getRoomStatistics(req, res) {
    try {
      const { roomId } = req.params;
      const userId = req.user.id;
      
      const room = await VideoCallRoom.findOne({ roomId });
      
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }
      
      // Check access
      if (!room.isUserAllowed(userId) && room.createdBy.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      // Get session history
      const sessions = await VideoCallSession.find({ roomId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('sessionId status actualStartTime endTime participants metrics');
      
      res.json({
        success: true,
        data: {
          roomStatistics: room.statistics,
          recentSessions: sessions,
          totalSessions: room.statistics.totalSessions,
          averageDuration: room.statistics.averageSessionDuration,
          lastUsed: room.statistics.lastUsed
        }
      });
      
    } catch (error) {
      logger.error('Error getting room statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get statistics',
        error: error.message
      });
    }
  }
}

module.exports = new RoomController();
