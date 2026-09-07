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

  test('a PATIENT\'s uploaded image is silently dropped and never persisted', async () => {
    // upload.controller.js:56 does
    //   User.findByIdAndUpdate(req.user._id, { profileImage: result.secure_url })
    // but `profileImage` is not a declared path on the User schema, and the
    // schema sets strict: true (models/user.js:228). Mongoose removes unknown
    // paths from an update rather than erroring, so the write disappears.
    //
    // The user sees a 200 and a real image URL; nothing is saved. Twelve client
    // files read user.profileImage.
    const before = await User.findById(f.patientA._id).lean();
    expect(before.profileImage).toBeUndefined();

    const res = await uploadImage('/api/upload/profile-image', patientToken);
    expect(res.status).toBe(200);

    const after = await User.findById(f.patientA._id).lean();
    expect(after.profileImage).toBeUndefined();
  });

  test('the field really is absent from the schema, not merely unset', () => {
    expect(User.schema.path('profileImage')).toBeUndefined();
    expect(User.schema.options.strict).toBe(true);
  });

  test('a DOCTOR is unaffected, because DoctorProfile gets its own write', async () => {
    const res = await uploadImage('/api/upload/profile-image', doctorToken);
    expect(res.status).toBe(200);

    // DoctorProfile DOES declare profileImage, so this half persists — which is
    // exactly why the patient-side bug is easy to miss in manual testing.
    const profile = await DoctorProfile.findOne({ userId: f.doctorA._id }).lean();
    expect(profile.profileImage).toMatch(/res\.cloudinary\.com/);

    const user = await User.findById(f.doctorA._id).lean();
    expect(user.profileImage).toBeUndefined();
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

  test('a non-image file is rejected — but as a 500, not a 4xx', async () => {
    const { token: csrf, cookie } = await csrfPair();
    const res = await request(server)
      .post('/api/upload/profile-image')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .attach('image', Buffer.from('#!/bin/sh\necho hi'), 'payload.sh');

    // The security outcome is right: the file never reaches Cloudinary.
    expect(mockUpload).not.toHaveBeenCalled();

    // But multer's fileFilter rejection is thrown as an unclassified error, so
    // the handler reports a server fault for what is squarely a client mistake.
    // The client cannot distinguish "your file type is wrong" from "our upload
    // service is broken", and it pollutes error monitoring.
    expect(res.status).toBe(500);
  });

  test('a Cloudinary failure surfaces as an error, not a false success', async () => {
    mockUpload.mockRejectedValue(new Error('cloudinary is down'));
    const res = await uploadImage('/api/upload/profile-image', patientToken);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).not.toBe(true);
  });
});
