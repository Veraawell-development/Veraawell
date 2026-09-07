/**
 * Validation Middleware
 * Request validation utilities
 */

const mongoose = require('mongoose');
const { ValidationError } = require('../utils/errors');
const { VALID_ROLES, PASSWORD_POLICY } = require('../config/constants');

/**
 * `joi` is a declared dependency but was never actually used anywhere in this
 * codebase — validation.middleware.js was only ever wired for
 * register/login/reset-password, and none of the 17 route files under
 * server/routes/ import it. Rolling out full joi schemas for every route is
 * a large, separate undertaking; these are the highest-value, lowest-risk
 * additions: format-validating IDs before they reach a Mongoose query.
 * Without this, a malformed ObjectId (e.g. a client bug, a crafted request,
 * or literally the string "undefined" from a broken frontend call) throws an
 * uncaught Mongoose CastError that surfaces as a generic 500 instead of a
 * clean 400 — and the hand-rolled style already established in this file
 * (errors object + ValidationError) is what these follow, rather than
 * introducing joi's schema syntax as a second, inconsistent validation
 * pattern alongside it.
 */
function isValidObjectId(value) {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

/** Validates a route param is a well-formed Mongo ObjectId, e.g. router.get('/:sessionId', validateObjectIdParam('sessionId'), ...) */
function validateObjectIdParam(paramName) {
  return (req, res, next) => {
    if (!isValidObjectId(req.params[paramName])) {
      throw new ValidationError('Validation failed', { [paramName]: `${paramName} must be a valid ID` });
    }
    next();
  };
}

/** Validates a required body field is a well-formed Mongo ObjectId. */
function validateObjectIdBody(fieldName) {
  return (req, res, next) => {
    if (!isValidObjectId(req.body[fieldName])) {
      throw new ValidationError('Validation failed', { [fieldName]: `${fieldName} must be a valid ID` });
    }
    next();
  };
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
function isValidPassword(password) {
  if (password.length < PASSWORD_POLICY.MIN_LENGTH) {
    return { valid: false, message: `Password must be at least ${PASSWORD_POLICY.MIN_LENGTH} characters long` };
  }

  if (PASSWORD_POLICY.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }

  if (PASSWORD_POLICY.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }

  if (PASSWORD_POLICY.REQUIRE_NUMBER && !/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }

  return { valid: true };
}

/**
 * Validate role
 */
function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

/**
 * Validate registration data
 */
function validateRegistration(req, res, next) {
  const { firstName, email, password, role } = req.body;
  const errors = {};

  if (!firstName || !firstName.trim()) {
    errors.firstName = 'First name is required';
  }

  if (!email || !email.trim()) {
    errors.email = 'Email is required';
  } else if (!isValidEmail(email)) {
    errors.email = 'Invalid email format';
  }

  if (!password) {
    errors.password = 'Password is required';
  } else {
    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.valid) {
      errors.password = passwordValidation.message;
    }
  }

  // Restrict roles for public registration to prevent privilege escalation
  const allowedPublicRoles = ['patient', 'doctor', 'admin'];
  if (role && !allowedPublicRoles.includes(role)) {
    errors.role = `Invalid role. Public registration only allows: ${allowedPublicRoles.join(', ')}`;
  }

  // Professional validation for doctor fields
  if (role === 'doctor') {
    const { jobRole, specialization } = req.body;
    
    if (!jobRole || !jobRole.trim()) {
      errors.jobRole = 'Job role is required for doctors';
    }
    
    if (!specialization || !specialization.trim()) {
      errors.specialization = 'Specialization is required for doctors';
    }
  }

  if (Object.keys(errors).length > 0) {
    const { createLogger } = require('../utils/logger');
    const logger = createLogger('VALIDATION');
    logger.warn('Registration validation failed', { fields: Object.keys(errors) });
    throw new ValidationError('Validation failed', errors);
  }

  next();
}

/**
 * Validate login data
 */
function validateLogin(req, res, next) {
  const { username, password } = req.body;
  const errors = {};

  if (!username || !username.trim()) {
    errors.username = 'Username or email is required';
  }

  if (!password) {
    errors.password = 'Password is required';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  next();
}

/**
 * Validate password reset request
 */
function validatePasswordReset(req, res, next) {
  const { token, newPassword } = req.body;
  const errors = {};

  if (!token) {
    errors.token = 'Reset token is required';
  }

  if (!newPassword) {
    errors.newPassword = 'New password is required';
  } else {
    const passwordValidation = isValidPassword(newPassword);
    if (!passwordValidation.valid) {
      errors.newPassword = passwordValidation.message;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  next();
}

/**
 * Validate a public enquiry submission.
 *
 * Required fields vary by type, so the shape is checked per type rather than
 * with one flat list. Deliberately rejects an empty body before the controller
 * writes anything — the anonymous route sweep in
 * __tests__/e2e/authz.sweep.test.js posts `{}` to every route and asserts the
 * database is unchanged afterwards.
 */
function validateEnquiry(req, res, next) {
  const { type, name, email, message, subject, organisation, phone } = req.body || {};
  const errors = {};

  const VALID_TYPES = ['partner', 'other', 'contact'];
  if (!type) errors.type = 'Enquiry type is required';
  else if (!VALID_TYPES.includes(type)) errors.type = `Type must be one of: ${VALID_TYPES.join(', ')}`;

  if (!name || !String(name).trim()) errors.name = 'Name is required';
  else if (String(name).trim().length > 120) errors.name = 'Name must be 120 characters or fewer';

  if (!email || !String(email).trim()) errors.email = 'Email is required';
  else if (!isValidEmail(email)) errors.email = 'Invalid email format';

  if (!message || !String(message).trim()) errors.message = 'Message is required';
  else if (String(message).trim().length > 4000) errors.message = 'Message must be 4000 characters or fewer';

  // Type-specific requirements.
  if (type === 'partner' && (!organisation || !String(organisation).trim())) {
    errors.organisation = 'Organisation is required for a partnership enquiry';
  }
  if (type === 'other' && (!subject || !String(subject).trim())) {
    errors.subject = 'Subject is required';
  }

  // Length ceilings on the optional fields, so a caller cannot use them to
  // store arbitrarily large blobs.
  if (organisation && String(organisation).trim().length > 160) errors.organisation = 'Organisation must be 160 characters or fewer';
  if (subject && String(subject).trim().length > 200) errors.subject = 'Subject must be 200 characters or fewer';
  if (phone && String(phone).trim().length > 32) errors.phone = 'Phone number is too long';

  if (Object.keys(errors).length > 0) {
    const { createLogger } = require('../utils/logger');
    createLogger('VALIDATION').warn('Enquiry validation failed', { fields: Object.keys(errors) });
    throw new ValidationError('Validation failed', errors);
  }

  next();
}

module.exports = {
  isValidEmail,
  isValidPassword,
  isValidRole,
  isValidObjectId,
  validateObjectIdParam,
  validateObjectIdBody,
  validateRegistration,
  validateLogin,
  validatePasswordReset,
  validateEnquiry
};
