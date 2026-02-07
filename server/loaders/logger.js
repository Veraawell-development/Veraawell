const winston = require('winston');
const rTracer = require('cls-rtracer');
const { isProduction } = require('../config/environment');

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

const level = () => {
    const env = process.env.NODE_ENV || 'development';
    const isDevelopment = env === 'development';
    return isDevelopment ? 'debug' : 'info';
};

const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

winston.addColors(colors);

// Custom format to include correlation ID
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.errors({ stack: true }), // Include stack trace
    winston.format.printf((info) => {
        // Get the request ID from cls-rtracer
        const rid = rTracer.id();
        const requestId = rid ? `[requestId:${rid}]` : '';
        const { timestamp, level, message, stack, ...meta } = info;

        // In production, we want strict JSON
        if (isProduction()) {
            return JSON.stringify({
                timestamp,
                level,
                requestId: rid || undefined,
                message,
                stack,
                ...meta
            });
        }

        // In development, we want readable colored text
        return `${timestamp} ${level}: ${requestId} ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
            } ${stack || ''}`;
    })
);

// Only colorize in development for readability
const devFormat = winston.format.combine(
    winston.format.colorize({ all: true }),
    format
);

const transports = [
    new winston.transports.Console({
        format: isProduction() ? format : devFormat,
    }),
];

const Logger = winston.createLogger({
    level: level(),
    levels,
    transports,
});

/**
 * Wrapper class to maintain backward compatibility with existing Logger usage
 * but using Winston under the hood.
 */
class LegacyLoggerAdapter {
    constructor(context = 'APP') {
        this.context = context;
    }

    // Helper to attach context to meta
    _meta(data) {
        return { context: this.context, ...data };
    }

    error(message, data = {}) {
        Logger.error(message, this._meta(data));
    }

    warn(message, data = {}) {
        Logger.warn(message, this._meta(data));
    }

    info(message, data = {}) {
        Logger.info(message, this._meta(data));
    }

    debug(message, data = {}) {
        Logger.debug(message, this._meta(data));
    }

    http(message, data = {}) {
        Logger.http(message, this._meta(data));
    }
}

// Export the winston instance directly for internal use
module.exports.winston = Logger;

// Export the factory function to match existing Interface
module.exports.createLogger = (context) => {
    return new LegacyLoggerAdapter(context);
};
