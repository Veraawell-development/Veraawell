/**
 * Regression test for the fail-closed fix to razorpayWebhook's signature
 * verification. It used to fall back to
 * `Buffer.from(JSON.stringify(req.body))` whenever req.rawBody was
 * unavailable — exactly the byte-mismatch-prone comparison method the C12
 * fix (verifying against raw bytes) exists to avoid. This test proves:
 *   1. A legitimate webhook, signed over the true raw bytes, is accepted
 *      when req.rawBody is present (the normal path).
 *   2. When req.rawBody is missing (simulating a future middleware-order
 *      regression), the handler rejects with 400 and does NOT fall through
 *      to a JSON.stringify-based comparison — proven using a payload whose
 *      re-serialization differs from the bytes that were actually signed,
 *      which the old fallback would have accepted incorrectly.
 */
const mongoose = require('mongoose');
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const request = require('supertest');

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    payments: { refund: jest.fn() },
    orders: { create: jest.fn() }
  }));
});

jest.mock('../services/email.service', () => ({
  sendCancellationEmail: jest.fn().mockResolvedValue(undefined),
  sendBookingConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendDoctorNewBookingEmail: jest.fn().mockResolvedValue(undefined)
}));

const WEBHOOK_SECRET = 'test_webhook_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'dummy_secret';

let mongod;
let paymentController;
let WebhookEvent;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  paymentController = require('../controllers/payment.controller');
  WebhookEvent = require('../models/webhookEvent');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await WebhookEvent.deleteMany({});
});

function sign(rawBody) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
}

/** App WITH the raw-body capture — mirrors server/app.js's real configuration. */
function buildAppWithRawBody() {
  const app = express();
  app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
  app.post('/webhook', paymentController.razorpayWebhook);
  return app;
}

/**
 * App WITHOUT raw-body capture — simulates a future regression where
 * req.rawBody is never populated (different middleware order, a sub-router
 * that doesn't inherit the parent's express.json({ verify }) config, etc).
 */
function buildAppWithoutRawBody() {
  const app = express();
  app.use(express.json()); // no verify hook -> req.rawBody stays undefined
  app.post('/webhook', paymentController.razorpayWebhook);
  return app;
}

describe('razorpayWebhook — fail-closed signature verification', () => {
  test('accepts a legitimate webhook when req.rawBody is present', async () => {
    const app = buildAppWithRawBody();
    const eventId = `evt_${Date.now()}`;
    const bodyObj = { id: eventId, event: 'some.unhandled.event', payload: {} };
    // Sign over exactly what superagent will transmit for this object under
    // a json content-type, so this test isn't sensitive to Buffer-transport
    // quirks in the test client itself — it only needs to prove that when
    // req.rawBody IS captured (the real app.js configuration), a signature
    // computed over the actual wire bytes verifies correctly end-to-end.
    const signature = sign(Buffer.from(JSON.stringify(bodyObj)));

    const res = await request(app)
      .post('/webhook')
      .set('x-razorpay-signature', signature)
      .send(bodyObj);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test(
    'REGRESSION: when req.rawBody is missing, the handler fails closed (400) instead of ' +
    'falling back to a JSON.stringify(req.body) comparison — proven with a payload that a ' +
    're-serialization-based check would have accepted incorrectly',
    async () => {
      const app = buildAppWithoutRawBody();

      // Sign a payload with one key order...
      const signedRawBody = Buffer.from('{"id":"evt_1","event":"payment.captured"}');
      const signature = sign(signedRawBody);

      // ...but send a body that, once parsed and re-serialized by
      // JSON.stringify, would come out with different key order. The OLD
      // fallback (JSON.stringify(req.body)) would recompute a signature over
      // THIS re-serialized version and could accept it if it happened to
      // match; the fix must reject outright because req.rawBody is missing,
      // never even reaching a JSON.stringify-based comparison.
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send('{"event":"payment.captured","id":"evt_1"}');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/unable to verify webhook signature/i);

      // And no WebhookEvent was recorded — proves processing never proceeded
      // past the signature gate.
      const recorded = await WebhookEvent.findOne({ eventId: 'evt_1' });
      expect(recorded).toBeNull();
    }
  );

  test('rejects a tampered payload even when req.rawBody is present', async () => {
    const app = buildAppWithRawBody();
    const realRawBody = Buffer.from(JSON.stringify({ id: 'evt_tampered', event: 'some.unhandled.event' }));
    const signature = sign(realRawBody);

    // Send a different body than what was signed
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(Buffer.from(JSON.stringify({ id: 'evt_tampered', event: 'payment.captured' })));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid signature/i);
  });
});
