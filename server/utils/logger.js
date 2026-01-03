/**
 * Logging Utility
 * Centralized logging with levels and formatting
 */

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Log levels
 */
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

/**
 * Logger class
 */
class Logger {
  constructor(context = 'APP') {
    this.context = context;
  }

  /**
   * Format log message
   */
  format(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const context = `[${this.context}]`;
    const levelTag = `[${level.toUpperCase()}]`;
    
    if (Object.keys(data).length > 0) {
      return `${timestamp} ${context} ${levelTag} ${message} ${JSON.stringify(data)}`;
    }
    return `${timestamp} ${context} ${levelTag} ${message}`;
  }

  /**
   * Error log
   */
  error(message, data = {}) {
    if (!isProduction || process.env.LOG_LEVEL === 'error') {
      console.error(this.format(LOG_LEVELS.ERROR, message, data));
    }
  }

  /**
   * Warning log
   */
  warn(message, data = {}) {
    if (!isProduction || ['error', 'warn'].includes(process.env.LOG_LEVEL)) {
      console.warn(this.format(LOG_LEVELS.WARN, message, data));
    }
  }

  /**
   * Info log
   */
  info(message, data = {}) {
    if (!isProduction || ['error', 'warn', 'info'].includes(process.env.LOG_LEVEL)) {
      console.log(this.format(LOG_LEVELS.INFO, message, data));
    }
  }

  /**
   * Debug log (only in development)
   */
  debug(message, data = {}) {
    if (!isProduction) {
      console.log(this.format(LOG_LEVELS.DEBUG, message, data));
    }
  }
}

/**
 * Create logger instance
 */
function createLogger(context) {
  return new Logger(context);
}

module.exports = {
  Logger,
  createLogger,
  LOG_LEVELS
};
