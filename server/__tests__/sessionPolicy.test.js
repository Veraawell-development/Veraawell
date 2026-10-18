/**
 * services/sessionPolicy.js — the session rules, exhaustively.
 *
 * Every scenario in docs/SESSION_RULES.md is a case below, with real
 * timestamps. A session here is a plain object: the policy reads only
 * startsAt / endsAt / duration / status / paymentStatus / attendance and the
 * legacy joined flags.
 */

const fc = require('fast-check');
const policy = require('../services/sessionPolicy');

fc.configureGlobal({ seed: Number(process.env.FC_SEED) || 20261018 });

const MIN = 60 * 1000;
const T = new Date('2026-11-02T04:30:00.000Z'); // 10:00 IST
const at = (minutes) => new Date(T.getTime() + minutes * MIN);

function session({ duration = 20, status = 'scheduled', paymentStatus = 'paid', attendance, ...rest } = {}) {
  return {
    startsAt: T,
    endsAt: at(duration),
    duration,
    status,
    paymentStatus,
    attendance,
    ...rest
  };
}
const stay = (role, from, to = null) => ({ role, joinedAt: at(from), leftAt: to === null ? null : at(to), source: 'socket' });

describe('grace deadline and classification at T+10', () => {
  test('both in before the start', () => {
    expect(policy.classifyAtGrace(session({ attendance: [stay('doctor', -5), stay('patient', -2)] }))).toBe('both');
  });
  test('both in at T+9', () => {
    expect(policy.classifyAtGrace(session({ attendance: [stay('doctor', 9), stay('patient', 9)] }))).toBe('both');
  });
  test('exactly at the deadline counts as in time', () => {
    expect(policy.classifyAtGrace(session({ attendance: [stay('doctor', 10), stay('patient', 0)] }))).toBe('both');
  });
  test('doctor at T+11 is absent', () => {
    expect(policy.classifyAtGrace(session({ attendance: [stay('doctor', 11), stay('patient', 1)] }))).toBe('doctor_absent');
  });
  test('patient at T+11 is absent', () => {
    expect(policy.classifyAtGrace(session({ attendance: [stay('doctor', 1), stay('patient', 11)] }))).toBe('patient_absent');
  });
  test('nobody', () => {
    expect(policy.classifyAtGrace(session({ attendance: [] }))).toBe('nobody');
  });
  test('a doctor who came and went before the deadline still counts as having come', () => {
    expect(policy.classifyAtGrace(session({ attendance: [stay('doctor', 2, 4), stay('patient', 12)] }))).toBe('patient_absent');
  });
  test('the deadline is start + 10 minutes', () => {
    expect(policy.graceDeadline(session())).toEqual(at(10));
  });
});

describe('when the session really ends', () => {
  test('doctor on time: the booked end', () => {
    expect(policy.effectiveEndsAt(session({ attendance: [stay('doctor', 0), stay('patient', 0)] }))).toEqual(at(20));
  });
  test('doctor 5 minutes late: the patient keeps all 20 minutes', () => {
    expect(policy.effectiveEndsAt(session({ attendance: [stay('patient', 0), stay('doctor', 5)] }))).toEqual(at(25));
  });
  test('doctor 15 minutes late: ends 15 minutes later', () => {
    expect(policy.effectiveEndsAt(session({ attendance: [stay('patient', 0), stay('doctor', 15)] }))).toEqual(at(35));
  });
  test('doctor early: unchanged', () => {
    expect(policy.effectiveEndsAt(session({ attendance: [stay('doctor', -10)] }))).toEqual(at(20));
  });
  test('a late patient never moves the end', () => {
    expect(policy.effectiveEndsAt(session({ attendance: [stay('doctor', 0), stay('patient', 12)] }))).toEqual(at(20));
  });
  test('doctor never came: unchanged', () => {
    expect(policy.effectiveEndsAt(session({ attendance: [stay('patient', 0)] }))).toEqual(at(20));
  });
  test('only the doctor\'s FIRST join counts (rejoining later does not extend again)', () => {
    expect(policy.effectiveEndsAt(session({ attendance: [stay('doctor', 3, 6), stay('doctor', 14), stay('patient', 0)] }))).toEqual(at(23));
  });
  test('55-minute session, doctor 8 minutes late', () => {
    expect(policy.effectiveEndsAt(session({ duration: 55, attendance: [stay('patient', 0), stay('doctor', 8)] }))).toEqual(at(63));
  });
  test('the join window opens 15 minutes early and closes at the real end', () => {
    const w = policy.joinWindow(session({ attendance: [stay('patient', 0), stay('doctor', 5)] }));
    expect(w.opensAt).toEqual(at(-15));
    expect(w.closesAt).toEqual(at(25));
  });
});

describe('minutes together (actualDuration)', () => {
  test('counts only the time both were in, up to the given moment', () => {
    const s = session({ attendance: [stay('patient', 0, 12), stay('patient', 15), stay('doctor', 2, 20)] });
    // 2..12 and 15..20 together.
    expect(policy.minutesTogether(s, at(30))).toBe(15);
    // Open stays count up to `until`.
    expect(policy.minutesTogether(s, at(18))).toBe(13);
  });

  test('never together is zero', () => {
    const s = session({ attendance: [stay('patient', 0, 5), stay('doctor', 6, 9)] });
    expect(policy.minutesTogether(s, at(20))).toBe(0);
    expect(policy.minutesTogether(session({}), at(20))).toBe(0);
  });
});

describe('"Leave & full refund" for a waiting patient', () => {
  test('not before the grace deadline', () => {
    const s = session({ attendance: [stay('patient', 0)] });
    expect(policy.doctorAbsentRefundAvailable(s, at(9))).toBe(false);
    expect(policy.doctorAbsentRefundAt(s, at(9))).toEqual(at(10));
  });
  test('at the deadline, if the doctor never came and the patient is there', () => {
    expect(policy.doctorAbsentRefundAvailable(session({ attendance: [stay('patient', 0)] }), at(10))).toBe(true);
  });
  test('a patient arriving after the deadline can leave with a refund straight away', () => {
    expect(policy.doctorAbsentRefundAvailable(session({ attendance: [stay('patient', 12)] }), at(12))).toBe(true);
  });
  test('not when the patient isn\'t there either', () => {
    expect(policy.doctorAbsentRefundAvailable(session({ attendance: [] }), at(15))).toBe(false);
    expect(policy.doctorAbsentRefundAt(session({ attendance: [] }), at(15))).toBeNull();
  });
  test('doctor came and left: only after 10 minutes alone', () => {
    const s = session({ attendance: [stay('patient', 1), stay('doctor', 2, 5)] });
    expect(policy.doctorAbsentRefundAvailable(s, at(14))).toBe(false);
    expect(policy.doctorAbsentRefundAvailable(s, at(15))).toBe(true);
    expect(policy.doctorAbsentRefundAt(s, at(14))).toEqual(at(15));
  });
  test('the doctor coming back resets it', () => {
    const s = session({ attendance: [stay('patient', 1), stay('doctor', 2, 5), stay('doctor', 12)] });
    expect(policy.doctorAbsentRefundAvailable(s, at(13))).toBe(false);
  });
  test('a patient who dropped and rejoined is timed from their latest arrival only if the doctor was there in between', () => {
    // patient alone T+1..T+3, leaves, comes back T+4 — doctor never came: available at the deadline
    const s = session({ attendance: [stay('patient', 1, 3), stay('patient', 4)] });
    expect(policy.doctorAbsentRefundAvailable(s, at(10))).toBe(true);
  });
  test('not for a cancelled session', () => {
    expect(policy.doctorAbsentRefundAvailable(session({ status: 'cancelled', attendance: [stay('patient', 0)] }), at(12))).toBe(false);
  });
  test('not for a free session — nothing to refund', () => {
    expect(policy.doctorAbsentRefundAvailable(session({ paymentStatus: 'not_required', attendance: [stay('patient', 0)] }), at(12))).toBe(false);
  });
  test('works for an active (instant) session too', () => {
    expect(policy.doctorAbsentRefundAvailable(session({ status: 'active', attendance: [stay('patient', 0)] }), at(10))).toBe(true);
  });
});

describe('aloneSince', () => {
  test('null when both are in, or the patient is not', () => {
    expect(policy.aloneSince(session({ attendance: [stay('patient', 0), stay('doctor', 0)] }), at(5))).toBeNull();
    expect(policy.aloneSince(session({ attendance: [stay('doctor', 0)] }), at(5))).toBeNull();
  });
  test('from the patient\'s arrival when the doctor never came', () => {
    expect(policy.aloneSince(session({ attendance: [stay('patient', 2)] }), at(8))).toEqual(at(2));
  });
  test('from the moment the doctor left', () => {
    expect(policy.aloneSince(session({ attendance: [stay('patient', 0), stay('doctor', 1, 6)] }), at(9))).toEqual(at(6));
  });
});

describe('the final result of a session that ran its course', () => {
  const outcome = (attendance) => policy.finalOutcome(session({ attendance }));

  test('S1 both on time → completed, doctor paid', () => {
    expect(outcome([stay('doctor', 0, 20), stay('patient', 0, 20)])).toEqual({ code: 'completed', refund: 'none', doctorPaid: true, counter: null });
  });
  test('S2 patient late → completed', () => {
    expect(outcome([stay('doctor', 0), stay('patient', 12)])).toMatchObject({ code: 'completed', doctorPaid: true, counter: null });
  });
  test('S3 patient never came, doctor in by grace → patient no-show, doctor paid', () => {
    expect(outcome([stay('doctor', 1, 11)])).toEqual({ code: 'patient_no_show', refund: 'none', doctorPaid: true, counter: null });
  });
  test('S4 doctor late within grace → completed, not counted', () => {
    expect(outcome([stay('patient', 0), stay('doctor', 7)])).toMatchObject({ code: 'completed', counter: null });
  });
  test('S6 doctor more than 10 minutes late, patient waited → completed, counted late', () => {
    expect(outcome([stay('patient', 0), stay('doctor', 12)])).toEqual({ code: 'completed', refund: 'none', doctorPaid: true, counter: 'late' });
  });
  test('S7 doctor never came → full refund, counted no-show', () => {
    expect(outcome([stay('patient', 0, 30)])).toEqual({ code: 'doctor_no_show', refund: 'full', doctorPaid: false, counter: 'no_show' });
  });
  test('S8 nobody came → full refund, counted no-show', () => {
    expect(outcome([])).toEqual({ code: 'nobody_came', refund: 'full', doctorPaid: false, counter: 'no_show' });
  });
  test('E11 doctor only after grace, patient never → patient no-show, doctor paid but counted late', () => {
    expect(outcome([stay('doctor', 14)])).toEqual({ code: 'patient_no_show', refund: 'none', doctorPaid: true, counter: 'late' });
  });
  test('E2 doctor waited and left, patient came afterwards → patient no-show', () => {
    expect(outcome([stay('doctor', 1, 11), stay('patient', 12)])).toMatchObject({ code: 'patient_no_show', doctorPaid: true });
  });
  test('never together, doctor only after grace → doctor no-show, refund', () => {
    expect(outcome([stay('patient', 1, 4), stay('doctor', 13)])).toMatchObject({ code: 'doctor_no_show', refund: 'full' });
  });
  test('never together, both came within grace → completed (kept simple)', () => {
    expect(outcome([stay('patient', 1, 3), stay('doctor', 5, 9)])).toMatchObject({ code: 'completed', doctorPaid: true });
  });
  test('E4/E5 one of them leaves early → still completed', () => {
    expect(outcome([stay('patient', 0, 5), stay('doctor', 0, 20)])).toMatchObject({ code: 'completed' });
    expect(outcome([stay('patient', 0, 20), stay('doctor', 0, 5)])).toMatchObject({ code: 'completed' });
  });
  test('E7 short drops do not matter', () => {
    expect(outcome([stay('patient', 0, 5), stay('patient', 6), stay('doctor', 0)])).toMatchObject({ code: 'completed' });
  });
});

describe('sessions from before attendance was recorded', () => {
  test('the legacy join timestamps are read as open stays', () => {
    const s = { ...session(), attendance: undefined, doctorJoined: true, doctorJoinedAt: at(2), patientJoined: true, patientJoinedAt: at(3) };
    expect(policy.classifyAtGrace(s)).toBe('both');
    expect(policy.finalOutcome(s)).toMatchObject({ code: 'completed' });
  });
  test('a flag without a timestamp counts from the start', () => {
    const s = { ...session(), attendance: undefined, doctorJoined: true };
    expect(policy.firstJoin(s, 'doctor')).toEqual(T);
    expect(policy.finalOutcome(s)).toMatchObject({ code: 'patient_no_show' });
  });
  test('no flags at all: nobody came', () => {
    expect(policy.finalOutcome({ ...session(), attendance: undefined })).toMatchObject({ code: 'nobody_came' });
  });
  test('recorded attendance wins over the flags for that role', () => {
    const s = { ...session(), attendance: [stay('doctor', 12)], doctorJoined: true, doctorJoinedAt: at(1) };
    expect(policy.firstJoin(s, 'doctor')).toEqual(at(12));
  });
});

describe('instant sessions (start = when the doctor accepted)', () => {
  test('grace and the end are measured from the accept time', () => {
    const accepted = at(30);
    const s = { ...session(), startsAt: accepted, endsAt: new Date(accepted.getTime() + 20 * MIN), status: 'active',
      attendance: [stay('patient', 25), stay('doctor', 33)] };
    expect(policy.graceDeadline(s)).toEqual(at(40));
    expect(policy.effectiveEndsAt(s)).toEqual(at(53));
    expect(policy.classifyAtGrace(s)).toBe('both');
  });
});

describe('properties (random attendance)', () => {
  const minute = fc.integer({ min: -20, max: 70 });
  const stayArb = fc.record({
    role: fc.constantFrom('patient', 'doctor'),
    from: minute,
    length: fc.option(fc.integer({ min: 1, max: 60 }), { nil: null })
  }).map(({ role, from, length }) => stay(role, from, length === null ? null : from + length));
  const attendanceArb = fc.array(stayArb, { maxLength: 8 });
  const CODES = ['completed', 'patient_no_show', 'doctor_no_show', 'nobody_came'];

  test('the outcome is always one of the four final codes, and money follows it', () => {
    fc.assert(fc.property(attendanceArb, (attendance) => {
      const o = policy.finalOutcome(session({ attendance }));
      expect(CODES).toContain(o.code);
      expect(o.doctorPaid).toBe(o.refund === 'none');
    }));
  });

  test('a full refund happens exactly when the doctor never shared the call within reach of the rules', () => {
    fc.assert(fc.property(attendanceArb, (attendance) => {
      const s = session({ attendance });
      const o = policy.finalOutcome(s);
      if (!policy.firstJoin(s, 'doctor')) expect(o.refund).toBe('full');
      if (policy.everTogether(s)) expect(o.refund).toBe('none');
    }));
  });

  test('the real end is never before the booked end', () => {
    fc.assert(fc.property(attendanceArb, (attendance) => {
      expect(policy.effectiveEndsAt(session({ attendance })).getTime()).toBeGreaterThanOrEqual(at(20).getTime());
    }));
  });

  test('aloneSince is never in the future', () => {
    fc.assert(fc.property(attendanceArb, minute, (attendance, nowMinute) => {
      const since = policy.aloneSince(session({ attendance }), at(nowMinute));
      if (since) expect(since.getTime()).toBeLessThanOrEqual(at(nowMinute).getTime());
    }));
  });

  test('the refund offer is never available before the grace deadline', () => {
    fc.assert(fc.property(attendanceArb, minute, (attendance, nowMinute) => {
      if (policy.doctorAbsentRefundAvailable(session({ attendance }), at(nowMinute))) {
        expect(nowMinute).toBeGreaterThanOrEqual(10);
      }
    }));
  });
});
