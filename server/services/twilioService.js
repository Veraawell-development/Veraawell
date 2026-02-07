const twilio = require('twilio');
const { createLogger } = require('../utils/logger');

const logger = createLogger('TWILIO');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

let client;

try {
    if (accountSid && authToken) {
        client = twilio(accountSid, authToken);
        logger.info('✅ Twilio client initialized');
    } else {
        logger.warn('⚠️ Twilio credentials missing in .env');
    }
} catch (error) {
    logger.error('❌ Failed to initialize Twilio client:', error);
}

/**
 * Format phone number to E.164 format (required by Twilio)
 * Assumes Indian numbers if no country code provided
 */
const formatPhoneNumber = (phoneNumber) => {
    if (!phoneNumber) return null;

    // Remove all non-numeric characters
    let cleaned = phoneNumber.toString().replace(/\D/g, '');

    // If empty
    if (!cleaned) return null;

    // If starts with 0, remove it
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }

    // If 10 digits, add +91 (India)
    if (cleaned.length === 10) {
        return `+91${cleaned}`;
    }

    // If 12 digits and starts with 91, add +
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
        return `+${cleaned}`;
    }

    // If already has keys (length > 10) and maybe other country code, define logic or assume it is correct with +
    // Ideally user inputs E.164, but we try to be smart.
    // For safety, if it looks like a full number, prepend + if missing
    return `+${cleaned}`;
};

/**
 * Send SMS using Twilio
 * @param {string} to - Recipient phone number
 * @param {string} body - Message content
 */
const sendSMS = async (to, body) => {
    if (!client) {
        logger.error('Twilio client not initialized. Cannot send SMS.');
        return { success: false, error: 'Client not initialized' };
    }

    const formattedTo = formatPhoneNumber(to);
    if (!formattedTo) {
        logger.warn(`Invalid phone number format: ${to}`);
        return { success: false, error: 'Invalid phone number' };
    }

    try {
        const message = await client.messages.create({
            body: body,
            from: fromNumber,
            to: formattedTo
        });

        logger.info(`✅ SMS sent to ${formattedTo}. SID: ${message.sid}`);
        return { success: true, sid: message.sid };
    } catch (error) {
        logger.error(`❌ Failed to send SMS to ${formattedTo}:`, {
            message: error.message,
            code: error.code
        });
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendSMS
};
