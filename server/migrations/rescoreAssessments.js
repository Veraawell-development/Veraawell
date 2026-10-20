/**
 * Rescore stored self-assessment results with the current scoring rules.
 *
 * WHY
 *
 * Three tests were scored wrongly (utils/assessmentScoring.js, SCORING_VERSION
 * 2.0): the depression test added the PHQ-9's item 10 (a functional question,
 * not a symptom); the addiction test added the value of its "which area?"
 * picker and could never be above "mild"; the PTSD test added the answer to
 * "can we ask more questions?". A patient's history should not show the same
 * answers under two different rules, so stored results are recalculated from
 * their stored answers.
 *
 * WHAT IT DOES
 *
 *   For every result of a test the server can score: recompute total,
 *   severity and percentage from its `responses` and, where anything differs
 *   (or the result is not yet on SCORING_VERSION), store the new score and
 *   stamp testVersion. Results without answers (or of a test no longer
 *   scored, e.g. dla20) are reported and left alone.
 *
 * SAFETY
 *
 *   - Dry run unless --apply is passed; the dry run prints what would change,
 *     including every severity that moves.
 *   - Idempotent: a second --apply finds nothing to do.
 *   - MONGO_URI must be passed explicitly (no dotenv: server/.env points at
 *     production), as in conversationPairKeys.js.
 *
 * Usage:
 *   MONGO_URI='mongodb+srv://…' node server/migrations/rescoreAssessments.js
 *   MONGO_URI='mongodb+srv://…' node server/migrations/rescoreAssessments.js --apply
 */

const { computeScore, isScorable, SCORING_VERSION } = require('../utils/assessmentScoring');

/**
 * @param {import('mongodb').Db} db
 * @param {{ apply?: boolean, log?: (line: string) => void }} [options]
 * @returns {Promise<{ scanned: number, changed: number, severityChanged: number, skipped: number, moves: Record<string, number> }>}
 */
async function rescoreAssessments(db, { apply = false, log = () => {} } = {}) {
  const results = db.collection('mentalhealthassessments');
  const docs = await results
    .find({}, { projection: { testType: 1, responses: 1, scores: 1, testVersion: 1 } })
    .toArray();

  let changed = 0;
  let severityChanged = 0;
  let skipped = 0;
  const moves = {}; // "depression: moderate → mild" → count

  for (const doc of docs) {
    const answers = Array.isArray(doc.responses) ? doc.responses : [];
    if (!isScorable(doc.testType) || answers.length === 0) {
      skipped += 1;
      continue;
    }
    const next = computeScore(doc.testType, answers.map((r) => ({ questionId: r.questionId, answer: r.answer })));
    const prev = doc.scores || {};
    const same = prev.total === next.total && prev.severity === next.severity && prev.percentage === next.percentage;
    if (same && doc.testVersion === SCORING_VERSION) continue;

    changed += 1;
    if (prev.severity !== next.severity) {
      severityChanged += 1;
      const key = `${doc.testType}: ${prev.severity} → ${next.severity}`;
      moves[key] = (moves[key] || 0) + 1;
    }
    if (apply) {
      // eslint-disable-next-line no-await-in-loop
      await results.updateOne({ _id: doc._id }, { $set: { scores: next, testVersion: SCORING_VERSION } });
    }
  }

  for (const [move, count] of Object.entries(moves).sort()) log(`  ${move}: ${count}`);
  log(`results: ${docs.length}; to update: ${changed} (severity changes: ${severityChanged}); left alone (no answers / not scorable): ${skipped}`);
  if (!apply) log('Dry run — nothing was changed. Re-run with --apply.');
  return { scanned: docs.length, changed, severityChanged, skipped, moves };
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('Refusing to run: pass MONGO_URI explicitly, e.g.\n'
      + "  MONGO_URI='mongodb+srv://…' node server/migrations/rescoreAssessments.js [--apply]\n"
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
    await rescoreAssessments(db, { apply, log: (line) => console.log(line) });
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

module.exports = { rescoreAssessments };
