/**
 * WhatsApp Service
 * Sends WhatsApp notifications via whatsapp-web.js.
 * NOTE: On first run, a QR code will appear in logs — scan once to authenticate.
 * Session is then persisted to .wwebjs_auth so QR is not needed again.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createLogger } = require('../utils/logger');

const logger = createLogger('WHATSAPP');

let client = null;
let isReady = false;

/**
 * Initialize the WhatsApp web client.
 * Runs non-blocking — server starts regardless of WhatsApp auth state.
 */
const initializeWhatsApp = () => {
  return new Promise((resolve, reject) => {
    logger.info('Initializing WhatsApp client...');

    client = new Client({
      authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu']
      }
    });

    // QR code is only needed on first-time auth — session is reused after
    client.on('qr', (qr) => {
      logger.info('WhatsApp auth required. Scan QR with your phone:');
      logger.info('  WhatsApp > Settings > Linked Devices > Link a Device');
      qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
      isReady = true;
      logger.info('WhatsApp client ready');
      resolve(client);
    });

    client.on('authenticated', () => {
      logger.info('WhatsApp authenticated successfully');
    });

    client.on('auth_failure', (msg) => {
      logger.error('WhatsApp authentication failed', { msg });
      reject(new Error('WhatsApp authentication failed'));
    });

    client.on('disconnected', (reason) => {
      isReady = false;
      logger.warn('WhatsApp disconnected', { reason });
    });

    client.initialize().catch((error) => {
      logger.error('WhatsApp client initialization error', { message: error.message, name: error.name });
      reject(error);
    });

    // Warn if still not ready after 2 minutes
    setTimeout(() => {
      if (!isReady) logger.warn('WhatsApp initialization taking longer than expected — check if QR was scanned');
    }, 120000);
  });
};

/**
 * Send a WhatsApp message.
 * @param {string} phoneNumber - Country code + number e.g. '919876543210'
 * @param {string} message - Text to send
 */
const sendWhatsAppMessage = async (phoneNumber, message) => {
  if (!client || !isReady) {
    logger.warn('WhatsApp client not ready — message not sent');
    return { success: false, error: 'Client not ready' };
  }
  try {
    await client.sendMessage(`${phoneNumber}@c.us`, message);
    logger.info('WhatsApp message sent', { phoneNumber });
    return { success: true };
  } catch (error) {
    logger.error('WhatsApp send failed', { error: error.message });
    return { success: false, error: error.message };
  }
};

const isClientReady = () => isReady;
const getClient = () => client;

module.exports = { initializeWhatsApp, sendWhatsAppMessage, isClientReady, getClient };
