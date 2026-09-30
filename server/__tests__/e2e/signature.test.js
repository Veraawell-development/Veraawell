/**
 * The practitioner's drawn signature.
 *
 * It is stored on the doctor's profile as a PNG data URL rather than uploaded
 * to Cloudinary like the profile and banner images, because every Cloudinary
 * asset on this platform is public unsigned delivery — and a signature is not
 * a profile photo. It is the mark a reader treats as authorisation, so there
 * must be no URL for anyone to find, share, or lift onto a document of their
 * own. publicExposure.test.js holds the other half of that guarantee: the
 * field never appears in a public directory response.
 *
 * What this suite pins:
 *   - only a doctor reaches the endpoint, and only ever their own signature
 *   - what counts as a valid signature, since this writes client-supplied
 *     data straight into the database and then renders it into a PDF
 */

require('../support/env');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { startServer, stopServer } = require('../support/server');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

jest.mock('isomorphic-dompurify', () => ({ sanitize: (v) => v }));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));

let app, server, f, DoctorProfile;
let doctorToken, otherDoctorToken, patientToken;

// A real, minimal PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function csrfPair() {
  const res = await request(server).get('/api/csrf-token');
  return { csrf: res.body.csrfToken, cookie: res.headers['set-cookie'] };
}

async function call(method, path, token, body) {
  const { csrf, cookie } = await csrfPair();
  let req = request(server)[method](path).set('Cookie', cookie).set('X-CSRF-Token', csrf);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return body === undefined ? req.send() : req.send(body);
}

beforeAll(async () => {
  await connectDb('signature');
  app = require('../../app');
  server = await startServer(app);
  DoctorProfile = require('../../models/doctorProfile');

  f = await require('../support/seed').seedAll();

  const { getJWTSecret } = require('../../config/auth');
  const sign = (u) => jwt.sign(
    { userId: String(u._id), role: u.role, username: u.username },
    getJWTSecret(), { expiresIn: '1h' }
  );
  doctorToken = sign(f.doctorA);
  otherDoctorToken = sign(f.doctorB);
  patientToken = sign(f.patientA);
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

beforeEach(async () => {
  await DoctorProfile.updateMany({}, { $set: { signature: null, signatureUpdatedAt: null } });
});

describe('saving and reading a signature', () => {
  test('a doctor saves one and reads it back', async () => {
    const saved = await call('put', '/api/profile/signature', doctorToken, { signature: PNG });
    expect(saved.status).toBe(200);

    const read = await call('get', '/api/profile/signature', doctorToken);
    expect(read.status).toBe(200);
    expect(read.body.signature).toBe(PNG);
    expect(read.body.updatedAt).toBeTruthy();
  });

  test('before they draw one, it reads back as null rather than erroring', async () => {
    const read = await call('get', '/api/profile/signature', doctorToken);
    expect(read.status).toBe(200);
    expect(read.body.signature).toBeNull();
  });

  test('saving again replaces it', async () => {
    await call('put', '/api/profile/signature', doctorToken, { signature: PNG });
    const second = `${PNG.slice(0, -4)}AA==`;
    await call('put', '/api/profile/signature', doctorToken, { signature: second });

    const read = await call('get', '/api/profile/signature', doctorToken);
    expect(read.body.signature).toBe(second);
  });

  test('a doctor can remove it', async () => {
    await call('put', '/api/profile/signature', doctorToken, { signature: PNG });
    const removed = await call('delete', '/api/profile/signature', doctorToken);
    expect(removed.status).toBe(200);
    expect((await call('get', '/api/profile/signature', doctorToken)).body.signature).toBeNull();
  });
});

describe('who can reach it', () => {
  test('a patient cannot', async () => {
    const res = await call('get', '/api/profile/signature', patientToken);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('a patient cannot write one either', async () => {
    const res = await call('put', '/api/profile/signature', patientToken, { signature: PNG });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('an anonymous caller cannot', async () => {
    const res = await call('get', '/api/profile/signature', null);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('one doctor never sees another doctor\'s signature', async () => {
    // The endpoint is self-scoped by req.actor.id with no id in the path, so
    // this is really a test that it stays that way.
    await call('put', '/api/profile/signature', doctorToken, { signature: PNG });

    const read = await call('get', '/api/profile/signature', otherDoctorToken);
    expect(read.status).toBe(200);
    expect(read.body.signature).toBeNull();
  });

  test('one doctor cannot overwrite another doctor\'s signature', async () => {
    await call('put', '/api/profile/signature', doctorToken, { signature: PNG });
    await call('put', '/api/profile/signature', otherDoctorToken, { signature: `${PNG.slice(0, -4)}BB==` });

    const mine = await call('get', '/api/profile/signature', doctorToken);
    expect(mine.body.signature).toBe(PNG);
  });
});

describe('what counts as a signature', () => {
  const refused = async (signature) => {
    const res = await call('put', '/api/profile/signature', doctorToken, { signature });
    expect(res.status).toBe(400);
    // And nothing was written.
    const profile = await DoctorProfile.findOne({ userId: f.doctorA._id }).select('+signature');
    expect(profile.signature).toBeNull();
  };

  test('an SVG data URL is refused', async () => {
    // SVG can carry script, and this value is rendered into a PDF and echoed
    // back to a browser. PNG only, deliberately.
    await refused('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
  });

  test('a javascript: URL is refused', async () => {
    await refused('javascript:alert(1)');
  });

  test('a remote URL is refused', async () => {
    // Otherwise a doctor could point their signature at an asset they control
    // and change what every past report displays, after the fact.
    await refused('https://example.com/signature.png');
  });

  test('a JPEG data URL is refused', async () => {
    await refused('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
  });

  test('an empty signature is refused', async () => {
    await refused('');
  });

  test('a non-string is refused', async () => {
    await refused(12345);
  });

  test('an oversized signature is refused', async () => {
    // ~400 KB of base64, over the 256 KB cap.
    await refused(`data:image/png;base64,${'A'.repeat(560000)}`);
  });

  test('the error names the field so the form can show it', async () => {
    const res = await call('put', '/api/profile/signature', doctorToken, { signature: 'nope' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors || res.body.details || {})).toContain('signature');
  });
});

describe('the validator in isolation', () => {
  const { validateSignature } = require('../../controllers/profile.controller');

  test('accepts a real PNG data URL and returns it trimmed', () => {
    expect(validateSignature(`  ${PNG}  `)).toBe(PNG);
  });

  test('rejects padding-less and malformed base64', () => {
    expect(() => validateSignature('data:image/png;base64,')).toThrow();
    expect(() => validateSignature('data:image/png;base64,!!!!')).toThrow();
  });
});
