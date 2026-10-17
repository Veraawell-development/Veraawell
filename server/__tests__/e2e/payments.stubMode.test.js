/**
 * PAYMENTS_MODE=stub: what it actually guarantees, and what it does not.
 *
 * Deliberately DB-free. Selecting the mode requires re-evaluating
 * config/payments, and jest.resetModules() with a live mongoose connection
 * open detaches the model registry from that connection, so every later query
 * buffers until it times out. Keeping this file free of any database lets the
 * module be re-required safely.
 */

require('../support/env');

/** Evaluate config/payments fresh with a chosen PAYMENTS_MODE. */
function loadPayments(mode) {
  let mod;
  const previous = process.env.PAYMENTS_MODE;
  if (mode === undefined) delete process.env.PAYMENTS_MODE;
  else process.env.PAYMENTS_MODE = mode;
  jest.isolateModules(() => { mod = require('../../config/payments'); });
  if (previous === undefined) delete process.env.PAYMENTS_MODE;
  else process.env.PAYMENTS_MODE = previous;
  return mod;
}

describe('mode selection', () => {
  test('the default is live — nothing downgrades implicitly', () => {
    expect(loadPayments(undefined).getMode()).toBe('live');
    expect(loadPayments('').getMode()).toBe('live');
    expect(loadPayments('LIVE').getMode()).toBe('live');
    // Only the exact string opts in.
    expect(loadPayments('Stub').getMode()).toBe('live');
    expect(loadPayments('stub').getMode()).toBe('stub');
  });
});

describe('the synthetic-id guards', () => {
  const p = () => loadPayments('stub');

  test('the booking paymentId minted in stub mode IS recognised as synthetic', () => {
    // resolveBookingPaymentState uses `stub_<hex>` (session.controller.js:79),
    // which startsWith 'stub_' and so is covered by the prefix list.
    expect(p().isSyntheticPaymentId('stub_a1b2c3d4e5f6')).toBe(true);
    expect(p().isSyntheticPaymentId('mock_payment_1700000000')).toBe(true);
    expect(p().isSyntheticPaymentId('immediate_1700000000')).toBe(true);
    expect(p().isSyntheticPaymentId('pay_realgatewayid01')).toBe(false);
  });

  test('but the stub CLIENT\'s own three id shapes are NOT recognised', () => {
    // razorpay.client.js:52,58,65 mint order_stub_ / rfnd_stub_ / acc_stub_.
    // Matching is startsWith (config/payments.js:36), and none of these starts
    // with 'stub_', so the prefix list cannot see any of them.
    expect(p().isSyntheticPaymentId('order_stub_a1b2c3d4')).toBe(false);
    expect(p().isSyntheticPaymentId('rfnd_stub_a1b2c3d4')).toBe(false);
    expect(p().isSyntheticAccountId('acc_stub_a1b2c3d4')).toBe(false);
  });

  test('isSyntheticAccountId only ever matched the acc_mock shape', () => {
    expect(p().isSyntheticAccountId('acc_mock_abc')).toBe(true);
    expect(p().isSyntheticAccountId('acc_mock')).toBe(true);
    expect(p().isSyntheticAccountId('acc_live_real')).toBe(false);
    // The consequence: an account created while in stub mode reads as genuine
    // to the booking guard at session.controller.js:87 once the server is
    // switched to live, so a booking proceeds to the gateway with a bogus
    // transfer target instead of being refused cleanly.
    expect(p().isSyntheticAccountId('acc_stub_created_in_stub_mode')).toBe(false);
  });
});

describe('the stub client mints exactly the shapes above', () => {
  test('orders, refunds and accounts all carry a recognisably fake id', async () => {
    process.env.PAYMENTS_MODE = 'stub';
    let client;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      client = require('../../services/razorpay.client').getRazorpay();
    });

    const order = await client.orders.create({ amount: 100000, currency: 'INR' });
    const refund = await client.payments.refund('pay_x', { amount: 1000 });
    const account = await client.accounts.create({ email: 'd@test.local' });

    expect(order.id).toMatch(/^order_stub_[0-9a-f]{16}$/);
    expect(refund.id).toMatch(/^rfnd_stub_[0-9a-f]{16}$/);
    expect(account.id).toMatch(/^acc_stub_[0-9a-f]{16}$/);

    delete process.env.PAYMENTS_MODE;
  });

  test('live mode without keys throws a 503-shaped error rather than crashing the process', () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    // Blank, not deleted: config/environment runs dotenv.config(), which would
    // repopulate a *missing* key from the real server/.env — but leaves an
    // already-present (even empty) one alone.
    process.env.RAZORPAY_KEY_ID = '';
    process.env.RAZORPAY_KEY_SECRET = '';
    delete process.env.PAYMENTS_MODE;

    let err;
    jest.isolateModules(() => {
      const { getRazorpay } = require('../../services/razorpay.client');
      try { getRazorpay(); } catch (e) { err = e; }
    });

    expect(err).toBeDefined();
    expect(err.statusCode).toBe(503);

    process.env.RAZORPAY_KEY_ID = keyId;
    process.env.RAZORPAY_KEY_SECRET = keySecret;
  });
});

describe('assertPaymentsConfigured guards startup', () => {
  test('the guard itself works when called directly', () => {
    process.env.PAYMENTS_MODE = 'stub';
    let threw;
    jest.isolateModules(() => {
      const env = require('../../config/environment');
      jest.spyOn(env, 'isProduction').mockReturnValue(true);
      const payments = require('../../config/payments');
      try { payments.assertPaymentsConfigured(); } catch (e) { threw = e; }
    });
    expect(String(threw && threw.message)).toMatch(/forbidden in production/);
    delete process.env.PAYMENTS_MODE;
  });

  /**
   * Run validateEnvironment() as a production boot would, with every required
   * variable present, and report whether it tried to exit.
   */
  function bootProduction(paymentsMode) {
    const vars = {
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://127.0.0.1:27099/never-dialled',
      JWT_SECRET: 'x', SESSION_SECRET: 'x', ADMIN_JWT_SECRET: 'x',
      FRONTEND_URL: 'https://veraawell.com',
      RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 'x', RAZORPAY_WEBHOOK_SECRET: 'x',
      CLOUDINARY_CLOUD_NAME: 'x', CLOUDINARY_API_KEY: 'x', CLOUDINARY_API_SECRET: 'x',
      RESEND: 're_x',
      PAYMENTS_MODE: paymentsMode
    };
    const saved = {};
    for (const [k, v] of Object.entries(vars)) {
      saved[k] = process.env[k];
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    const exit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    let exitedWith = null;
    try {
      jest.isolateModules(() => {
        try {
          require('../../config/environment').validateEnvironment();
        } catch (e) {
          const m = /process\.exit\((\d+)\)/.exec(e.message);
          if (!m) throw e;
          exitedWith = Number(m[1]);
        }
      });
    } finally {
      exit.mockRestore();
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
    return exitedWith;
  }

  // Regression. This test used to pin that nothing called the guard: its
  // docblock said "Called from validateEnvironment()", a search of the tree
  // found only the definition and the export, and so PAYMENTS_MODE=stub —
  // the setting that creates sessions nobody paid for — booted production
  // without complaint.
  test('a production boot with PAYMENTS_MODE=stub refuses to start', () => {
    expect(bootProduction('stub')).toBe(1);
  });

  test('a correctly configured production boot is not refused', () => {
    expect(bootProduction(undefined)).toBeNull();
  });
});
