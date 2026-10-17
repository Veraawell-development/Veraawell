/**
 * Remove express-session's login-store rows from the therapy `sessions`
 * collection.
 *
 * WHY
 *
 * connect-mongo defaults to a collection called `sessions`, and Mongoose
 * stores the therapy Session model in a collection called `sessions`. Until
 * config/database.js set `collectionName: 'auth_sessions'`, both wrote to the
 * same place:
 *
 *   - every Google sign-in left a login-store row among the bookings;
 *   - connect-mongo created a TTL index, `expires_1`, on the bookings
 *     collection;
 *   - the admin "cleanup-sessions" endpoint, meant to clear login state, ran
 *     deleteMany({}) on it and took every booking with it.
 *
 * The store now writes to `auth_sessions`. This removes what it left behind.
 * Losing these rows logs nobody out: express-session only ever carried the
 * OAuth role across the Google redirect; authentication is the JWT cookie.
 *
 * WHAT IT TOUCHES
 *
 *   rows   in `sessions` that have `session` AND `expires` and NO `patientId`
 *          — connect-mongo's shape. Every therapy Session has a patientId
 *          (it is required), so a booking cannot match.
 *   index  `expires_1` on `sessions`, only if its key is exactly { expires: 1 }.
 *
 * SAFETY
 *
 *   - Dry run unless --apply is passed. The dry run prints the same counts.
 *   - MONGO_URI must be passed explicitly in the environment of THIS command.
 *     Deliberately no dotenv: server/.env points at production, and a
 *     destructive script should never pick a database up implicitly from a
 *     file the operator did not name.
 *
 * Usage:
 *   MONGO_URI='mongodb+srv://…' node server/migrations/splitLoginSessions.js
 *   MONGO_URI='mongodb+srv://…' node server/migrations/splitLoginSessions.js --apply
 */

const LOGIN_STORE_ROW = Object.freeze({
  session: { $exists: true },
  expires: { $exists: true },
  patientId: { $exists: false }
});

const CONNECT_MONGO_INDEX = 'expires_1';

/**
 * @param {import('mongodb').Db} db
 * @param {{ apply?: boolean, log?: (line: string) => void }} [options]
 * @returns {Promise<{ loginRows: number, bookings: number, deleted: number,
 *                     indexFound: boolean, indexDropped: boolean }>}
 */
async function splitLoginSessions(db, { apply = false, log = () => {} } = {}) {
  const exists = await db.listCollections({ name: 'sessions' }, { nameOnly: true }).hasNext();
  if (!exists) {
    log('No `sessions` collection — nothing to do.');
    return { loginRows: 0, bookings: 0, deleted: 0, indexFound: false, indexDropped: false };
  }

  const sessions = db.collection('sessions');
  const loginRows = await sessions.countDocuments(LOGIN_STORE_ROW);
  const bookings = await sessions.countDocuments({ patientId: { $exists: true } });

  const indexes = await sessions.indexes();
  const ttl = indexes.find((ix) => ix.name === CONNECT_MONGO_INDEX
    && Object.keys(ix.key).length === 1 && ix.key.expires === 1);

  log(`sessions: ${bookings} booking(s) (left alone), ${loginRows} login-store row(s) to remove`);
  log(`index ${CONNECT_MONGO_INDEX}: ${ttl ? 'present, will be dropped' : 'not present'}`);

  let deleted = 0;
  let indexDropped = false;
  if (apply) {
    if (loginRows > 0) {
      ({ deletedCount: deleted } = await sessions.deleteMany(LOGIN_STORE_ROW));
    }
    if (ttl) {
      await sessions.dropIndex(CONNECT_MONGO_INDEX);
      indexDropped = true;
    }
    log(`Deleted ${deleted} login-store row(s)${indexDropped ? `, dropped ${CONNECT_MONGO_INDEX}` : ''}.`);
  } else {
    log('Dry run — nothing was changed. Re-run with --apply.');
  }

  return { loginRows, bookings, deleted, indexFound: Boolean(ttl), indexDropped };
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('Refusing to run: pass MONGO_URI explicitly, e.g.\n'
      + "  MONGO_URI='mongodb+srv://…' node server/migrations/splitLoginSessions.js [--apply]\n"
      + 'server/.env is deliberately not read.');
    process.exit(1);
  }

  const apply = process.argv.includes('--apply');
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    console.log(`Connected to database "${db.databaseName}". Mode: ${apply ? 'APPLY' : 'DRY RUN'}\n`);
    await splitLoginSessions(db, { apply, log: (line) => console.log(line) });
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
  });
}

module.exports = { splitLoginSessions, LOGIN_STORE_ROW };
