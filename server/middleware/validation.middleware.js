/**
 * Validation Middleware
 * Request validation utilities
 */

const { ValidationError } = require('../utils/errors');
const { VALID_ROLES, PASSWORD_POLICY } = require('../config/constants');

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

  if (role && !isValidRole(role)) {
    errors.role = `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`;
  }

  if (Object.keys(errors).length > 0) {
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

module.exports = {
  isValidEmail,
  isValidPassword,
  isValidRole,
  validateRegistration,
  validateLogin,
  validatePasswordReset
};
