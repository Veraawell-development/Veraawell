/**
 * Logger Utility for Video Call System
 * Provides structured logging with different levels and HIPAA compliance
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logLevels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };
    
    this.currentLevel = process.env.LOG_LEVEL 
      ? this.logLevels[process.env.LOG_LEVEL.toUpperCase()] 
      : this.logLevels.INFO;
    
    this.logDir = path.join(__dirname, '../../logs');
    this.ensureLogDirectory();
  }
  
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }
  
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      ...meta
    };
    
    // Remove sensitive information for HIPAA compliance
    if (logEntry.userId) {
      logEntry.userId = this.hashUserId(logEntry.userId);
    }
    
    return JSON.stringify(logEntry);
  }
  
  hashUserId(userId) {
    // Simple hash for demo - use proper encryption in production
    return 'user_' + Buffer.from(userId.toString()).toString('base64').substr(0, 8);
  }
  
  writeToFile(level, formattedMessage) {
    const date = new Date().toISOString().split('T')[0];
    const filename = `videocall-${date}.log`;
    const filepath = path.join(this.logDir, filename);
    
    const logLine = formattedMessage + '\n';
    
    fs.appendFile(filepath, logLine, (err) => {
      if (err) {
        console.error('Failed to write to log file:', err);
      }
    });
  }
  
  log(level, message, meta = {}) {
    if (this.logLevels[level] <= this.currentLevel) {
      const formattedMessage = this.formatMessage(level, message, meta);
      
      // Console output with colors
      const colors = {
        ERROR: '\x1b[31m', // Red
        WARN: '\x1b[33m',  // Yellow
        INFO: '\x1b[36m',  // Cyan
        DEBUG: '\x1b[90m'  // Gray
      };
      
      const reset = '\x1b[0m';
      console.log(`${colors[level]}[${level}]${reset} ${formattedMessage}`);
      
      // Write to file
      this.writeToFile(level, formattedMessage);
    }
  }
  
  error(message, meta = {}) {
    this.log('ERROR', message, meta);
  }
  
  warn(message, meta = {}) {
    this.log('WARN', message, meta);
  }
  
  info(message, meta = {}) {
    this.log('INFO', message, meta);
  }
  
  debug(message, meta = {}) {
    this.log('DEBUG', message, meta);
  }
  
  // Video call specific logging methods
  sessionLog(action, sessionId, userId, details = {}) {
    this.info(`Session ${action}`, {
      sessionId,
      userId,
      action,
      component: 'session',
      ...details
    });
  }
  
  webrtcLog(event, sessionId, userId, details = {}) {
    this.debug(`WebRTC ${event}`, {
      sessionId,
      userId,
      event,
      component: 'webrtc',
      ...details
    });
  }
  
  securityLog(event, userId, details = {}) {
    this.warn(`Security event: ${event}`, {
      userId,
      event,
      component: 'security',
      ...details
    });
  }
  
  performanceLog(metric, value, sessionId, details = {}) {
    this.info(`Performance metric: ${metric}`, {
      metric,
      value,
      sessionId,
      component: 'performance',
      ...details
    });
  }
  
  auditLog(action, userId, resourceId, details = {}) {
    this.info(`Audit: ${action}`, {
      action,
      userId,
      resourceId,
      component: 'audit',
      timestamp: new Date().toISOString(),
      ...details
    });
  }
  
  // Error tracking for video calls
  trackError(error, context = {}) {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      ...context
    };
    
    this.error('Video call error tracked', errorInfo);
    
    // In production, you might want to send this to an error tracking service
    // like Sentry, Rollbar, etc.
  }
  
  // Connection quality logging
  logConnectionQuality(sessionId, userId, quality, stats = {}) {
    this.info('Connection quality update', {
      sessionId,
      userId,
      quality,
      stats,
      component: 'connection-quality'
    });
  }
  
  // Room activity logging
  logRoomActivity(roomId, action, userId, details = {}) {
    this.info(`Room activity: ${action}`, {
      roomId,
      action,
      userId,
      component: 'room',
      ...details
    });
  }
  
  // HIPAA compliance logging
  hipaaLog(action, userId, dataType, details = {}) {
    this.info(`HIPAA: ${action}`, {
      action,
      userId,
      dataType,
      component: 'hipaa-compliance',
      timestamp: new Date().toISOString(),
      ...details
    });
  }
  
  // Cleanup old log files (call this periodically)
  cleanupLogs(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    fs.readdir(this.logDir, (err, files) => {
      if (err) {
        this.error('Failed to read log directory for cleanup', { error: err.message });
        return;
      }
      
      files.forEach(file => {
        if (file.startsWith('videocall-') && file.endsWith('.log')) {
          const filepath = path.join(this.logDir, file);
          
          fs.stat(filepath, (err, stats) => {
            if (err) return;
            
            if (stats.mtime < cutoffDate) {
              fs.unlink(filepath, (err) => {
                if (err) {
                  this.error('Failed to delete old log file', { file, error: err.message });
                } else {
                  this.info('Deleted old log file', { file });
                }
              });
            }
          });
        }
      });
    });
  }
}

// Create singleton instance
const logger = new Logger();

// Export both the class and instance
module.exports = logger;
module.exports.Logger = Logger;
