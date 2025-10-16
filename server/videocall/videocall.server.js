/**
 * Video Call Server
 * Main server file for WebRTC video calling functionality
 * This is a standalone demo server that can be integrated with the main Veraawell server
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

// Import configurations
const { socketConfig } = require('./config/webrtc.config');

// Import middleware
const { authenticateToken, ensureHIPAACompliance } = require('./middleware/auth.middleware');

// Import routes
const videocallRoutes = require('./routes/videocall.routes');

// Import socket handlers
const SignalingSocket = require('./sockets/signaling.socket');

// Import utilities
const logger = require('./utils/logger');

class VideoCallServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, socketConfig);
    
    this.port = process.env.VIDEOCALL_PORT || 3002;
    this.mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veraawell-videocall';
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
    this.setupErrorHandling();
  }
  
  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // CORS configuration
    this.app.use(cors({
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id']
    }));
    
    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Security headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    });
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.info('Video call request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
    
    logger.info('Video call middleware setup completed');
  }
  
  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check endpoint (no auth required)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'videocall-server',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });
    
    // API documentation endpoint
    this.app.get('/api/docs', (req, res) => {
      res.json({
        service: 'Veraawell Video Call API',
        version: '1.0.0',
        endpoints: {
          rooms: {
            'POST /api/videocall/rooms': 'Create new room',
            'GET /api/videocall/rooms': 'Get user rooms',
            'GET /api/videocall/rooms/:id': 'Get room details',
            'PUT /api/videocall/rooms/:id': 'Update room',
            'DELETE /api/videocall/rooms/:id': 'Delete room'
          },
          sessions: {
            'POST /api/videocall/sessions/start': 'Start session',
            'POST /api/videocall/sessions/:id/end': 'End session',
            'GET /api/videocall/sessions': 'Get session history',
            'GET /api/videocall/sessions/:id': 'Get session details'
          },
          webrtc: {
            'GET /api/videocall/webrtc/config': 'Get WebRTC config',
            'GET /api/videocall/webrtc/stats': 'Get service stats'
          }
        },
        socketEvents: {
          client: ['join-room', 'leave-room', 'webrtc-offer', 'webrtc-answer', 'webrtc-ice-candidate'],
          server: ['room-joined', 'user-joined', 'user-left', 'webrtc-offer', 'webrtc-answer', 'webrtc-ice-candidate']
        }
      });
    });
    
    // Main video call API routes
    this.app.use('/api/videocall', videocallRoutes);
    
    // Catch-all for undefined routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Video call endpoint not found',
        availableEndpoints: '/api/docs'
      });
    });
    
    logger.info('Video call routes setup completed');
  }
  
  /**
   * Setup Socket.IO handlers
   */
  setupSocketHandlers() {
    // Create signaling socket handler
    this.signalingSocket = new SignalingSocket(this.io);
    
    // Global socket middleware for logging
    this.io.use((socket, next) => {
      logger.info('New socket connection attempt', {
        socketId: socket.id,
        remoteAddress: socket.handshake.address
      });
      next();
    });
    
    // Connection event logging
    this.io.on('connection', (socket) => {
      logger.info('Socket connected successfully', {
        socketId: socket.id,
        userId: socket.userId
      });
      
      socket.on('disconnect', (reason) => {
        logger.info('Socket disconnected', {
          socketId: socket.id,
          userId: socket.userId,
          reason
        });
      });
    });
    
    logger.info('Video call socket handlers setup completed');
  }
  
  /**
   * Setup error handling
   */
  setupErrorHandling() {
    // Express error handler
    this.app.use((error, req, res, next) => {
      logger.error('Express error handler', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method
      });
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { error: error.message })
      });
    });
    
    // Process error handlers
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
      
      // Graceful shutdown
      this.shutdown();
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason: reason.toString(),
        promise: promise.toString()
      });
    });
    
    // Graceful shutdown handlers
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, starting graceful shutdown');
      this.shutdown();
    });
    
    process.on('SIGINT', () => {
      logger.info('SIGINT received, starting graceful shutdown');
      this.shutdown();
    });
    
    logger.info('Video call error handling setup completed');
  }
  
  /**
   * Connect to MongoDB
   */
  async connectDatabase() {
    try {
      await mongoose.connect(this.mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      
      logger.info('Connected to MongoDB for video call service', {
        uri: this.mongoUri.replace(/\/\/.*@/, '//***:***@') // Hide credentials
      });
      
      // Setup database event listeners
      mongoose.connection.on('error', (error) => {
        logger.error('MongoDB connection error', { error: error.message });
      });
      
      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
      });
      
      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
      });
      
    } catch (error) {
      logger.error('Failed to connect to MongoDB', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Start the video call server
   */
  async start() {
    try {
      // Connect to database
      await this.connectDatabase();
      
      // Start HTTP server
      this.server.listen(this.port, () => {
        logger.info('Video Call Server started', {
          port: this.port,
          environment: process.env.NODE_ENV || 'development',
          pid: process.pid
        });
        
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    VERAAWELL VIDEO CALL SERVER              ║
║                                                              ║
║  🎥 Server running on: http://localhost:${this.port}                ║
║  📚 API Documentation: http://localhost:${this.port}/api/docs        ║
║  🔍 Health Check: http://localhost:${this.port}/health              ║
║                                                              ║
║  Ready for WebRTC video calls! 🚀                          ║
╚══════════════════════════════════════════════════════════════╝
        `);
      });
      
      // Setup periodic cleanup
      this.setupPeriodicTasks();
      
    } catch (error) {
      logger.error('Failed to start video call server', { error: error.message });
      process.exit(1);
    }
  }
  
  /**
   * Setup periodic maintenance tasks
   */
  setupPeriodicTasks() {
    // Clean up old logs every day
    setInterval(() => {
      logger.cleanupLogs(30); // Keep logs for 30 days
    }, 24 * 60 * 60 * 1000);
    
    // Log server statistics every hour
    setInterval(() => {
      const memUsage = process.memoryUsage();
      logger.info('Server statistics', {
        uptime: process.uptime(),
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB'
        },
        connections: this.io.engine.clientsCount
      });
    }, 60 * 60 * 1000);
    
    logger.info('Periodic maintenance tasks setup completed');
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Starting graceful shutdown of video call server');
    
    try {
      // Stop accepting new connections
      this.server.close(() => {
        logger.info('HTTP server closed');
      });
      
      // Close Socket.IO connections
      this.io.close(() => {
        logger.info('Socket.IO server closed');
      });
      
      // Close database connection
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
      
      logger.info('Video call server shutdown completed');
      process.exit(0);
      
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      process.exit(1);
    }
  }
}

// Create and export server instance
const videoCallServer = new VideoCallServer();

// Start server if this file is run directly
if (require.main === module) {
  videoCallServer.start().catch((error) => {
    console.error('Failed to start video call server:', error);
    process.exit(1);
  });
}

module.exports = videoCallServer;
