/**
 * Uploads, with Cloudinary stubbed.
 *
 * The interesting case here is not the happy path but what the happy path
 * silently fails to persist: upload.controller.js writes `profileImage` onto
 * the User document, and the User schema does not declare that field while
 * running with strict: true.
 */

require('../support/env');

const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: jest.fn(), fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));
jest.mock('isomorphic-dompurify', () => ({ sanitize: (s) => s }));

// Cloudinary must never touch the network.
const mockUpload = jest.fn();
jest.mock('../../config/cloudinary', () => ({
  uploader: {
    upload: (...args) => mockUpload(...args),
    destroy: jest.fn().mockResolvedValue({ result: 'ok' })
  },
  isConfigured: () => true
}));

let app;
let server;
let f;
let patientToken, doctorToken;
let User, DoctorProfile;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

beforeAll(async () => {
  await connectDb('upload');
  app = require('../../app');
  server = await startServer(app);
  User = require('../../models/user');
  DoctorProfile = require('../../models/doctorProfile');

  const { seedAll } = require('../support/seed');
  f = await seedAll();

  const jwt = require('jsonwebtoken');
  const { getJWTSecret } = require('../../config/auth');
  patientToken = jwt.sign({ userId: String(f.patientA._id), username: f.patientA.username, role: 'patient' }, getJWTSecret(), { expiresIn: '1h' });
  doctorToken = jwt.sign({ userId: String(f.doctorA._id), username: f.doctorA.username, role: 'doctor' }, getJWTSecret(), { expiresIn: '1h' });
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

beforeEach(() => {
  mockUpload.mockReset();
  mockUpload.mockResolvedValue({
    secure_url: 'https://res.cloudinary.com/stub/image/upload/v1/user_avatar.jpg',
    public_id: 'veerawell/profiles/user_avatar'
  });
});

async function csrfPair() {
  const res = await request(server).get('/api/csrf-token');
  return { token: res.body.csrfToken, cookie: res.headers['set-cookie'] };
}

async function uploadImage(path, token, field = 'image') {
  const { token: csrf, cookie } = await csrfPair();
  return request(server)
    .post(path)
    .set('Authorization', `Bearer ${token}`)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', csrf)
    .attach(field, PNG, 'avatar.png');
}

describe('profile image upload', () => {
  test('the request succeeds and returns a Cloudinary URL', async () => {
    const res = await uploadImage('/api/upload/profile-image', patientToken);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toMatch(/res\.cloudinary\.com/);
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  // These three were characterisation tests. upload.controller wrote
  // `profileImage` onto User, but the path was not declared on the strict
  // schema, so Mongoose removed it from the update: the patient saw a 200 and
  // a real image URL, and nothing was saved. The field is now declared.
  test('a PATIENT\'s uploaded image is persisted', async () => {
    const res = await uploadImage('/api/upload/profile-image', patientToken);
    expect(res.status).toBe(200);

    const after = await User.findById(f.patientA._id).lean();
    expect(after.profileImage).toMatch(/res\.cloudinary\.com/);
  });

  test('the field is declared on the schema', () => {
    expect(User.schema.path('profileImage')).toBeDefined();
    expect(User.schema.options.strict).toBe(true);
  });

  test('a DOCTOR\'s image is written to their DoctorProfile', async () => {
    const res = await uploadImage('/api/upload/profile-image', doctorToken);
    expect(res.status).toBe(200);

    const profile = await DoctorProfile.findOne({ userId: f.doctorA._id }).lean();
    expect(profile.profileImage).toMatch(/res\.cloudinary\.com/);
  });
});

describe('who gets a DoctorProfile', () => {
  // A DoctorProfile is the public directory entry. Both image routes used to
  // upsert one: profile-image only for doctors, but banner-image for ANY role,
  // so a patient who reached it was given a half-built therapist profile.

  test('a patient\'s profile image is written to User, and never mints a DoctorProfile', async () => {
    const spy = jest.spyOn(User, 'updateOne');
    try {
      const res = await uploadImage('/api/upload/profile-image', patientToken);
      expect(res.status).toBe(200);

      // The User write is issued as a $set on the caller's own id. Whether it
      // persists depends on User declaring profileImage — see the
      // "silently dropped" case above and dataLayer.test.js.
      expect(spy).toHaveBeenCalledWith(
        { _id: String(f.patientA._id) },
        { $set: { profileImage: 'https://res.cloudinary.com/stub/image/upload/v1/user_avatar.jpg' } }
      );
    } finally {
      spy.mockRestore();
    }
    expect(await DoctorProfile.countDocuments({ userId: f.patientA._id })).toBe(0);
  });

  test('a patient cannot upload a banner at all, and gets no DoctorProfile', async () => {
    const res = await uploadImage('/api/upload/banner-image', patientToken);
    expect(res.status).toBe(403);
    // Refused before multer runs, so nothing reached Cloudinary either.
    expect(mockUpload).not.toHaveBeenCalled();
    expect(await DoctorProfile.countDocuments({ userId: f.patientA._id })).toBe(0);
  });
});

describe('banner image upload', () => {
  test('a doctor can upload a banner and it persists on the profile', async () => {
    mockUpload.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/stub/image/upload/v1/banner.jpg',
      public_id: 'veerawell/banners/banner'
    });
    const res = await uploadImage('/api/upload/banner-image', doctorToken);
    expect(res.status).toBe(200);

    const profile = await DoctorProfile.findOne({ userId: f.doctorA._id }).lean();
    expect(profile.bannerImage).toMatch(/banner\.jpg/);
  });
});

describe('authorization on upload routes', () => {
  test('profile and banner upload require authentication', async () => {
    for (const path of ['/api/upload/profile-image', '/api/upload/banner-image']) {
      const { token: csrf, cookie } = await csrfPair();
      const res = await request(server).post(path).set('Cookie', cookie).set('X-CSRF-Token', csrf)
        .attach('image', PNG, 'avatar.png');
      expect(res.status).toBe(401);
    }
  });

  test('article-image upload is refused to a patient and to a doctor', async () => {
    for (const token of [patientToken, doctorToken]) {
      const res = await uploadImage('/api/upload/article-image', token);
      expect(res.status).toBeGreaterThanOrEqual(401);
      expect(res.status).toBeLessThan(500);
    }
  });

  test('doctor-document upload is intentionally public and needs no CSRF token', async () => {
    // routes/upload.js documents this: a careers-page applicant uploads
    // documents before they have an account or any session cookie.
    mockUpload.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/stub/raw/upload/v1/doc.pdf',
      public_id: 'veerawell/documents/doc'
    });
    const res = await request(server)
      .post('/api/upload/doctor-documents')
      .attach('documents', PNG, 'licence.png');

    expect(res.status).toBeLessThan(400);
    expect(res.body.category).not.toBe('csrf');
  });
});

describe('input validation', () => {
  test('a request with no file attached is a clean 400, not a 500', async () => {
    const { token: csrf, cookie } = await csrfPair();
    const res = await request(server)
      .post('/api/upload/profile-image')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({});
    expect(res.status).toBe(400);
  });

  test('a non-image file is rejected as a 400, not a 500', async () => {
    const { token: csrf, cookie } = await csrfPair();
    const res = await request(server)
      .post('/api/upload/profile-image')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .attach('image', Buffer.from('#!/bin/sh\necho hi'), 'payload.sh');

    // The security outcome is right: the file never reaches Cloudinary.
    expect(mockUpload).not.toHaveBeenCalled();

    // Was a characterisation test asserting 500. multer's fileFilter rejection
    // was thrown as a plain Error, so the handler reported a server fault for
    // what is squarely a client mistake — the client could not tell "your file
    // type is wrong" from "our upload service is broken", and it polluted
    // error monitoring. The filter now raises a ValidationError.
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/image/i);
  });

  test('an oversized file is a 400 too — multer\'s own limit errors are mapped', async () => {
    const { token: csrf, cookie } = await csrfPair();
    const res = await request(server)
      .post('/api/upload/profile-image')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'big.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  test('a failed upload does not echo the internal error to the caller', async () => {
    mockUpload.mockRejectedValue(new Error('cloudinary api_secret=SECRET is invalid'));
    const res = await uploadImage('/api/upload/profile-image', patientToken);
    // 503 with an actionable message, not a bare 500 — and still never the
    // internal error text.
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/try again/i);
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET/);
  });

  test('a Cloudinary failure surfaces as an error, not a false success', async () => {
    mockUpload.mockRejectedValue(new Error('cloudinary is down'));
    const res = await uploadImage('/api/upload/profile-image', patientToken);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).not.toBe(true);
  });
});

describe('a failed upload says why, and a momentary failure is retried', () => {
  // Every Cloudinary failure used to be a bare 500 "Failed to upload
  // documents": the applicant could not tell a bad file from a hiccup, and a
  // second click — which would usually have worked — was left to chance.
  const post = (field = 'documents', name = 'licence.png') => request(server)
    .post(`/api/upload/${field === 'documents' ? 'doctor-documents' : 'doctor-document'}`)
    .attach(field, PNG, name);

  test('a file Cloudinary cannot process is a 422 naming the file', async () => {
    mockUpload.mockRejectedValue({ http_code: 400, message: 'Invalid image file' });
    const res = await post('documents', 'scan.png');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('UPLOAD_REJECTED');
    expect(res.body.message).toMatch(/scan\.png/);
    expect(mockUpload).toHaveBeenCalledTimes(1); // the file's fault: not retried
  });

  test('a momentary failure is retried once and then succeeds', async () => {
    mockUpload
      .mockRejectedValueOnce({ http_code: 499, message: 'Request Timeout', name: 'TimeoutError' })
      .mockResolvedValueOnce({ secure_url: 'https://res.cloudinary.com/stub/raw/upload/v1/ok.pdf', public_id: 'ok' });
    const res = await post('document', 'cv.png');
    expect(res.status).toBe(200);
    expect(res.body.document.fileUrl).toMatch(/ok\.pdf/);
    expect(mockUpload).toHaveBeenCalledTimes(2);
  });

  test('a persistent outage is a 503 that tells the applicant what to do', async () => {
    mockUpload.mockRejectedValue({ http_code: 502, message: 'Bad Gateway' });
    const res = await post('document', 'cv.png');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('UPLOAD_FAILED');
    expect(res.body.message).toMatch(/try again/i);
  });

  test('bad storage credentials say uploads are unavailable, not that the file is wrong', async () => {
    mockUpload.mockRejectedValue({ http_code: 401, message: 'Invalid Signature' });
    const res = await post('document', 'cv.png');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('UPLOAD_UNAVAILABLE');
    expect(res.body.message).toMatch(/contact@veraawell\.com/);
  });
});
