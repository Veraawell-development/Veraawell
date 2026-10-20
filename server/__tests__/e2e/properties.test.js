/**
 * Property-based tests for the money and time code.
 *
 * Tables of examples are the right tool for a state machine with an enumerable
 * transition table — which is why sessionState.test.js is exhaustive. They are
 * the wrong tool for functions over continuous or very large inputs: a refund
 * takes any price and any number of hours, and zoned time takes any instant in
 * any zone. There, the useful statement is a property that must hold for every
 * input, not a handful of chosen ones.
 *
 * Each property below is one the code would be wrong to violate, expressed
 * without reference to the implementation's own branches.
 */

require('../support/env');

const fc = require('fast-check');

// A fixed seed. Random inputs reach different branches on each run, so the
// per-file coverage ratchet passed on one machine and failed on another with
// no code change. Override with FC_SEED to explore; a failure prints its own
// seed and path for replay either way.
fc.configureGlobal({ seed: Number(process.env.FC_SEED) || 20261018 });

const { calculateRefund, describeRefundPolicy } = require('../../services/refundPolicy');
const {
  zonedToUtc, utcToZoned, normalizeTimeTo24h, to12hSlot, slotKey, normalizeDate
} = require('../../utils/zonedTime');
const { verifyWebhookSignature } = require('../../utils/webhookSignature');
const { computeScore, validateResponses } = require('../../utils/assessmentScoring');

const RUNS = 500;

describe('refund policy', () => {
  const price = fc.integer({ min: 0, max: 500000 });
  const hours = fc.double({ min: -720, max: 8760, noNaN: true });
  const role = fc.constantFrom('patient', 'doctor', 'admin', 'system');

  test('a refund is never negative and never exceeds the price', () => {
    fc.assert(fc.property(price, hours, role, (p, h, r) => {
      const refund = calculateRefund(p, h, r);
      return refund >= 0 && refund <= p;
    }), { numRuns: RUNS });
  });

  test('a refund is monotonically non-decreasing in notice given', () => {
    // Cancelling earlier can never be punished more harshly than cancelling
    // later. This is the property the tiers exist to express, and it holds
    // for any number of them — it survived the middle tier being removed.
    fc.assert(fc.property(price, hours, hours, (p, a, b) => {
      const [earlier, later] = a <= b ? [b, a] : [a, b];
      return calculateRefund(p, earlier, 'patient') >= calculateRefund(p, later, 'patient');
    }), { numRuns: RUNS });
  });

  test('a doctor cancellation always returns the full price, whatever the notice', () => {
    fc.assert(fc.property(price, hours, (p, h) => calculateRefund(p, h, 'doctor') === p),
      { numRuns: RUNS });
  });

  test('a free session refunds zero and can never manufacture money', () => {
    fc.assert(fc.property(hours, role, (h, r) => calculateRefund(0, h, r) === 0),
      { numRuns: RUNS });
  });

  test('the description never contradicts the amount', () => {
    fc.assert(fc.property(price.filter((p) => p > 0), hours, (p, h) => {
      const refund = calculateRefund(p, h, 'patient');
      const text = describeRefundPolicy(refund, p);
      if (refund === p) return text.includes('100%');
      if (refund === 0) return /No refund/.test(text);
      // Two tiers: anything else is not a labelling problem, it is a
      // calculation that should not be reachable.
      return false;
    }), { numRuns: RUNS });
  });

  test('the tier boundary sits exactly where the policy says', () => {
    // The properties above hold for any monotone step function, so pin the
    // actual threshold too: strictly greater than 4 hours, matching
    // RefundPolicyPage.tsx.
    expect(calculateRefund(1000, 4.001, 'patient')).toBe(1000);
    expect(calculateRefund(1000, 4, 'patient')).toBe(0);
  });

  test('a refund is all or nothing', () => {
    // With the 4-24h band gone there is no partial refund left in the system.
    // Stated as a property so that reintroducing one has to be deliberate.
    fc.assert(fc.property(price, hours, (p, h) => {
      const refund = calculateRefund(p, h, 'patient');
      return refund === 0 || refund === p;
    }), { numRuns: RUNS });
  });
});

describe('zoned time', () => {
  /** Every half-hour slot of a day. */
  const halfHour = fc.integer({ min: 0, max: 47 }).map((n) => {
    const h = String(Math.floor(n / 2)).padStart(2, '0');
    return `${h}:${n % 2 ? '30' : '00'}`;
  });
  const dayOfYear = fc.integer({ min: 0, max: 364 }).map((n) => {
    const d = new Date(Date.UTC(2027, 0, 1) + n * 864e5);
    return d.toISOString().slice(0, 10);
  });

  const FIXED_OFFSET_ZONES = ['Asia/Kolkata', 'UTC'];
  const DST_ZONES = ['America/Los_Angeles', 'Europe/London', 'Australia/Lord_Howe'];

  test('in a fixed-offset zone every local time round-trips exactly', () => {
    // No fold and no gap, so the mapping is a bijection and the round trip is
    // an equality. This is the property the platform's own zone must satisfy.
    fc.assert(fc.property(dayOfYear, halfHour, fc.constantFrom(...FIXED_OFFSET_ZONES), (date, time, zone) => {
      const instant = zonedToUtc(date, time, zone);
      const back = utcToZoned(instant, zone);
      return back.localDate === date && back.localTime === time;
    }), { numRuns: 1500 });
  });

  test('in a DST zone the round trip holds except across the spring-forward gap', () => {
    // Found by this property rather than chosen: 2027-03-14 02:00 in
    // America/Los_Angeles does not exist — the clocks jump 02:00 -> 03:00 — so
    // no instant maps back to it and an equality round trip cannot hold. That
    // is arithmetic, not a defect; zonedTime.test.js pins the intended
    // behaviour for such a time separately.
    //
    // What must still hold everywhere is that the result is a real instant and
    // that normalising twice changes nothing.
    fc.assert(fc.property(dayOfYear, halfHour, fc.constantFrom(...DST_ZONES), (date, time, zone) => {
      const instant = zonedToUtc(date, time, zone);
      if (Number.isNaN(instant.getTime())) return false;

      const once = utcToZoned(instant, zone);
      const twice = utcToZoned(zonedToUtc(once.localDate, once.localTime, zone), zone);
      return once.localDate === twice.localDate && once.localTime === twice.localTime;
    }), { numRuns: 1500 });
  });

  test('the spring-forward gap is the ONLY place the DST round trip differs', () => {
    // Pin it explicitly so a future change that breaks an ordinary DST day is
    // not mistaken for this known case.
    const gap = utcToZoned(zonedToUtc('2027-03-14', '02:00', 'America/Los_Angeles'), 'America/Los_Angeles');
    expect(gap.localTime).not.toBe('02:00');
    expect(gap.localDate).toBe('2027-03-14');

    // An hour either side of the gap is unaffected.
    for (const time of ['01:00', '03:00', '04:30']) {
      const back = utcToZoned(zonedToUtc('2027-03-14', time, 'America/Los_Angeles'), 'America/Los_Angeles');
      expect(back.localTime).toBe(time);
      expect(back.localDate).toBe('2027-03-14');
    }

    // And a normal day in the same zone round-trips at every half hour.
    for (let n = 0; n < 48; n += 1) {
      const time = `${String(Math.floor(n / 2)).padStart(2, '0')}:${n % 2 ? '30' : '00'}`;
      const back = utcToZoned(zonedToUtc('2027-06-15', time, 'America/Los_Angeles'), 'America/Los_Angeles');
      expect(back.localTime).toBe(time);
    }
  });

  test('a later local time always maps to a later instant on the same day', () => {
    fc.assert(fc.property(dayOfYear, halfHour, halfHour, fc.constantFrom('Asia/Kolkata', 'UTC'), (date, a, b) => {
      // Zones without DST cannot fold or skip an hour, so ordering is total.
      if (a === b) return true;
      const [early, late] = a < b ? [a, b] : [b, a];
      return zonedToUtc(date, early, 'Asia/Kolkata') < zonedToUtc(date, late, 'Asia/Kolkata');
    }), { numRuns: RUNS });
  });

  test('IST is a fixed +5:30 all year — the assumption the old setHours code broke', () => {
    fc.assert(fc.property(dayOfYear, halfHour, (date, time) => {
      const instant = zonedToUtc(date, time, 'Asia/Kolkata');
      const [h, m] = time.split(':').map(Number);
      const naiveUtc = Date.UTC(
        Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m
      );
      return naiveUtc - instant.getTime() === 330 * 60 * 1000;
    }), { numRuns: RUNS });
  });

  test('normalizeTimeTo24h is idempotent', () => {
    fc.assert(fc.property(halfHour, (t) => normalizeTimeTo24h(normalizeTimeTo24h(t)) === normalizeTimeTo24h(t)),
      { numRuns: RUNS });
  });

  test('a 12-hour slot label round-trips back to the same 24-hour time', () => {
    fc.assert(fc.property(halfHour, (t) => normalizeTimeTo24h(to12hSlot(t)) === t),
      { numRuns: RUNS });
  });

  test('slotKey collapses every format the codebase produces for one slot', () => {
    fc.assert(fc.property(dayOfYear, halfHour, (date, time) => {
      const twelve = to12hSlot(time);
      const unpadded = twelve.replace(/^0/, '');
      return slotKey(date, time) === slotKey(date, twelve)
        && slotKey(date, twelve) === slotKey(date, unpadded);
    }), { numRuns: RUNS });
  });

  test('normalizeDate is idempotent and rejects anything that is not a date', () => {
    fc.assert(fc.property(dayOfYear, (d) => normalizeDate(normalizeDate(d)) === d), { numRuns: RUNS });
    fc.assert(fc.property(
      fc.string().filter((s) => !/^\d{4}-\d{2}-\d{2}/.test(s.trim())),
      (junk) => {
        try { normalizeDate(junk); return false; } catch (_) { return true; }
      }
    ), { numRuns: RUNS });
  });
});

describe('webhook signatures', () => {
  const secret = 'a-webhook-secret';
  const sign = (body) => require('crypto').createHmac('sha256', secret).update(body).digest('hex');

  test('a correct signature verifies for any payload', () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 400 }), (body) => {
      const raw = Buffer.from(body, 'utf8');
      return verifyWebhookSignature(raw, sign(raw), secret) === true;
    }), { numRuns: RUNS });
  });

  test('no mutation of the payload keeps the signature valid', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 200 }),
      fc.string({ minLength: 1, maxLength: 20 }),
      (body, extra) => {
        if (body === body + extra) return true;
        const raw = Buffer.from(body, 'utf8');
        const signature = sign(raw);
        const tampered = Buffer.from(body + extra, 'utf8');
        return verifyWebhookSignature(tampered, signature, secret) === false;
      }
    ), { numRuns: RUNS });
  });

  test('no wrong secret ever verifies', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 200 }),
      fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s !== secret),
      (body, wrong) => {
        const raw = Buffer.from(body, 'utf8');
        return verifyWebhookSignature(raw, sign(raw), wrong) === false;
      }
    ), { numRuns: RUNS });
  });

  test('a missing signature or secret is always a refusal, never a pass', () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 100 }), (body) => {
      const raw = Buffer.from(body, 'utf8');
      return verifyWebhookSignature(raw, undefined, secret) === false
        && verifyWebhookSignature(raw, sign(raw), undefined) === false
        && verifyWebhookSignature(undefined, sign(raw), secret) === false;
    }), { numRuns: 200 });
  });
});

describe('assessment scoring', () => {
  const TYPES = ['depression', 'anxiety', 'adhd', 'ptsd', 'addiction',
    'social-anxiety', 'post-partum', 'bipolar', 'gambling', 'eating-disorder'];

  const answers = fc.array(
    fc.record({ questionId: fc.integer({ min: 1, max: 40 }), answer: fc.integer({ min: 0, max: 4 }) }),
    { minLength: 1, maxLength: 30 }
  );

  test('the total is exactly the sum of the scored answers', () => {
    const { SCORING_TABLES } = require('../../utils/assessmentScoring');
    fc.assert(fc.property(fc.constantFrom(...TYPES), answers, (type, rs) => {
      const scored = computeScore(type, rs);
      if (scored === null) return false;
      const unscored = SCORING_TABLES[type].unscored || [];
      return scored.total === rs.filter((r) => !unscored.includes(r.questionId)).reduce((n, r) => n + r.answer, 0);
    }), { numRuns: RUNS });
  });

  test('the severity is always one of the values the schema permits', () => {
    const ALLOWED = new Set(['minimal', 'mild', 'moderate', 'severe', 'moderately-severe']);
    fc.assert(fc.property(fc.constantFrom(...TYPES), answers, (type, rs) => {
      const scored = computeScore(type, rs);
      return scored !== null && ALLOWED.has(scored.severity);
    }), { numRuns: RUNS });
  });

  test('severity never decreases as answers get worse', () => {
    const RANK = { minimal: 0, mild: 1, moderate: 2, 'moderately-severe': 3, severe: 4 };
    const { SCORING_TABLES } = require('../../utils/assessmentScoring');
    fc.assert(fc.property(
      fc.constantFrom(...TYPES),
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 0, max: 3 }),
      (type, n, base) => {
        // The question that picks a path (addiction Q1) is not an answer that
        // can be "worse"; it stays on the same path in both sets.
        const on = SCORING_TABLES[type].branchMax?.on;
        const answer = (id, value) => ({ questionId: id, answer: id === on ? 0 : value });
        const lower = Array.from({ length: n }, (_, i) => answer(i + 1, base));
        const higher = Array.from({ length: n }, (_, i) => answer(i + 1, base + 1));
        const a = computeScore(type, lower);
        const b = computeScore(type, higher);
        return a !== null && b !== null && RANK[b.severity] >= RANK[a.severity];
      }
    ), { numRuns: RUNS });
  });

  test('computeScore is a pure sum, so the boundary must refuse out-of-range answers first', () => {
    // computeScore sums whatever `answer` values it is given and divides by the
    // table's maxScore, with no clamp and no per-answer range check. That is
    // deliberate — client/src/__tests__/parity.test.ts compares it with the
    // client's scorer on arbitrary input — but it means the stored severity is
    // only as honest as the answers it is fed.
    //
    // This was a characterisation test: POST /api/assessments validated the
    // testType and never the answers, so a client could store 'severe' at a
    // percentage far above 100. validateResponses now sits in front of it, and
    // refuses both inputs below.
    //
    // eating-disorder has maxScore 5, so three answers of 1/2/3 overflow it.
    const overflowInput = [
      { questionId: 1, answer: 1 }, { questionId: 2, answer: 2 }, { questionId: 3, answer: 3 }
    ];
    const overflow = computeScore('eating-disorder', overflowInput);
    expect(overflow.total).toBe(6);
    expect(overflow.percentage).toBe(120);
    expect(validateResponses('eating-disorder', overflowInput).error).toBeDefined();

    const absurdInput = [{ questionId: 1, answer: 100000 }];
    expect(computeScore('depression', absurdInput).percentage).toBeGreaterThan(1000);
    expect(validateResponses('depression', absurdInput).error).toBeDefined();
  });

  test('anything validateResponses accepts scores inside 0-100% and inside its own options', () => {
    // The property the boundary exists for: generate arbitrary submissions,
    // and whenever one is accepted, the score derived from it is in range.
    const submission = fc.array(
      fc.record({ questionId: fc.integer({ min: 0, max: 30 }), answer: fc.integer({ min: -1, max: 5 }) }),
      { minLength: 1, maxLength: 30 }
    );
    fc.assert(fc.property(fc.constantFrom(...TYPES), submission, (type, rs) => {
      const checked = validateResponses(type, rs);
      if (checked.error) return true;
      const scored = computeScore(type, checked.responses);
      return scored.percentage >= 0 && scored.percentage <= 100;
    }), { numRuns: RUNS });
  });

  test('a complete, maximal answer set is accepted for every test and stays within maxScore', () => {
    // Anti-vacuity for the property above: without this, a validator that
    // refused everything would pass it. Also pins the question table to the
    // scoring table — every test reaches exactly its maxScore on its longest
    // path, and no path goes past it.
    const { QUESTION_SETS, SCORING_TABLES } = require('../../utils/assessmentScoring');
    for (const type of TYPES) {
      const set = QUESTION_SETS[type];
      const paths = set.branches
        ? Object.entries(set.branches).map(([pick, ids]) => ({ pick: Number(pick), ids: [...set.always, ...ids] }))
        : [{ pick: null, ids: Object.keys(set.questions).map(Number) }];
      let best = 0;
      for (const { pick, ids } of paths) {
        const rs = ids.map((id) => ({ questionId: id, answer: id === set.branchOn ? pick : Math.max(...set.questions[id]) }));
        const checked = validateResponses(type, rs);
        expect([type, pick, checked.error]).toEqual([type, pick, undefined]);
        const scored = computeScore(type, checked.responses);
        expect(scored.total).toBeLessThanOrEqual(SCORING_TABLES[type].maxScore);
        best = Math.max(best, scored.total);
      }
      expect([type, best]).toEqual([type, SCORING_TABLES[type].maxScore]);
    }
  });

  test('every addiction path can reach every band, and Q1 itself scores nothing', () => {
    // Q1 picks alcohol / drugs / a behaviour. Its value (0/1/2) used to be
    // summed, and one band table was shared by paths of 5, 3 and 2 questions,
    // so no result could ever be above "mild". Banded now on the share of the
    // chosen path answered "yes".
    const { QUESTION_SETS } = require('../../utils/assessmentScoring');
    const set = QUESTION_SETS.addiction;
    for (const [pick, ids] of Object.entries(set.branches)) {
      const severities = new Set();
      for (let yes = 0; yes <= ids.length; yes += 1) {
        const rs = [{ questionId: 1, answer: Number(pick) }, ...ids.map((id, i) => ({ questionId: id, answer: i < yes ? 1 : 0 }))];
        const scored = computeScore('addiction', validateResponses('addiction', rs).responses);
        expect(scored.total).toBe(yes);
        severities.add(scored.severity);
      }
      expect([pick, severities.has('minimal'), severities.has('severe')]).toEqual([pick, true, true]);
      if (ids.length > 2) expect([pick, severities.has('mild'), severities.has('moderate')]).toEqual([pick, true, true]);
    }
  });

  test('PTSD: answering "no" to Q1 ends the test after the past-experience questions', () => {
    const rs = Array.from({ length: 9 }, (_, i) => ({ questionId: i + 1, answer: i === 0 ? 0 : 1 }));
    const checked = validateResponses('ptsd', rs);
    expect(checked.error).toBeUndefined();
    expect(computeScore('ptsd', checked.responses)).toMatchObject({ total: 8, severity: 'mild' });
    // Saying "yes" to Q1 still requires the symptom questions.
    const yes = rs.map((r) => (r.questionId === 1 ? { ...r, answer: 1 } : r));
    expect(validateResponses('ptsd', yes).error).toMatch(/Missing answers for question\(s\) 10/);
  });

  test('depression is the PHQ-9: item 10 is asked but not scored', () => {
    const rs = Array.from({ length: 10 }, (_, i) => ({ questionId: i + 1, answer: 3 }));
    expect(computeScore('depression', validateResponses('depression', rs).responses)).toMatchObject({ total: 27, percentage: 100, severity: 'severe' });
    const onlyItem10 = rs.map((r) => ({ ...r, answer: r.questionId === 10 ? 3 : 0 }));
    expect(computeScore('depression', onlyItem10)).toMatchObject({ total: 0, severity: 'minimal' });
  });

  test('within the answer range every test type does stay inside 0-100%', () => {
    // The scorer is correct for the inputs the UI can actually produce; the
    // defect above is purely a missing input validation at the boundary.
    const inRange = fc.array(
      fc.record({ questionId: fc.integer({ min: 1, max: 9 }), answer: fc.integer({ min: 0, max: 1 }) }),
      { minLength: 1, maxLength: 5 }
    );
    // Branching tests are left out: their maximum is the chosen path's, and
    // an arbitrary list mixes paths in a way no client can send. The
    // validated property above covers them.
    const { SCORING_TABLES } = require('../../utils/assessmentScoring');
    const flat = TYPES.filter((t) => !SCORING_TABLES[t].branchMax);
    fc.assert(fc.property(fc.constantFrom(...flat), inRange, (type, rs) => {
      const scored = computeScore(type, rs);
      return scored.percentage >= 0 && scored.percentage <= 100;
    }), { numRuns: RUNS });
  });

  test('an unknown type returns null, and dla20 is deliberately excluded', () => {
    fc.assert(fc.property(
      // Object.prototype property names are excluded here and covered by the
      // next test, which is about them specifically.
      fc.string().filter((t) => !TYPES.includes(t) && !(t in Object.prototype)),
      answers,
      (type, rs) => computeScore(type, rs) === null
    ), { numRuns: 200 });
    expect(computeScore('dla20', [{ questionId: 1, answer: 2 }])).toBeNull();
  });

  test('a prototype property name is an unknown type, not a scoring table', () => {
    // Was a characterisation test asserting a throw. `SCORING_TABLES[testType]`
    // was a bare object lookup, so 'valueOf', 'toString' and 'constructor'
    // resolved up the prototype chain to truthy functions and slipped past the
    // `if (!table) return null` guard; the next line read
    // `table.severityLevels`, which is undefined, and the function threw
    // instead of honouring its documented "returns null for an uncovered
    // type" contract.
    //
    // Not reachable over HTTP — assessment.controller.js checks testType
    // against VALID_TEST_TYPES first — but the utility is exported. The lookup
    // is now an own-property check, and validateResponses uses the same one.
    for (const name of ['valueOf', 'toString', 'constructor', 'hasOwnProperty', '__proto__']) {
      expect(computeScore(name, [{ questionId: 1, answer: 1 }])).toBeNull();
      expect(validateResponses(name, [{ questionId: 1, answer: 1 }]).error).toBeDefined();
    }

    // For contrast, a name that is not on Object.prototype behaves correctly.
    expect(computeScore('not-a-real-test', [{ questionId: 1, answer: 1 }])).toBeNull();
  });
});
