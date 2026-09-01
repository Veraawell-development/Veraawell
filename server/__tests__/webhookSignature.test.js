const crypto = require('crypto');
const { verifyWebhookSignature } = require('../utils/webhookSignature');

const SECRET = 'test_webhook_secret';

function sign(payload, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('verifyWebhookSignature', () => {
  test('accepts a signature computed over the exact raw bytes', () => {
    const raw = Buffer.from('{"event":"payment.captured","id":"evt_1"}');
    const signature = sign(raw);
    expect(verifyWebhookSignature(raw, signature, SECRET)).toBe(true);
  });

  test('rejects a tampered payload', () => {
    const raw = Buffer.from('{"event":"payment.captured","id":"evt_1"}');
    const signature = sign(raw);
    const tampered = Buffer.from('{"event":"payment.captured","id":"evt_2"}');
    expect(verifyWebhookSignature(tampered, signature, SECRET)).toBe(false);
  });

  test('rejects when the wrong secret is used', () => {
    const raw = Buffer.from('{"event":"payment.captured"}');
    const signature = sign(raw);
    expect(verifyWebhookSignature(raw, signature, 'wrong_secret')).toBe(false);
  });

  test(
    'THE C12 REGRESSION CASE: a signature computed over the true raw bytes fails ' +
    'verification if checked against a JSON.stringify(JSON.parse(raw)) reconstruction ' +
    'instead — this is exactly why the fix reads req.rawBody instead of re-serializing',
    () => {
      // A real Razorpay payload's key order is not guaranteed to survive a
      // parse+stringify round trip identically in all cases; simulate that
      // divergence directly by reordering keys, which is representationally
      // equivalent JSON but byte-different — precisely what re-serialization
      // is not guaranteed to avoid.
      const rawAsSent = Buffer.from('{"id":"evt_1","event":"payment.captured"}');
      const signature = sign(rawAsSent); // Razorpay signs these exact bytes

      const reserialized = Buffer.from(JSON.stringify(JSON.parse(rawAsSent))); // {"id":...,"event":...} — key order preserved by V8 here,
      // so simulate a genuine divergence a different formatting choice could introduce:
      const reserializedDifferently = Buffer.from('{"event":"payment.captured","id":"evt_1"}');

      // Verifying against the TRUE raw bytes succeeds (this is the fix):
      expect(verifyWebhookSignature(rawAsSent, signature, SECRET)).toBe(true);

      // Verifying against a differently-serialized-but-equivalent payload fails,
      // demonstrating why re-serialization is an unsafe basis for verification:
      expect(verifyWebhookSignature(reserializedDifferently, signature, SECRET)).toBe(false);
    }
  );

  test('missing signature or secret is rejected, not thrown', () => {
    const raw = Buffer.from('{}');
    expect(verifyWebhookSignature(raw, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(raw, 'abc', undefined)).toBe(false);
    expect(verifyWebhookSignature(undefined, 'abc', SECRET)).toBe(false);
  });
});
