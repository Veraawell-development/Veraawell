/**
 * Security Utilities for Video Call System
 * Provides encryption, access codes, and security validation
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class SecurityUtils {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
  }
  
  /**
   * Generate secure random access code for rooms
   */
  generateAccessCode(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      result += chars[randomIndex];
    }
    
    return result;
  }
  
  /**
   * Generate secure session token
   */
  generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * Generate encryption key for room
   */
  generateEncryptionKey() {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }
  
  /**
   * Hash access code for storage
   */
  async hashAccessCode(accessCode) {
    const saltRounds = 12;
    return await bcrypt.hash(accessCode, saltRounds);
  }
  
  /**
   * Verify access code
   */
  async verifyAccessCode(accessCode, hashedCode) {
    return await bcrypt.compare(accessCode, hashedCode);
  }
  
  /**
   * Encrypt sensitive data
   */
  encrypt(text, key) {
    try {
      const keyBuffer = Buffer.from(key, 'hex');
      const iv = crypto.randomBytes(this.ivLength);
      
      const cipher = crypto.createCipher(this.algorithm, keyBuffer, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      throw new Error('Encryption failed: ' + error.message);
    }
  }
  
  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData, key) {
    try {
      const keyBuffer = Buffer.from(key, 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');
      
      const decipher = crypto.createDecipher(this.algorithm, keyBuffer, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error('Decryption failed: ' + error.message);
    }
  }
  
  /**
   * Generate secure room ID
   */
  generateRoomId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `${timestamp}-${random}`;
  }
  
  /**
   * Validate room access permissions
   */
  validateRoomAccess(user, room, accessCode = null) {
    // Check if room is active
    if (room.status !== 'active') {
      return {
        allowed: false,
        reason: 'Room is not active'
      };
    }
    
    // Check if user is in allowed list
    const allowedUser = room.security.allowedUsers.find(
      u => u.userId.toString() === user.id.toString()
    );
    
    if (allowedUser) {
      return {
        allowed: true,
        permissions: allowedUser.permissions,
        role: allowedUser.role
      };
    }
    
    // Check access code if provided
    if (accessCode && room.security.accessCode === accessCode) {
      return {
        allowed: true,
        permissions: this.getDefaultPermissions(user.role),
        role: user.role,
        guestAccess: true
      };
    }
    
    return {
      allowed: false,
      reason: 'Access denied'
    };
  }
  
  /**
   * Get default permissions based on user role
   */
  getDefaultPermissions(role) {
    const permissions = {
      patient: {
        canShare: false,
        canRecord: false,
        canMute: false,
        canInvite: false
      },
      doctor: {
        canShare: true,
        canRecord: true,
        canMute: true,
        canInvite: true
      },
      admin: {
        canShare: true,
        canRecord: true,
        canMute: true,
        canInvite: true
      }
    };
    
    return permissions[role] || permissions.patient;
  }
  
  /**
   * Sanitize user input to prevent XSS
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }
    
    return input
      .replace(/[<>]/g, '') // Remove < and >
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }
  
  /**
   * Validate session token
   */
  validateSessionToken(token) {
    // Check token format
    if (!token || typeof token !== 'string') {
      return false;
    }
    
    // Check token length (64 hex characters = 32 bytes)
    if (token.length !== 64) {
      return false;
    }
    
    // Check if token is valid hex
    const hexRegex = /^[0-9a-f]+$/i;
    return hexRegex.test(token);
  }
  
  /**
   * Generate CSRF token
   */
  generateCSRFToken() {
    return crypto.randomBytes(32).toString('base64');
  }
  
  /**
   * Rate limiting helper
   */
  createRateLimiter(maxRequests, windowMs) {
    const requests = new Map();
    
    return {
      isAllowed: (identifier) => {
        const now = Date.now();
        const userRequests = requests.get(identifier) || [];
        
        // Remove old requests
        const validRequests = userRequests.filter(
          timestamp => now - timestamp < windowMs
        );
        
        if (validRequests.length >= maxRequests) {
          return false;
        }
        
        validRequests.push(now);
        requests.set(identifier, validRequests);
        return true;
      },
      
      getRemainingRequests: (identifier) => {
        const now = Date.now();
        const userRequests = requests.get(identifier) || [];
        const validRequests = userRequests.filter(
          timestamp => now - timestamp < windowMs
        );
        
        return Math.max(0, maxRequests - validRequests.length);
      },
      
      getResetTime: (identifier) => {
        const userRequests = requests.get(identifier) || [];
        if (userRequests.length === 0) return 0;
        
        const oldestRequest = Math.min(...userRequests);
        return oldestRequest + windowMs;
      }
    };
  }
  
  /**
   * Validate WebRTC ICE candidate for security
   */
  validateICECandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }
    
    // Check required fields
    const requiredFields = ['candidate', 'sdpMid', 'sdpMLineIndex'];
    for (const field of requiredFields) {
      if (!(field in candidate)) {
        return false;
      }
    }
    
    // Validate candidate string format
    const candidateStr = candidate.candidate;
    if (typeof candidateStr !== 'string' || candidateStr.length > 1000) {
      return false;
    }
    
    // Basic format validation (should start with 'candidate:')
    if (!candidateStr.startsWith('candidate:')) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Validate WebRTC SDP for security
   */
  validateSDP(sdp) {
    if (!sdp || typeof sdp !== 'object') {
      return false;
    }
    
    // Check required fields
    if (!sdp.type || !sdp.sdp) {
      return false;
    }
    
    // Validate SDP type
    const validTypes = ['offer', 'answer', 'pranswer', 'rollback'];
    if (!validTypes.includes(sdp.type)) {
      return false;
    }
    
    // Validate SDP string
    if (typeof sdp.sdp !== 'string' || sdp.sdp.length > 10000) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Generate audit trail entry
   */
  generateAuditEntry(action, userId, resourceId, details = {}) {
    return {
      timestamp: new Date().toISOString(),
      action,
      userId: this.hashUserId(userId),
      resourceId,
      details: this.sanitizeAuditDetails(details),
      hash: this.generateAuditHash(action, userId, resourceId, details)
    };
  }
  
  /**
   * Hash user ID for audit logs (HIPAA compliance)
   */
  hashUserId(userId) {
    return crypto
      .createHash('sha256')
      .update(userId.toString() + process.env.AUDIT_SALT || 'default-salt')
      .digest('hex')
      .substring(0, 16);
  }
  
  /**
   * Sanitize audit details to remove sensitive information
   */
  sanitizeAuditDetails(details) {
    const sanitized = { ...details };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'accessCode', 'key'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
  
  /**
   * Generate hash for audit entry integrity
   */
  generateAuditHash(action, userId, resourceId, details) {
    const data = JSON.stringify({ action, userId, resourceId, details });
    return crypto
      .createHash('sha256')
      .update(data + process.env.AUDIT_SECRET || 'default-secret')
      .digest('hex');
  }
}

// Create singleton instance
const securityUtils = new SecurityUtils();

// Export utility functions
module.exports = {
  generateAccessCode: securityUtils.generateAccessCode.bind(securityUtils),
  generateSessionToken: securityUtils.generateSessionToken.bind(securityUtils),
  generateEncryptionKey: securityUtils.generateEncryptionKey.bind(securityUtils),
  hashAccessCode: securityUtils.hashAccessCode.bind(securityUtils),
  verifyAccessCode: securityUtils.verifyAccessCode.bind(securityUtils),
  encrypt: securityUtils.encrypt.bind(securityUtils),
  decrypt: securityUtils.decrypt.bind(securityUtils),
  generateRoomId: securityUtils.generateRoomId.bind(securityUtils),
  validateRoomAccess: securityUtils.validateRoomAccess.bind(securityUtils),
  getDefaultPermissions: securityUtils.getDefaultPermissions.bind(securityUtils),
  sanitizeInput: securityUtils.sanitizeInput.bind(securityUtils),
  validateSessionToken: securityUtils.validateSessionToken.bind(securityUtils),
  generateCSRFToken: securityUtils.generateCSRFToken.bind(securityUtils),
  createRateLimiter: securityUtils.createRateLimiter.bind(securityUtils),
  validateICECandidate: securityUtils.validateICECandidate.bind(securityUtils),
  validateSDP: securityUtils.validateSDP.bind(securityUtils),
  generateAuditEntry: securityUtils.generateAuditEntry.bind(securityUtils),
  SecurityUtils
};
