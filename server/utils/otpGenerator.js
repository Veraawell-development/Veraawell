/**
 * OTP Generator Utility
 * Handles OTP generation, hashing, and verification
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * Generate a 6-digit numeric OTP
 *
 * crypto.randomInt, not Math.random. Math.random is a non-cryptographic
 * PRNG whose internal state can be recovered from a handful of outputs; a
 * signup code drawn from it is guessable by anyone who has seen a few others.
 */
function generateOTP() {
    return String(crypto.randomInt(100000, 1000000));
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
 *
 * The input is coerced to a string: a client that posts the code as a JSON
 * number made bcrypt throw "Illegal arguments", which surfaced as a 500
 * instead of a wrong-code answer.
 *
 * @param {string} inputOTP - Plain text OTP from user
 * @param {string} hashedOTP - Hashed OTP from database
 * @returns {Promise<boolean>} - True if match, false otherwise
 */
async function verifyOTP(inputOTP, hashedOTP) {
    if (inputOTP === null || inputOTP === undefined || typeof hashedOTP !== 'string') return false;
    return bcrypt.compare(String(inputOTP), hashedOTP);
}

module.exports = {
    generateOTP,
    hashOTP,
    verifyOTP
};
