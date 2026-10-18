/**
 * Find chats that were opened by a checkout that was never paid.
 *
 * WHY
 *
 * A patient–doctor conversation used to be created the moment checkout
 * opened, before payment. Closing the Razorpay window still left a working
 * chat with the doctor. Conversations are now created when a booking is
 * confirmed, and sending is refused without a paid relationship — but the
 * conversations made the old way are still there.
 *
 * WHAT IT TOUCHES
 *
 *   A conversation qualifies when its two participants have no session
 *   between them that is paid, free (not_required), refunded / being refunded,
 *   or completed — the same test chat.service applies before sending.
 *
 *     - with no messages: deleted on --apply (nothing is lost);
 *     - with messages: only reported. Someone wrote in it, so whether it goes
 *       is a decision for a person, not a script.
 *
 * SAFETY
 *
 *   - Dry run unless --apply is passed; the dry run prints the same lists.
 *   - MONGO_URI must be passed explicitly (no dotenv: server/.env points at
 *     production), as in splitLoginSessions.js.
 *
 * Usage:
 *   MONGO_URI='mongodb+srv://…' node server/migrations/conversationsWithoutPayment.js
 *   MONGO_URI='mongodb+srv://…' node server/migrations/conversationsWithoutPayment.js --apply
 */

const RELATIONSHIP_PAYMENT_STATES = ['paid', 'not_required', 'refunded', 'refund_pending', 'refund_failed'];

/**
 * @param {import('mongodb').Db} db
 * @param {{ apply?: boolean, log?: (line: string) => void }} [options]
 * @returns {Promise<{ checked: number, empty: string[], withMessages: string[], deleted: number }>}
 */
async function conversationsWithoutPayment(db, { apply = false, log = () => {} } = {}) {
  const conversations = await db.collection('conversations').find({}, { projection: { participants: 1 } }).toArray();
  const sessions = db.collection('sessions');
  const messages = db.collection('messages');

  const empty = [];
  const withMessages = [];
  for (const c of conversations) {
    const [a, b] = (c.participants || []).map((p) => p.userId).filter(Boolean);
    if (!a || !b) continue;
    // eslint-disable-next-line no-await-in-loop
    const booked = await sessions.countDocuments({
      $and: [
        { $or: [{ patientId: a, doctorId: b }, { patientId: b, doctorId: a }] },
        { $or: [{ paymentStatus: { $in: RELATIONSHIP_PAYMENT_STATES } }, { status: 'completed' }] }
      ]
    }, { limit: 1 });
    if (booked > 0) continue;
    // eslint-disable-next-line no-await-in-loop
    const count = await messages.countDocuments({ conversationId: c._id }, { limit: 1 });
    (count > 0 ? withMessages : empty).push(String(c._id));
  }

  log(`conversations: ${conversations.length} checked`);
  log(`without a paid session: ${empty.length} empty (removable), ${withMessages.length} with messages (left for a person to decide)`);
  for (const id of withMessages) log(`  has messages: ${id}`);

  let deleted = 0;
  if (apply && empty.length) {
    const { ObjectId } = require('mongodb');
    ({ deletedCount: deleted } = await db.collection('conversations')
      .deleteMany({ _id: { $in: empty.map((id) => new ObjectId(id)) } }));
    log(`Deleted ${deleted} empty conversation(s).`);
  } else if (!apply) {
    log('Dry run — nothing was changed. Re-run with --apply to delete the empty ones.');
  }

  return { checked: conversations.length, empty, withMessages, deleted };
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('Refusing to run: pass MONGO_URI explicitly, e.g.\n'
      + "  MONGO_URI='mongodb+srv://…' node server/migrations/conversationsWithoutPayment.js [--apply]\n"
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
    await conversationsWithoutPayment(db, { apply, log: (line) => console.log(line) });
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

module.exports = { conversationsWithoutPayment };
