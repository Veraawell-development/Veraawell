/**
 * One conversation per pair of people: give existing conversations their
 * pair key, and merge pairs that ended up with more than one.
 *
 * WHY
 *
 * "Find or create" used to read, then create — two at once (both people
 * opening the in-call chat) made two conversations for the same pair, and the
 * history was split between them. New conversations now carry a unique
 * `pairKey` (models/conversation.js); this brings the existing ones in line.
 *
 * WHAT IT DOES
 *
 *   For each pair of participants:
 *     - one conversation: sets its pairKey;
 *     - several: keeps the oldest, moves every message of the others into
 *       it, sets its lastMessage to the newest message, deletes the others,
 *       then sets the pairKey.
 *
 * SAFETY
 *
 *   - Dry run unless --apply is passed; the dry run prints what would change.
 *   - MONGO_URI must be passed explicitly (no dotenv: server/.env points at
 *     production), as in conversationsWithoutPayment.js.
 *
 * Usage:
 *   MONGO_URI='mongodb+srv://…' node server/migrations/conversationPairKeys.js
 *   MONGO_URI='mongodb+srv://…' node server/migrations/conversationPairKeys.js --apply
 */

const pairKeyOf = (a, b) => [String(a), String(b)].sort().join('_');

/**
 * @param {import('mongodb').Db} db
 * @param {{ apply?: boolean, log?: (line: string) => void }} [options]
 * @returns {Promise<{ pairs: number, keyed: number, merged: number, removed: number, movedMessages: number }>}
 */
async function conversationPairKeys(db, { apply = false, log = () => {} } = {}) {
  const conversations = await db.collection('conversations')
    .find({}, { projection: { participants: 1, pairKey: 1, createdAt: 1 } })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  const messages = db.collection('messages');

  const byPair = new Map();
  for (const c of conversations) {
    const [a, b] = (c.participants || []).map((p) => p.userId).filter(Boolean);
    if (!a || !b) continue;
    const key = pairKeyOf(a, b);
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(c);
  }

  let keyed = 0;
  let merged = 0;
  let removed = 0;
  let movedMessages = 0;
  for (const [key, list] of byPair) {
    const [keep, ...extra] = list;
    if (extra.length) {
      merged += 1;
      const extraIds = extra.map((c) => c._id);
      // eslint-disable-next-line no-await-in-loop
      const count = await messages.countDocuments({ conversationId: { $in: extraIds } });
      log(`  pair ${key}: keep ${keep._id}, merge ${extraIds.join(', ')} (${count} message(s))`);
      if (apply) {
        // eslint-disable-next-line no-await-in-loop
        const moved = await messages.updateMany({ conversationId: { $in: extraIds } }, { $set: { conversationId: keep._id } });
        movedMessages += moved.modifiedCount;
        // eslint-disable-next-line no-await-in-loop
        const latest = await messages.find({ conversationId: keep._id }).sort({ createdAt: -1, _id: -1 }).limit(1).next();
        if (latest) {
          // eslint-disable-next-line no-await-in-loop
          await db.collection('conversations').updateOne({ _id: keep._id }, {
            $set: { lastMessage: { text: String(latest.text || '').slice(0, 200), senderId: latest.senderId, timestamp: latest.createdAt } }
          });
        }
        // eslint-disable-next-line no-await-in-loop
        const del = await db.collection('conversations').deleteMany({ _id: { $in: extraIds } });
        removed += del.deletedCount;
      } else {
        movedMessages += count;
        removed += extra.length;
      }
    }
    if (keep.pairKey !== key) {
      keyed += 1;
      // eslint-disable-next-line no-await-in-loop
      if (apply) await db.collection('conversations').updateOne({ _id: keep._id }, { $set: { pairKey: key } });
    }
  }

  log(`pairs: ${byPair.size}; need a pair key: ${keyed}; with duplicates: ${merged} (${removed} extra conversation(s), ${movedMessages} message(s) to move)`);
  if (!apply) log('Dry run — nothing was changed. Re-run with --apply.');
  return { pairs: byPair.size, keyed, merged, removed, movedMessages };
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('Refusing to run: pass MONGO_URI explicitly, e.g.\n'
      + "  MONGO_URI='mongodb+srv://…' node server/migrations/conversationPairKeys.js [--apply]\n"
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
    await conversationPairKeys(db, { apply, log: (line) => console.log(line) });
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

module.exports = { conversationPairKeys, pairKeyOf };
