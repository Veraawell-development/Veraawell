/**
 * Process lifecycle in server.js: what happens on an uncaught exception and
 * on SIGTERM.
 *
 * Run in a child process because both paths end in process.exit, and because
 * requiring server.js installs process-wide handlers that must not land in
 * the jest worker.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

jest.setTimeout(60000);

const SERVER_DIR = path.join(__dirname, '..');

function runChild(script) {
  const markerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veraawell-lifecycle-'));
  const uri = process.env.__TEST_MONGO_URI__;
  if (!uri || !/(127\.0\.0\.1|localhost)/.test(uri)) throw new Error('needs the loopback test MongoDB from globalSetup');

  const out = spawnSync(process.execPath, ['-e', script], {
    cwd: SERVER_DIR,
    encoding: 'utf8',
    timeout: 25000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      MONGO_URI: `${uri.replace(/\/?$/, '/')}lifecycle`,
      JWT_SECRET: 'lifecycle-user', ADMIN_JWT_SECRET: 'lifecycle-admin', SESSION_SECRET: 'lifecycle-session',
      PAYMENTS_MODE: 'stub',
      LOG_LEVEL: 'error',
      MARKER_DIR: markerDir
    }
  });
  const markers = fs.readdirSync(markerDir);
  fs.rmSync(markerDir, { recursive: true, force: true });
  return { status: out.status, signal: out.signal, markers, stderr: out.stderr };
}

// Written to files rather than stdout: on macOS a pipe is asynchronous, and
// process.exit can drop whatever was still buffered.
const MARK = "const mark = (n) => require('fs').writeFileSync(require('path').join(process.env.MARKER_DIR, n), '');";

test('an uncaught exception exits the process with status 1', () => {
  // Regression. The handler logged "Server will continue running..." and did,
  // serving requests from a process whose state nobody could describe. Under
  // the old handler this child never exits and is killed by the timeout.
  const { status, signal } = runChild(`
    const s = require('./server');
    s.httpServer.listen(0, '127.0.0.1', () => setTimeout(() => { throw new Error('boom'); }, 20));
  `);
  expect(signal).toBeNull();
  expect(status).toBe(1);
});

test('SIGTERM stops the scheduler, closes Socket.IO and the listener, then exits 0', () => {
  const { status, markers } = runChild(`
    ${MARK}
    const scheduler = require('./services/scheduler');
    scheduler.stopScheduler = () => mark('scheduler-stopped');
    const s = require('./server');
    const close = s.io.close.bind(s.io);
    s.io.close = (fn) => { mark('io-closed'); return close(fn); };
    s.httpServer.listen(0, '127.0.0.1', () => {
      s.httpServer.on('close', () => mark('http-closed'));
      process.kill(process.pid, 'SIGTERM');
    });
  `);
  expect(status).toBe(0);
  expect(markers.sort()).toEqual(['http-closed', 'io-closed', 'scheduler-stopped']);
});
