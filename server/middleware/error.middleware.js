/**
 * Error Handling Middleware
 * Global error handler for Express
 */

const { AppError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');
const { isProduction } = require('../config/environment');

const logger = createLogger('ERROR');

/** The status the handler below will answer with, decided once for logging. */
function statusFor(err) {
  if (err instanceof AppError) return err.statusCode;
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') return 401;
  if (err.name === 'ValidationError') return 400;
  if (err.code === 11000) return 409;
  return err.statusCode || 500;
}

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  // A 4xx is the request's problem, not the server's, and most are routine:
  // every anonymous page view asks /api/protected and gets a 401. Those were
  // logged at ERROR with a full stack, so production logs were mostly noise
  // and a real failure was hard to find among them. Client errors are now a
  // one-line warning; only 5xx (and anything unexpected) is logged as an error.
  const status = statusFor(err);
  const context = { message: err.message, status, url: req.originalUrl, method: req.method, ip: req.ip };
  if (status >= 500) {
    logger.error('Error occurred', { ...context, stack: isProduction() ? undefined : err.stack });
  } else if (status === 401) {
    // "Not signed in" — the normal answer for every anonymous visitor.
    logger.debug('Unauthenticated request', context);
  } else {
    logger.warn('Request refused', context);
  }

  // Handle known application errors.
  //
  // `code` and `category` are surfaced so the client can tell one 403 from
  // another. Two client behaviours depend on this:
  //   - utils/csrfFetchInterceptor.ts treats every 403 as a stale CSRF token
  //     and discards its cached token; it should only do that for
  //     category === 'csrf'.
  //   - a 403 coded ACCOUNT_REFUSED (suspended, or a practitioner not
  //     approved) ends the session wherever it comes from; any other 403 is
  //     an answer about that one request.
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.code && { code: err.code }),
      ...(err.category && { category: err.category }),
      ...(err.errors && { errors: err.errors })
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired'
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: err.errors
    });
  }

  // Handle MongoDB duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      success: false,
      message: `${field} already exists`
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = isProduction() && statusCode === 500
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    ...(!isProduction() && { stack: err.stack })
  });
}

/**
 * 404 handler
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
}

/**
 * Async handler wrapper to catch errors in async routes
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
