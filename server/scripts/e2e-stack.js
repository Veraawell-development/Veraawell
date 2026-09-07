#!/usr/bin/env node
/**
 * E2E stack launcher.
 *
 * Boots the real server against a throwaway in-memory MongoDB, with every
 * external service replaced, and seeds a deterministic fixture set. Nothing
 * under routes/ controllers/ services/ models/ authz/ socket/ is modified —
 * the substitutions happen through Node's module cache, which is the same
 * isolation jest.mock provides in-process.
 *
 *   node scripts/e2e-stack.js            # run until Ctrl-C
 *   node scripts/e2e-stack.js --seed-only
 *
 * WHY IN-MEMORY IS NOT OPTIONAL: startScheduler(io) fires on any successful DB
 * connect (server.js:103-104) and its four cron jobs send reminder emails and
 * run refund sweeps against whatever MONGO_URI names. Pointed at the Atlas URI
 * sitting in server/.env, a test run would email real patients and sweep real
 * money. assertLoopback() below is the gate that makes that impossible.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const FIXTURE_FILE = path.join(__dirname, '..', 'tmp', 'e2e-fixtures.json');
const MAIL_SINK = path.join(__dirname, '..', 'tmp', 'e2e-mail-sink.json');

/** Refuse to run against anything but a local, throwaway database. */
function assertLoopback(uri) {
  const host = String(uri).replace(/^mongodb(\+srv)?:\/\//, '').split('/')[0];
  const isLocal = /^(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?$/.test(host);
  if (!isLocal) {
    throw new Error(
      `Refusing to start: MONGO_URI resolves to "${host}", which is not loopback. ` +
      'The e2e stack only ever runs against an in-memory MongoDB.'
    );
  }
  return uri;
}

// ── The mail sink ───────────────────────────────────────────────────────────
// registerUser persists only a bcrypt HASH of the signup OTP and returns the
// plaintext as a transient property for the caller to email (auth.service.js:
// 129-133). So capturing what would have been emailed is the ONLY way a UI test
// can complete a signup. This also removes a real failure mode: auth.controller
// awaits sendOTPEmail without catching, so an unconfigured Resend makes
// registration 500 *after* the PendingUser row has been written.
function installMailSink() {
  const mail = require('../services/email.service');
  fs.writeFileSync(MAIL_SINK, '[]');

  const record = (fn, args) => {
    const entry = { fn, at: new Date().toISOString(), args: args.map(sanitize) };
    const all = JSON.parse(fs.readFileSync(MAIL_SINK, 'utf8'));
    all.push(entry);
    fs.writeFileSync(MAIL_SINK, JSON.stringify(all, null, 2));
  };
  const sanitize = (a) => (a && typeof a === 'object' ? JSON.parse(JSON.stringify(a)) : a);

  for (const key of Object.keys(mail)) {
    if (typeof mail[key] !== 'function') continue;
    const name = key;
    mail[name] = async (...args) => { record(name, args); return { id: `sink_${name}` }; };
  }
  return MAIL_SINK;
}

/** Cloudinary would otherwise reach the network on every upload test. */
function installCloudinaryStub() {
  const cloudinary = require('../config/cloudinary');
  cloudinary.uploader.upload = async (_data, opts = {}) => ({
    secure_url: `https://res.cloudinary.com/stub/${opts.public_id || 'asset'}.jpg`,
    public_id: opts.public_id || 'stub_asset',
    width: 500,
    height: 500
  });
  cloudinary.uploader.destroy = async () => ({ result: 'ok' });
  cloudinary.isConfigured = () => true;
}

function waitForHealth(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get({ host: '127.0.0.1', port, path: '/api/health' }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.mongoConnected) return resolve(parsed);
          } catch (_) { /* fall through to retry */ }
          if (Date.now() - started > timeoutMs) return reject(new Error('health check never reported mongoConnected'));
          setTimeout(attempt, 300);
        });
      }).on('error', () => {
        if (Date.now() - started > timeoutMs) return reject(new Error('server never accepted a connection'));
        setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

async function main() {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  const uri = assertLoopback(mongod.getUri());

  fs.mkdirSync(path.dirname(FIXTURE_FILE), { recursive: true });

  process.env.MONGO_URI = uri;
  process.env.PORT = process.env.PORT || '5001';
  process.env.NODE_ENV = 'development';
  // Keep Playwright's [WebServer] stream readable; raise this to debug.
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';
  // The app's own stub gateway. Two things it does NOT cover, both asserted as
  // tests rather than papered over: stub bookings resolve to 'not_required'
  // (never 'paid'), and verifyPayment reads RAZORPAY_KEY_SECRET from the
  // environment directly (payment.controller.js:185).
  process.env.PAYMENTS_MODE = 'stub';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_e2e';
  process.env.RAZORPAY_KEY_SECRET = 'e2e_key_secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'e2e_webhook_secret';
  // MUST be distinct. In development getAdminJWTSecret() falls back to
  // getJWTSecret() (config/auth.js:37-50), so with one value the two token
  // realms share a secret and every realm-crossing assertion is vacuous.
  process.env.JWT_SECRET = 'e2e-user-realm-secret-do-not-reuse';
  process.env.ADMIN_JWT_SECRET = 'e2e-admin-realm-secret-distinct';
  process.env.SESSION_SECRET = 'e2e-session-secret';
  process.env.CLOUDINARY_CLOUD_NAME = 'stub';
  process.env.CLOUDINARY_API_KEY = 'stub';
  process.env.CLOUDINARY_API_SECRET = 'stub';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  delete process.env.RESEND;

  // Order matters: patch before the app graph is required, so the controllers
  // that destructure at require time (otp.controller.js:8,
  // scheduler.js:4) bind to the patched functions.
  const sink = installMailSink();
  installCloudinaryStub();

  const { startServer } = require('../server.js');
  await startServer();
  const health = await waitForHealth(process.env.PORT);

  const { seedAll } = require('../__tests__/support/seed');
  const f = await seedAll();

  // An admin-realm token, because AdminContext reads it out of localStorage
  // and its checkAuth only fires on an /admin* pathname evaluated once at
  // mount — so admin UI tests must arrive pre-authenticated.
  const jwt = require('jsonwebtoken');
  const { getAdminJWTSecret } = require('../config/auth');
  const adminToken = jwt.sign(
    { userId: f.superAdmin._id.toString(), role: 'super_admin' },
    getAdminJWTSecret(),
    { expiresIn: '8h' }
  );

  const fixtures = {
    mongoUri: uri,
    port: Number(process.env.PORT),
    mailSink: sink,
    passwords: f.passwords,
    adminToken,
    users: {
      patientA: { id: String(f.patientA._id), email: f.patientA.email, password: f.passwords.patient },
      patientB: { id: String(f.patientB._id), email: f.patientB.email, password: f.passwords.patient },
      doctorA: { id: String(f.doctorA._id), email: f.doctorA.email, password: f.passwords.doctor },
      doctorB: { id: String(f.doctorB._id), email: f.doctorB.email, password: f.passwords.doctor },
      admin: { id: String(f.admin._id), email: f.admin.email, password: f.passwords.admin },
      superAdmin: { id: String(f.superAdmin._id), email: f.superAdmin.email, password: f.passwords.super_admin }
    },
    paidSessionId: String(f.paidSession._id)
  };
  fs.writeFileSync(FIXTURE_FILE, JSON.stringify(fixtures, null, 2));

  console.log('');
  console.log('  e2e stack ready');
  console.log(`  mongo    : ${uri}`);
  console.log(`  api      : http://localhost:${fixtures.port}  (mongoConnected=${health.mongoConnected})`);
  console.log(`  fixtures : ${FIXTURE_FILE}`);
  console.log(`  mail sink: ${sink}`);
  console.log('');

  if (process.argv.includes('--seed-only')) {
    await mongod.stop();
    process.exit(0);
  }

  const shutdown = async () => { try { await mongod.stop(); } catch (_) {} process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((err) => { console.error('e2e stack failed:', err.message); process.exit(1); });
}

module.exports = { assertLoopback, installMailSink, installCloudinaryStub, FIXTURE_FILE, MAIL_SINK };
