/**
 * The data layer, checked exhaustively rather than representatively.
 *
 * Three things here are enumerable, so they are enumerated instead of sampled:
 * every field written through a strict update, every enum value on every
 * schema, and every unique index.
 *
 * The write audit exists because `strict: true` DROPS unknown paths from an
 * update instead of erroring. That is how the profileImage write in
 * upload.controller.js came to return 200 while saving nothing, and a review
 * reading the line cannot see it — the schema is in another file. A mechanical
 * check can.
 */

require('../support/env');

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(120000);

const ROOT = path.join(__dirname, '..', '..');


beforeAll(async () => {
  await connectDb('dataLayer');
}, 180000);

afterAll(async () => {
  await disconnectDb();
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Static audit: writes vs schemas                                            */
/* ────────────────────────────────────────────────────────────────────────── */

function loadModels() {
  const dir = path.join(ROOT, 'models');
  const out = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const m = require(path.join(dir, file));
    if (!m || !m.schema) continue;
    out[m.modelName] = {
      model: m,
      file: `models/${file}`,
      strict: m.schema.options.strict !== false,
      paths: Object.keys(m.schema.paths)
    };
  }
  return out;
}

function sourceFiles() {
  const dirs = ['controllers', 'services', 'routes', 'socket', 'middleware', 'utils', 'authz'];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  for (const d of dirs) {
    const abs = path.join(ROOT, d);
    if (fs.existsSync(abs)) walk(abs);
  }
  return out;
}

/** Split a call's argument list at top-level commas. */
function splitArgs(src, openParen) {
  const args = [];
  let depth = 0;
  let start = openParen + 1;
  let inStr = null;
  for (let i = openParen; i < src.length; i += 1) {
    const c = src[i];
    if (inStr) { if (c === inStr && src[i - 1] !== '\\') inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) {
      depth -= 1;
      if (depth === 0) { args.push(src.slice(start, i)); return args; }
    } else if (c === ',' && depth === 1) {
      args.push(src.slice(start, i));
      start = i + 1;
    }
  }
  return args;
}

/** Top-level keys of an object literal given as a source string. */
function topLevelKeys(text) {
  const open = text.indexOf('{');
  if (open === -1) return [];
  const body = text.slice(open + 1, text.lastIndexOf('}'));
  const keys = [];
  let depth = 0;
  let key = '';
  let collecting = true;
  let inStr = null;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (inStr) { if (c === inStr && body[i - 1] !== '\\') inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; if (collecting) key += c; continue; }
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (depth === 0 && c === ':' && collecting) { keys.push(key.trim().replace(/['"`]/g, '')); collecting = false; }
    else if (depth === 0 && c === ',') { key = ''; collecting = true; }
    else if (collecting) key += c;
  }
  return keys.filter((k) => /^[A-Za-z_$][\w$.]*$/.test(k));
}

const UPDATE_OPERATORS = ['$set', '$inc', '$push', '$unset', '$addToSet', '$pull', '$setOnInsert'];

/** Every (model, field) written through a strict update, with its location. */
function auditWrites() {
  const models = loadModels();
  const results = [];

  for (const abs of sourceFiles()) {
    const rel = abs.replace(`${ROOT}/`, '');
    const src = fs.readFileSync(abs, 'utf8');

    const alias = {};
    const requireRe = /(?:const|let|var)\s+(\w+)\s*=\s*require\(['"](?:\.\.?\/)+models\/(\w+)['"]\)/g;
    let rm;
    while ((rm = requireRe.exec(src))) {
      const entry = Object.entries(models).find(([, v]) => v.file === `models/${rm[2]}.js`);
      if (entry) alias[rm[1]] = entry[0];
    }
    if (!Object.keys(alias).length) continue;

    for (const [local, modelName] of Object.entries(alias)) {
      const meta = models[modelName];
      if (!meta.strict) continue;

      for (const method of ['findByIdAndUpdate', 'findOneAndUpdate', 'updateOne', 'updateMany']) {
        const re = new RegExp(`\\b${local}\\.${method}\\s*\\(`, 'g');
        let m;
        while ((m = re.exec(src))) {
          const openParen = m.index + m[0].length - 1;
          const args = splitArgs(src, openParen);
          // For all four methods the update document is the SECOND argument;
          // the third is options ({new, upsert, arrayFilters}), which must not
          // be mistaken for it.
          const update = args[1];
          if (!update || !update.includes('{')) continue;

          let keys = topLevelKeys(update);
          if (keys.some((k) => UPDATE_OPERATORS.includes(k))) {
            const inner = [];
            for (const op of UPDATE_OPERATORS) {
              const oi = update.indexOf(op);
              if (oi === -1) continue;
              inner.push(...topLevelKeys(update.slice(oi)));
            }
            keys = inner;
          }

          const line = src.slice(0, m.index).split('\n').length;
          for (const field of keys) {
            const root = field.split('.')[0];
            const declared = meta.paths.includes(field)
              || meta.paths.includes(root)
              || meta.paths.some((p) => p.startsWith(`${root}.`));
            if (!declared) results.push({ model: modelName, field, file: rel, line, method });
          }
        }
      }
    }
  }
  return results;
}

/**
 * The one write known to be dropped. A RATCHET, not an allowlist: fixing
 * upload.controller.js (or declaring profileImage on the User schema) means
 * deleting this entry, and the test below fails if it is left behind.
 */
const KNOWN_DROPPED_WRITES = [
  'User.profileImage @ controllers/upload.controller.js'
];

describe('writes are declared on the schema that receives them', () => {
  const audit = auditWrites();
  const signature = (f) => `${f.model}.${f.field} @ ${f.file}`;

  test('the audit actually inspected something, so it cannot pass vacuously', () => {
    const models = loadModels();
    expect(Object.values(models).filter((m) => m.strict).length).toBeGreaterThan(15);
    expect(sourceFiles().length).toBeGreaterThan(50);
  });

  test('no NEW field is written that its strict schema does not declare', () => {
    const unexpected = audit
      .map(signature)
      .filter((s) => !KNOWN_DROPPED_WRITES.includes(s));
    expect([...new Set(unexpected)]).toEqual([]);
  });

  test('the known dropped write is still present — delete the entry when it is fixed', () => {
    const present = new Set(audit.map(signature));
    for (const known of KNOWN_DROPPED_WRITES) {
      expect(present.has(known)).toBe(true);
    }
  });

  test('the profileImage drop is real at runtime, not just on paper', async () => {
    const User = require('../../models/user');
    const u = await User.create({
      firstName: 'Strict', lastName: 'Probe',
      email: `strict.${Date.now()}@test.local`,
      username: `strict.${Date.now()}`,
      password: 'password123', role: 'patient', approvalStatus: 'approved'
    });

    await User.findByIdAndUpdate(u._id, { profileImage: 'https://example.com/x.jpg' });

    const after = await User.findById(u._id).lean();
    expect(after.profileImage).toBeUndefined();
    await User.deleteOne({ _id: u._id });
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Enum exhaustiveness                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

describe('every declared enum accepts its own values and rejects others', () => {
  const models = loadModels();

  /** Every (model, path, values) triple declared anywhere in the schemas. */
  const enums = [];
  for (const [name, meta] of Object.entries(models)) {
    meta.model.schema.eachPath((p, type) => {
      const vals = type.options && type.options.enum;
      if (Array.isArray(vals) && vals.length) enums.push({ name, path: p, values: vals });
    });
  }

  test('the schemas declare a meaningful number of enums', () => {
    expect(enums.length).toBeGreaterThan(15);
  });

  test('every enum value validates, and a value outside it does not', () => {
    const failures = [];

    for (const { name, path: p, values } of enums) {
      const Model = models[name].model;

      for (const v of values) {
        if (v === null) continue;
        const doc = new Model({});
        doc.set(p, v);
        const err = doc.validateSync();
        if (err && err.errors && err.errors[p]) {
          failures.push(`${name}.${p} rejected its own declared value ${JSON.stringify(v)}`);
        }
      }

      const bogus = '__definitely_not_a_valid_enum_value__';
      const doc = new Model({});
      doc.set(p, bogus);
      const err = doc.validateSync();
      if (!err || !err.errors || !err.errors[p]) {
        failures.push(`${name}.${p} accepted a value outside its enum`);
      }
    }

    expect(failures).toEqual([]);
  });

  test('the session lifecycle enums are the exact sets the state machine assumes', () => {
    const Session = require('../../models/session');
    const statuses = Session.schema.path('status').options.enum;
    const payments = Session.schema.path('paymentStatus').options.enum;

    expect(new Set(statuses)).toEqual(new Set([
      'payment_pending', 'scheduled', 'active', 'completed', 'cancelled', 'no-show'
    ]));
    expect(new Set(payments)).toEqual(new Set([
      'pending', 'paid', 'refunded', 'refund_pending', 'refund_failed', 'failed', 'not_required'
    ]));

    // The state machine's own tables must not drift from the schema.
    const { STATUS, PAYMENT } = require('../../services/sessionState');
    expect(new Set(Object.values(STATUS))).toEqual(new Set(statuses));
    expect(new Set(Object.values(PAYMENT))).toEqual(new Set(payments));
  });

  test('every assessment test type the controller accepts is scored or knowingly excluded', () => {
    const { computeScore } = require('../../utils/assessmentScoring');
    const VALID = ['depression', 'anxiety', 'adhd', 'dla20', 'ptsd', 'addiction',
      'social-anxiety', 'post-partum', 'bipolar', 'eating-disorder', 'gambling'];

    const responses = Array.from({ length: 5 }, (_, i) => ({ questionId: i + 1, answer: 1 }));
    const unscored = VALID.filter((t) => computeScore(t, responses) === null);

    // dla20 is deliberately excluded — it has a different scoring structure and
    // falls back to the client-supplied scores. Nothing else may.
    expect(unscored).toEqual(['dla20']);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Required fields and indexes                                                */
/* ────────────────────────────────────────────────────────────────────────── */

describe('required fields', () => {
  const models = loadModels();

  test('omitting any required field is a validation error, never a silent save', () => {
    const failures = [];

    for (const [name, meta] of Object.entries(models)) {
      const required = [];
      meta.model.schema.eachPath((p, type) => {
        if (type.isRequired && p !== '_id') required.push(p);
      });
      if (!required.length) continue;

      const doc = new meta.model({});
      const err = doc.validateSync();
      for (const p of required) {
        // A path with a default satisfies itself, which is fine.
        const hasDefault = meta.model.schema.path(p).options.default !== undefined;
        if (hasDefault) continue;
        if (!err || !err.errors || !err.errors[p]) {
          failures.push(`${name}.${p} is marked required but an empty document validates`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

describe('unique indexes are declared where uniqueness is a correctness requirement', () => {
  test('the five identity and exactly-once constraints are all present', async () => {
    const expected = [
      ['User', { email: 1 }],
      ['DoctorProfile', { userId: 1 }],
      ['WebhookEvent', { eventId: 1 }],
      ['Review', { sessionId: 1, patientId: 1, reviewType: 1 }],
      ['MoodEntry', { patientId: 1, date: 1 }]
    ];

    for (const [modelName, keys] of expected) {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const Model = mongoose.model(modelName);
      const declared = Model.schema.indexes()
        .filter(([, opts]) => opts && opts.unique)
        .map(([k]) => JSON.stringify(k));

      const pathUnique = Object.entries(Model.schema.paths)
        .filter(([, t]) => t.options && t.options.unique)
        .map(([p]) => JSON.stringify({ [p]: 1 }));

      const all = declared.concat(pathUnique);
      expect(all).toContain(JSON.stringify(keys));
    }
  });

  test('the exactly-once webhook constraint is enforced by the database, not just declared', async () => {
    const WebhookEvent = require('../../models/webhookEvent');
    await WebhookEvent.deleteMany({});
    await WebhookEvent.syncIndexes();

    await WebhookEvent.create({ eventId: 'evt_unique_probe', eventType: 'payment.captured' });
    await expect(
      WebhookEvent.create({ eventId: 'evt_unique_probe', eventType: 'payment.captured' })
    ).rejects.toThrow(/duplicate key/i);

    expect(await WebhookEvent.countDocuments({ eventId: 'evt_unique_probe' })).toBe(1);
    await WebhookEvent.deleteMany({});
  });

  test('one patient can record only one mood entry per day', async () => {
    const MoodEntry = require('../../models/moodEntry');
    await MoodEntry.deleteMany({});
    await MoodEntry.syncIndexes();

    const patientId = new mongoose.Types.ObjectId();
    const date = '2027-03-14';
    // `label` is required alongside `mood` (models/moodEntry.js).
    await MoodEntry.create({ patientId, date, mood: 3, label: 'Okay' });
    await expect(
      MoodEntry.create({ patientId, date, mood: 5, label: 'Great' })
    ).rejects.toThrow(/duplicate key/i);

    // A different day for the same patient is fine.
    await MoodEntry.create({ patientId, date: '2027-03-15', mood: 4, label: 'Good' });
    expect(await MoodEntry.countDocuments({ patientId })).toBe(2);

    await MoodEntry.deleteMany({});
  });
});

describe('TTL indexes expire the documents that must not outlive their purpose', () => {
  test('PendingUser and OTP both carry an expiry, so an abandoned signup cannot linger', () => {
    const PendingUser = require('../../models/pendingUser');
    const OTP = require('../../models/otp');

    const ttlOf = (Model) => {
      const fromPaths = Object.entries(Model.schema.paths)
        .map(([p, t]) => (t.options && t.options.expires !== undefined ? { p, expires: t.options.expires } : null))
        .filter(Boolean);
      const fromIndexes = Model.schema.indexes()
        .filter(([, o]) => o && o.expireAfterSeconds !== undefined)
        .map(([k, o]) => ({ p: Object.keys(k)[0], expires: o.expireAfterSeconds }));
      return fromPaths.concat(fromIndexes);
    };

    const pending = ttlOf(PendingUser);
    const otp = ttlOf(OTP);

    expect(pending.length).toBeGreaterThan(0);
    expect(otp.length).toBeGreaterThan(0);

    // 15 minutes for a pending signup — the value the login path resets by
    // rewriting createdAt (auth.controller.js:56).
    expect(pending[0].expires).toBe(900);
  });
});
