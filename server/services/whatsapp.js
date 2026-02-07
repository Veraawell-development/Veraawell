const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createLogger } = require('../utils/logger');

const logger = createLogger('WHATSAPP');

let client = null;
let isReady = false;

/**
 * Initialize WhatsApp Client
 * This will show a QR code in the terminal on first run
 */
const initializeWhatsApp = () => {
    return new Promise((resolve, reject) => {
        logger.info('Initializing WhatsApp Client...');

        client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './.wwebjs_auth' // Save session data here
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }
        });

        // QR Code Event - Scan this with your phone
        client.on('qr', (qr) => {
            logger.info('='.repeat(50));
            logger.info('📱 SCAN THIS QR CODE WITH YOUR WHATSAPP');
            logger.info('='.repeat(50));
            qrcode.generate(qr, { small: true });
            logger.info('='.repeat(50));
            logger.info('Go to: WhatsApp > Settings > Linked Devices > Link a Device');
            logger.info('='.repeat(50));
        });

        // Ready Event - Client is authenticated and ready
        client.on('ready', () => {
            isReady = true;
            logger.info('✅ WhatsApp Client is ready!');
            logger.info('You can now send notifications.');
            resolve(client);
        });

        // Authentication Success
        client.on('authenticated', () => {
            logger.info('✅ WhatsApp authenticated successfully');
        });

        // Authentication Failure
        client.on('auth_failure', (msg) => {
            logger.error('❌ WhatsApp authentication failed:', msg);
            reject(new Error('WhatsApp authentication failed'));
        });

        // Disconnected Event
        client.on('disconnected', (reason) => {
            isReady = false;
            logger.warn('⚠️ WhatsApp disconnected:', reason);
            logger.info('Will attempt to reconnect...');
        });

        // Initialize the client
        client.initialize().catch((error) => {
            logger.error('Failed to initialize WhatsApp client:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            reject(error);
        });

        // Add timeout - if not ready in 2 minutes, something is wrong
        setTimeout(() => {
            if (!isReady) {
                logger.warn('WhatsApp initialization taking longer than expected...');
                logger.info('If QR code appeared, please scan it with your phone');
            }
        }, 120000); // 2 minutes
    });
};

/**
 * Send WhatsApp Message
 * @param {string} phoneNumber - Phone number with country code (e.g., '919876543210')
 * @param {string} message - Message text to send
 */
const sendWhatsAppMessage = async (phoneNumber, message) => {
    if (!client || !isReady) {
        logger.warn('WhatsApp client not ready. Message not sent.');
        return { success: false, error: 'Client not ready' };
    }

    try {
        // Format: countrycode + number + @c.us
        // Example: 919876543210@c.us
        const chatId = `${phoneNumber}@c.us`;

        await client.sendMessage(chatId, message);
        logger.info(`✅ WhatsApp message sent to ${phoneNumber}`);

        return { success: true };
    } catch (error) {
        logger.error('Failed to send WhatsApp message:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Check if client is ready
 */
const isClientReady = () => {
    return isReady;
};

/**
 * Get client instance
 */
const getClient = () => {
    return client;
};

module.exports = {
    initializeWhatsApp,
    sendWhatsAppMessage,
    isClientReady,
    getClient
};
