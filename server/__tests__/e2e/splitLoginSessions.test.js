/**
 * The login store and the therapy Session model no longer share a collection,
 * and the migration that cleans up after them touches only login-store rows.
 *
 * connect-mongo's default collection is `sessions`, which is exactly where
 * Mongoose keeps the Session model. Login rows were interleaved with
 * bookings, connect-mongo's TTL index sat on the bookings collection, and an
 * admin endpoint meant to clear login state deleted every booking.
 */

require('../support/env');

const path = require('path');
const { spawnSync } = require('child_process');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

let db;

beforeAll(async () => {
  await connectDb('splitLoginSessions');
  db = mongoose.connection.db;
});

afterAll(async () => {
  await disconnectDb();
});

beforeEach(async () => {
  try { await db.collection('sessions').drop(); } catch (_) { /* absent */ }
});

/** Lay down what production has: bookings, login rows, and the TTL index. */
async function seedSharedCollection() {
  const sessions = db.collection('sessions');
  await sessions.insertMany([
    { patientId: new mongoose.Types.ObjectId(), doctorId: new mongoose.Types.ObjectId(), status: 'scheduled', price: 1000 },
    { patientId: new mongoose.Types.ObjectId(), doctorId: new mongoose.Types.ObjectId(), status: 'completed', price: 800 },
    { _id: 'sid-one', expires: new Date(Date.now() + 864e5), session: '{"cookie":{},"oauthRole":"patient"}' },
    { _id: 'sid-two', expires: new Date(Date.now() + 864e5), session: { cipher: 'abc' }, lastModified: new Date() }
  ]);
  await sessions.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
}

describe('the login store has its own collection', () => {
  test('createSessionStore writes to auth_sessions, not to the bookings collection', async () => {
    const { createSessionStore } = require('../../config/database');
    const store = createSessionStore();
    try {
      // Regression: connect-mongo's default is 'sessions'. Read off the
      // collection the store actually opened, not off its options.
      const collection = await store.collectionP;
      expect(collection.collectionName).toBe('auth_sessions');
    } finally {
      await store.close();
    }
  });
});

describe('migrations/splitLoginSessions.js', () => {
  const { splitLoginSessions } = require('../../migrations/splitLoginSessions');

  test('a dry run reports what it would do and changes nothing', async () => {
    await seedSharedCollection();

    const result = await splitLoginSessions(db, { apply: false });
    expect(result).toEqual({ loginRows: 2, bookings: 2, deleted: 0, indexFound: true, indexDropped: false });

    expect(await db.collection('sessions').countDocuments()).toBe(4);
    expect((await db.collection('sessions').indexes()).map((i) => i.name)).toContain('expires_1');
  });

  test('--apply removes the login rows and the TTL index, and no booking', async () => {
    await seedSharedCollection();

    const result = await splitLoginSessions(db, { apply: true });
    expect(result.deleted).toBe(2);
    expect(result.indexDropped).toBe(true);

    const left = await db.collection('sessions').find({}).toArray();
    expect(left).toHaveLength(2);
    expect(left.every((d) => d.patientId)).toBe(true);
    expect((await db.collection('sessions').indexes()).map((i) => i.name)).not.toContain('expires_1');

    // Idempotent: a second run finds nothing to do.
    expect(await splitLoginSessions(db, { apply: true })).toEqual({
      loginRows: 0, bookings: 2, deleted: 0, indexFound: false, indexDropped: false
    });
  });

  test('a booking that happens to carry `expires` and `session` is still left alone', async () => {
    const sessions = db.collection('sessions');
    await sessions.insertOne({ patientId: new mongoose.Types.ObjectId(), expires: new Date(), session: 'x' });
    const result = await splitLoginSessions(db, { apply: true });
    expect(result.deleted).toBe(0);
    expect(await sessions.countDocuments()).toBe(1);
  });

  test('the CLI refuses to run unless MONGO_URI is passed explicitly', () => {
    // It must never pick a database up from server/.env, which points at
    // production. Run with the variable absent from the child's environment.
    const env = { ...process.env };
    delete env.MONGO_URI;
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'migrations', 'splitLoginSessions.js')], {
      cwd: path.join(__dirname, '..', '..'),
      env,
      encoding: 'utf8',
      timeout: 20000
    });
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/Refusing to run/);
  });
});
