/**
 * Nothing commercially sensitive may leave through a public or patient-facing
 * endpoint.
 *
 * WHY THIS EXISTS
 *
 * `GET /api/sessions/doctors` is a publicRoute and returned
 * `profile.toObject()` — the entire DoctorProfile. Verified against the
 * running server with no credentials at all: it published
 * `razorpayAccountId`, `customFeePercentage` (the platform's per-doctor
 * commercial terms), `payoutSetupCompleted`, `razorpayOnboardingStatus`,
 * `razorpayKYCRejectionReason`, `cancellationCount` and
 * `cancellationWarningIssued`. `getDoctorById` and `getMyDoctors` had the same
 * shape.
 *
 * That was already wrong. It becomes a different class of problem once the
 * payout work lands, because bank account numbers and PAN go on this same
 * model — so this test is the precondition for that change, not a nicety.
 *
 * The guard is an allowlist (`PUBLIC_DOCTOR_FIELDS` in models/doctorProfile.js)
 * rather than a denylist, and this test asserts the property that matters — no
 * forbidden key in the response — rather than the allowlist's contents, so it
 * keeps holding as fields are added to the schema.
 */

require('../support/env');

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { startServer, stopServer } = require('../support/server');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

jest.mock('isomorphic-dompurify', () => ({ sanitize: (v) => v }));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));

/**
 * Every DoctorProfile field that describes money, payout plumbing or a
 * doctor's disciplinary record. None of these may appear in a response to
 * someone who is not an admin.
 */
const FORBIDDEN_KEYS = [
  'razorpayAccountId',
  'razorpayOnboardingStatus',
  'razorpayOnboardingRequestedAt',
  'razorpayActivatedAt',
  'razorpayKYCRejectionReason',
  'payoutSetupCompleted',
  'customFeePercentage',
  'cancellationCount',
  'lastCancellationDate',
  'cancellationWarningIssued',
  // Added by the payout work; listed now so the guard is already in place.
  'payoutBank',
  'payoutApproved',
  'payoutApprovedBy',
  'payoutRejectionReason'
];

/** Walk an arbitrary response body and collect every forbidden key found. */
function findLeaks(node, path = '$', found = []) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => findLeaks(item, `${path}[${i}]`, found));
    return found;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (FORBIDDEN_KEYS.includes(key)) found.push(`${path}.${key}`);
      findLeaks(value, `${path}.${key}`, found);
    }
  }
  return found;
}

let app, server, fixtures, patientToken;

beforeAll(async () => {
  await connectDb('public-exposure');
  app = require('../../app');
  server = await startServer(app);

  const { seedAll } = require('../support/seed');
  fixtures = await seedAll();

  const { getJWTSecret } = require('../../config/auth');
  patientToken = jwt.sign(
    { userId: String(fixtures.patientA._id), username: fixtures.patientA.username, role: 'patient' },
    getJWTSecret(),
    { expiresIn: '1h' }
  );

  // Give the seeded doctor a full set of sensitive values, so a leak has
  // something real to leak. Written straight through the driver to bypass any
  // select()/validation in the model layer.
  await mongoose.connection.collection('doctorprofiles').updateOne(
    { userId: fixtures.doctorA._id },
    {
      $set: {
        razorpayAccountId: 'acc_live_SECRETVALUE',
        razorpayOnboardingStatus: 'active',
        razorpayKYCRejectionReason: 'internal note',
        payoutSetupCompleted: true,
        customFeePercentage: 12.5,
        cancellationCount: 3,
        cancellationWarningIssued: true
      }
    }
  );
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

describe('the public therapist directory', () => {
  test('GET /api/sessions/doctors is reachable without credentials', async () => {
    // Anti-vacuity: if this route ever stops being public, the leak assertions
    // below would pass for the wrong reason.
    const res = await request(server).get('/api/sessions/doctors');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('exposes no payout, commission or cancellation field to an anonymous caller', async () => {
    const res = await request(server).get('/api/sessions/doctors');
    expect(findLeaks(res.body)).toEqual([]);
  });

  test('still returns the fields the booking UI actually needs', async () => {
    // The allowlist must not be so tight that it breaks the product. These are
    // the keys client/src/types/index.ts `Doctor` declares.
    const res = await request(server).get('/api/sessions/doctors');
    const doctor = res.body.find((d) => String(d.userId?._id) === String(fixtures.doctorA._id));
    expect(doctor).toBeDefined();
    for (const key of ['specialization', 'experience', 'qualification', 'languages', 'treatsFor', 'pricing', 'rating']) {
      expect(doctor).toHaveProperty(key);
    }
    expect(doctor.userId).toHaveProperty('firstName');
  });
});

describe('the public single-therapist profile', () => {
  test('exposes no payout, commission or cancellation field', async () => {
    const res = await request(server).get(`/api/sessions/doctors/${fixtures.doctorA._id}`);
    expect(res.status).toBe(200);
    expect(findLeaks(res.body)).toEqual([]);
    expect(res.body).toHaveProperty('pricing');
  });
});

describe('a patient reading their own previous therapists', () => {
  test('exposes no payout, commission or cancellation field', async () => {
    const res = await request(server)
      .get('/api/sessions/my-doctors')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(findLeaks(res.body)).toEqual([]);
  });
});

describe('the guard itself', () => {
  test('the sensitive values really are present in the database', async () => {
    // Without this the leak tests could pass because the fields are simply
    // absent from the fixture, which would make them worthless.
    const raw = await mongoose.connection.collection('doctorprofiles')
      .findOne({ userId: fixtures.doctorA._id });
    expect(raw.razorpayAccountId).toBe('acc_live_SECRETVALUE');
    expect(raw.customFeePercentage).toBe(12.5);
    expect(raw.cancellationCount).toBe(3);
  });

  test('findLeaks would actually catch a leak', async () => {
    // Proves the detector, not the code under test.
    expect(findLeaks([{ userId: { firstName: 'A' }, razorpayAccountId: 'acc_x' }]))
      .toEqual(['$[0].razorpayAccountId']);
    expect(findLeaks({ nested: { deep: [{ customFeePercentage: 10 }] } }))
      .toEqual(['$.nested.deep[0].customFeePercentage']);
  });

  test('the allowlist contains no forbidden key', () => {
    const { PUBLIC_DOCTOR_FIELDS } = require('../../models/doctorProfile');
    const allowed = PUBLIC_DOCTOR_FIELDS.split(' ');
    expect(allowed.filter((f) => FORBIDDEN_KEYS.includes(f))).toEqual([]);
  });
});
