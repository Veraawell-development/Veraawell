/**
 * GET /sitemap.xml lists what a search engine should index — and until this
 * suite, it listed no articles and the wrong doctors at the wrong URLs:
 *
 *   - articles were queried on `isPublished`, a field the Article model does
 *     not have, so the query matched nothing;
 *   - doctors were filtered on User.isVerified (an email-OTP flag, never set
 *     for Google sign-ups) instead of admin approval, so pending and rejected
 *     applicants were indexed and approved Google-created doctors were not;
 *   - doctor URLs used the DoctorProfile _id, but the client route
 *     /doctor/:doctorId takes the USER id, so every one was a dead link.
 *
 * profile.patient.otp.test.js checks only that the route answers XML.
 */

require('../support/env');

const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
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

let server;
let f;
let extra;
let xml;

beforeAll(async () => {
  await connectDb('seo');
  const app = require('../../app');
  server = await startServer(app);

  const { seedAll, makeUser, makeDoctorProfile } = require('../support/seed');
  const Article = require('../../models/article');
  f = await seedAll();

  // A doctor created through Google sign-in: approved and bookable, but the
  // email-OTP flag is never set on that path.
  const googleDoctor = await makeUser('doctor', 'e2e.google.doctor@veraawell.test', { isVerified: false });
  const googleProfile = await makeDoctorProfile(googleDoctor._id);

  // Verified email, application still pending.
  const pendingDoctor = await makeUser('doctor', 'e2e.pending.doctor@veraawell.test', { approvalStatus: 'pending' });
  const pendingProfile = await makeDoctorProfile(pendingDoctor._id);

  // Approved but suspended.
  const suspendedDoctor = await makeUser('doctor', 'e2e.suspended.doctor@veraawell.test', { status: 'suspended' });
  const suspendedProfile = await makeDoctorProfile(suspendedDoctor._id);

  // Approved, but their published calendar ran out — not bookable, so not
  // listed by the directory either.
  const DoctorProfile = require('../../models/doctorProfile');
  await DoctorProfile.updateOne({ userId: f.doctorB._id }, { $set: { bookableUntil: new Date(Date.now() - 864e5) } });

  const base = { description: 'd', content: 'c', category: 'Anxiety', author: 'A', authorId: f.superAdmin._id };
  await Article.create({ ...base, title: 'Published piece', status: 'published' });
  await Article.create({ ...base, title: 'Draft piece', status: 'draft' });
  await Article.create({ ...base, title: 'Archived piece', status: 'archived' });

  extra = { googleDoctor, googleProfile, pendingDoctor, pendingProfile, suspendedDoctor, suspendedProfile };

  const res = await request(server).get('/sitemap.xml');
  expect(res.status).toBe(200);
  xml = res.text;
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

const loc = (path) => `<loc>https://veraawell.com${path}</loc>`;

describe('articles', () => {
  test('a published article is listed', () => {
    expect(xml).toContain(loc('/resources/articles/published-piece'));
  });

  test('drafts and archived articles are not', () => {
    expect(xml).not.toContain('draft-piece');
    expect(xml).not.toContain('archived-piece');
  });
});

describe('doctors', () => {
  test('a bookable doctor is listed under their USER id, the id the client route takes', () => {
    expect(xml).toContain(loc(`/doctor/${f.doctorA._id}`));
    expect(xml).not.toContain(String(f.profileA._id));
  });

  test('an approved doctor who signed up with Google is listed', () => {
    expect(xml).toContain(loc(`/doctor/${extra.googleDoctor._id}`));
  });

  test('a pending applicant is not listed, however verified their email', () => {
    expect(xml).not.toContain(String(extra.pendingDoctor._id));
    expect(xml).not.toContain(String(extra.pendingProfile._id));
  });

  test('a suspended doctor, and one whose calendar has run out, are not listed', () => {
    // Checked under both ids, so this cannot pass merely because the URL
    // scheme changed.
    for (const id of [extra.suspendedDoctor._id, extra.suspendedProfile._id, f.doctorB._id, f.profileB._id]) {
      expect(xml).not.toContain(String(id));
    }
  });

  test('no patient or admin ever appears', () => {
    for (const u of [f.patientA, f.patientB, f.admin, f.superAdmin]) {
      expect(xml).not.toContain(String(u._id));
    }
  });
});
