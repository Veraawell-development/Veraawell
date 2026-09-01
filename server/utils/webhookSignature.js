const crypto = require('crypto');

/**
 * Verify a Razorpay webhook signature against the exact raw request bytes.
 * Pulled out into its own testable function as part of the C12 fix — this
 * used to be computed inline against JSON.stringify(req.body), which is not
 * guaranteed to reproduce the exact bytes Razorpay signed (key order, numeric
 * formatting, unicode escaping can all differ), and could silently reject a
 * legitimate webhook.
 *
 * @param {Buffer|string} rawBody - the exact bytes of the request body
 * @param {string} signature - the X-Razorpay-Signature header value
 * @param {string} secret - the webhook secret
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const suppliedBuf = Buffer.from(signature, 'utf8');

  return expectedBuf.length === suppliedBuf.length && crypto.timingSafeEqual(expectedBuf, suppliedBuf);
}

module.exports = { verifyWebhookSignature };
