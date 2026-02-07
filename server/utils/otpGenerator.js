/**
 * OTP Generator Utility
 * Handles OTP generation, hashing, and verification
 */

const bcrypt = require('bcryptjs');

/**
 * Generate a 6-digit numeric OTP
 */
function generateOTP() {
    // Generate random 6-digit number (100000 to 999999)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    return otp;
}

/**
 * Hash OTP using bcrypt
 * @param {string} otp - Plain text OTP
 * @returns {Promise<string>} - Hashed OTP
 */
async function hashOTP(otp) {
    const salt = await bcrypt.genSalt(10);
    const hashedOTP = await bcrypt.hash(otp, salt);
    return hashedOTP;
}

/**
 * Verify if input OTP matches hashed OTP
 * @param {string} inputOTP - Plain text OTP from user
 * @param {string} hashedOTP - Hashed OTP from database
 * @returns {Promise<boolean>} - True if match, false otherwise
 */
async function verifyOTP(inputOTP, hashedOTP) {
    const isMatch = await bcrypt.compare(inputOTP, hashedOTP);
    return isMatch;
}

/**
 * Check if OTP is expired
 * @param {Date} expiresAt - Expiry timestamp
 * @returns {boolean} - True if expired
 */
function isExpired(expiresAt) {
    return new Date() > expiresAt;
}

/**
 * Generate expiry time (5 minutes from now)
 * @returns {Date} - Expiry timestamp
 */
function getExpiryTime() {
    const expiryMinutes = 5;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    return expiresAt;
}

module.exports = {
    generateOTP,
    hashOTP,
    verifyOTP,
    isExpired,
    getExpiryTime
};
