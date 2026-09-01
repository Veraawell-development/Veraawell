/**
 * Lazily-constructed shared Razorpay client.
 *
 * Replaces three independent `new Razorpay({...})` calls that ran at MODULE
 * LOAD in controllers/session.controller.js, controllers/payment.controller.js
 * and controllers/adminPayments.controller.js.
 *
 * The Razorpay SDK constructor throws when key_id is absent:
 *     `key_id` or `oauthToken` is mandatory
 * and all three of those modules sit on app.js's require chain. So an unset
 * RAZORPAY_KEY_ID was not a degraded payment feature — it was the whole
 * process failing to boot, with a stack trace originating inside node_modules
 * and no mention of the variable an operator needed to set.
 *
 * Constructing on first use instead means:
 *   - a misconfigured server boots and serves everything that does not touch
 *     payments, and payment routes return a clean 503;
 *   - config/environment.js validateEnvironment() gets to report the missing
 *     variable by name at startup, before app.js is required at all.
 */

const Razorpay = require('razorpay');
const { isStubMode } = require('../config/payments');
const { AppError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('RAZORPAY');

let client = null;
let stub = null;

class PaymentsUnavailableError extends AppError {
  constructor(message = 'Payments are not configured on this server') {
    super(message, 503, true);
  }
}

/**
 * In-memory stand-in for local development without Razorpay credentials.
 * Deliberately NOT a silent no-op: it returns recognisably synthetic ids
 * (see config/payments.js isSyntheticPaymentId) so that any state derived
 * from them can be identified and rejected in production.
 */
function getStubClient() {
  if (stub) return stub;
  const crypto = require('crypto');
  const synthetic = (prefix) => `${prefix}${crypto.randomBytes(8).toString('hex')}`;
  stub = {
    orders: {
      create: async (payload) => {
        logger.warn('STUB PAYMENTS: fabricating an order — never in production', { amount: payload.amount });
        return { id: synthetic('order_stub_'), ...payload, status: 'created' };
      }
    },
    payments: {
      refund: async (paymentId, payload) => {
        logger.warn('STUB PAYMENTS: fabricating a refund', { paymentId, amount: payload && payload.amount });
        return { id: synthetic('rfnd_stub_'), status: 'processed', ...payload };
      },
      fetchMultipleRefund: async () => ({ items: [] })
    },
    accounts: {
      create: async (payload) => {
        logger.warn('STUB PAYMENTS: fabricating a linked account', { email: payload && payload.email });
        return { id: synthetic('acc_stub_'), status: 'created' };
      }
    }
  };
  return stub;
}

/**
 * @returns {import('razorpay')} the shared client
 * @throws {PaymentsUnavailableError} 503 when live mode is unconfigured
 */
function getRazorpay() {
  if (isStubMode()) return getStubClient();
  if (client) return client;

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    // A 503 on a payment route, not a dead process.
    throw new PaymentsUnavailableError();
  }

  client = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  logger.info('Razorpay client initialised');
  return client;
}

/** Whether a payment call can be attempted at all, without constructing. */
function isPaymentsAvailable() {
  return isStubMode() || !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/** Test seam: drop the memoised client so a test can change env between cases. */
function _resetForTests() {
  client = null;
  stub = null;
}

module.exports = { getRazorpay, isPaymentsAvailable, PaymentsUnavailableError, _resetForTests };
