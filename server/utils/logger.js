/**
 * Logger Utility
 * Uses Winston for structured, colorized console output.
 * HTTP request logs are handled separately via the morgan middleware.
 */

const winston = require('winston');

const isProduction = process.env.NODE_ENV === 'production';

// ─── ANSI color map per log level ─────────────────────────────────────────────
const LEVEL_COLORS = {
  error: '\x1b[31m',   // red
  warn:  '\x1b[33m',   // yellow
  info:  '\x1b[36m',   // cyan
  debug: '\x1b[90m',   // dark gray
};

const CONTEXT_COLOR = '\x1b[35m'; // magenta for context tag
const RESET = '\x1b[0m';
const DIM   = '\x1b[2m';
const BOLD  = '\x1b[1m';

// ─── Custom pretty format for development console ────────────────────────────
const devFormat = winston.format.printf(({ level, message, context, timestamp, ...meta }) => {
  const levelColor = LEVEL_COLORS[level] || '';
  const levelTag   = `${levelColor}${BOLD}${level.toUpperCase().padEnd(5)}${RESET}`;
  const ctxTag     = context ? `${CONTEXT_COLOR}[${context}]${RESET}` : '';
  const ts         = `${DIM}${timestamp}${RESET}`;

  // Serialize extra metadata compactly
  const keys = Object.keys(meta);
  const metaStr = keys.length
    ? ` ${DIM}${JSON.stringify(meta)}${RESET}`
    : '';

  return `${ts}  ${levelTag}  ${ctxTag} ${message}${metaStr}`;
});

// ─── Production JSON format ───────────────────────────────────────────────────
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// ─── Create base winston instance ─────────────────────────────────────────────
const winstonLogger = winston.createLogger({
  level: isProduction ? 'info' : (process.env.LOG_LEVEL || 'debug'),
  format: isProduction
    ? prodFormat
    : winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
        devFormat
      ),
  transports: [
    new winston.transports.Console({ handleExceptions: false }),
  ],
  exitOnError: false,
});

// ─── Logger class — drop-in replacement for old Logger ────────────────────────
class Logger {
  constructor(context = 'APP') {
    this.context = context;
  }

  _log(level, message, data = {}) {
    const meta = data instanceof Error
      ? { error: data.message, stack: data.stack }
      : (typeof data === 'object' && data !== null ? data : {});

    winstonLogger.log(level, message, { context: this.context, ...meta });
  }

  error(message, data = {})  { this._log('error', message, data); }
  warn(message,  data = {})  { this._log('warn',  message, data); }
  info(message,  data = {})  { this._log('info',  message, data); }
  debug(message, data = {})  {
    // In development, suppress very noisy CORS + token-extraction debug lines
    // unless LOG_VERBOSE=true is set in .env
    if (!isProduction && process.env.LOG_VERBOSE !== 'true') {
      const noisy = ['CORS: Allowing', 'Token extracted', 'Token verified'];
      if (noisy.some(n => message.startsWith(n))) return;
    }
    this._log('debug', message, data);
  }
}

function createLogger(context) {
  return new Logger(context);
}

/**
 * An id truncated for logs, from a value of any shape.
 *
 * The log line is not allowed to be the thing that fails the request. It was:
 * report.controller.js did `sessionId.substring(0, 8)` on a value that comes
 * from `req.authz.derived`, where the policy's derive returns `session._id` —
 * a Mongoose ObjectId, which has no .substring. The report had already been
 * written and the session already updated by the time that line ran, so the
 * doctor saw "Failed to submit report", pressed the button again, and filed a
 * second copy of a report that had saved correctly the first time.
 *
 * Ids in this codebase arrive as strings (req.params, req.actor.id) and as
 * ObjectIds (anything derived from a loaded document), and the two are not
 * distinguishable at the call site without knowing the policy. So convert
 * rather than assume.
 */
function shortId(value) {
  if (value === null || value === undefined) return undefined;
  return String(value).substring(0, 8);
}

module.exports = {
  Logger,
  createLogger,
  shortId,
  LOG_LEVELS: { ERROR: 'error', WARN: 'warn', INFO: 'info', DEBUG: 'debug' }
};
