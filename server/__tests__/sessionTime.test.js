/**
 * Session timing, through the real pipeline.
 *
 * refundPolicy.test.js already pins calculateRefund's tier boundaries as a
 * pure function. That was never where the bug was: the bug was in the
 * PROVENANCE of `hoursUntil`, which every caller derived with
 * `new Date(sessionDate).setHours(h, m)` — the server's offset applied to a
 * UTC-stored date. So this file asserts the boundaries end-to-end, from a
 * stored session to a refund amount.
 *
 * Runs under a faked clock, and must pass under any server timezone
 * (`npm run test:tz` re-runs everything under America/Los_Angeles).
 */

const {
  resolveStartsAt, resolveEndsAt, hoursUntilStart,
  joinWindow, isWithinJoinWindow, hasElapsed, deriveFields
} = require('../services/sessionTime');
const { calculateRefund } = require('../services/refundPolicy');
const { zonedToUtc } = require('../utils/zonedTime');
const { PLATFORM_TIMEZONE } = require('../config/time');

const IST = PLATFORM_TIMEZONE;

// 07:30 IST — deliberately a time whose IST calendar date differs from its UTC
// date for part of the day, which is the regime the bugs lived in.
const NOW = new Date('2026-03-14T02:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
});
afterEach(() => {
  jest.useRealTimers();
});

/** A session as the model would store it. */
function session({ startsAt, duration = 60, ...rest }) {
  return { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', ...deriveFields(startsAt, duration, IST), duration, ...rest };
}

describe('resolveStartsAt', () => {
  test('prefers the stored instant', () => {
    const s = session({ startsAt: new Date('2026-03-14T03:30:00.000Z') });
    expect(resolveStartsAt(s).toISOString()).toBe('2026-03-14T03:30:00.000Z');
  });

  test('derives a legacy row from (sessionDate, sessionTime) as IST wall clock', () => {
    // What bookSession wrote before startsAt existed: a UTC-midnight date plus
    // a 12-hour string meaning IST.
    const legacy = {
      sessionDate: new Date('2026-03-14T00:00:00.000Z'),
      sessionTime: '09:00 AM',
      duration: 60
    };
    expect(resolveStartsAt(legacy).toISOString()).toBe('2026-03-14T03:30:00.000Z');
  });

  test('treats a legacy immediate session as an instant, not a wall clock', () => {
    // bookImmediate stored `new Date()` — a real instant — and a sessionTime
    // generated from getUTCHours(). Re-deriving from that string would move it.
    const legacyImmediate = {
      sessionDate: new Date('2026-03-14T02:00:00.000Z'),
      sessionTime: '02:00',
      duration: 20
    };
    expect(resolveStartsAt(legacyImmediate).toISOString()).toBe('2026-03-14T02:00:00.000Z');
  });
});

describe('refund tier boundaries, end to end', () => {
  const PRICE = 1000;

  function refundFor(hoursOut) {
    const s = session({ startsAt: new Date(NOW.getTime() + hoursOut * 3600 * 1000) });
    return calculateRefund(PRICE, hoursUntilStart(s), 'patient');
  }

  test('exactly 4h out is the 0% tier (the boundary is >4h)', () => {
    expect(refundFor(4)).toBe(0);
  });

  test('a millisecond past 4h is already a FULL refund', () => {
    // The single boundary in the policy, exercised through the real
    // startsAt -> hoursUntilStart -> calculateRefund pipeline rather than by
    // calling calculateRefund with a hand-written hours figure.
    const s = session({ startsAt: new Date(NOW.getTime() + 4 * 3600 * 1000 + 1) });
    expect(calculateRefund(PRICE, hoursUntilStart(s), 'patient')).toBe(1000);
  });

  test('a millisecond before 4h is nothing', () => {
    const s = session({ startsAt: new Date(NOW.getTime() + 4 * 3600 * 1000 - 1) });
    expect(calculateRefund(PRICE, hoursUntilStart(s), 'patient')).toBe(0);
  });

  test('24h is not a boundary — it used to split 100% from 50%', () => {
    for (const hoursOut of [23.99, 24, 24.01]) {
      expect(refundFor(hoursOut)).toBe(PRICE);
    }
  });

  test('a doctor cancellation is always a full refund regardless of timing', () => {
    const s = session({ startsAt: new Date(NOW.getTime() + 1 * 3600 * 1000) });
    expect(calculateRefund(PRICE, hoursUntilStart(s), 'doctor')).toBe(1000);
  });

  test('the tier does not depend on the server timezone', () => {
    // The decisive property. A session stored as an instant yields the same
    // hoursUntil no matter what TZ the process runs in — which is exactly what
    // setHours could not guarantee.
    const s = session({ startsAt: new Date(NOW.getTime() + 10 * 3600 * 1000) });
    expect(hoursUntilStart(s)).toBeCloseTo(10, 9);
    expect(calculateRefund(PRICE, hoursUntilStart(s), 'patient')).toBe(1000);

    // And close to the boundary, where a 5h30m timezone error would actually
    // change the answer rather than just the arithmetic.
    const nearBoundary = session({ startsAt: new Date(NOW.getTime() + 4.5 * 3600 * 1000) });
    expect(calculateRefund(PRICE, hoursUntilStart(nearBoundary), 'patient')).toBe(1000);
  });
});

describe('join window', () => {
  const startsAt = new Date('2026-03-14T03:30:00.000Z'); // 09:00 IST
  const s = () => session({ startsAt, duration: 60 });

  test('opens exactly 15 minutes before the start', () => {
    const { opensAt } = joinWindow(s());
    expect(opensAt.toISOString()).toBe('2026-03-14T03:15:00.000Z');
  });

  test('closes 60 minutes after the end', () => {
    const { closesAt } = joinWindow(s());
    expect(closesAt.toISOString()).toBe('2026-03-14T05:30:00.000Z');
  });

  test('closed 15 minutes and 1ms before the start', () => {
    jest.setSystemTime(new Date(startsAt.getTime() - 15 * 60000 - 1));
    expect(isWithinJoinWindow(s())).toBe(false);
  });

  test('open exactly at the 15-minute mark', () => {
    jest.setSystemTime(new Date(startsAt.getTime() - 15 * 60000));
    expect(isWithinJoinWindow(s())).toBe(true);
  });

  test('open during the session', () => {
    jest.setSystemTime(new Date(startsAt.getTime() + 30 * 60000));
    expect(isWithinJoinWindow(s())).toBe(true);
  });

  test('closed after the grace period', () => {
    jest.setSystemTime(new Date(startsAt.getTime() + 60 * 60000 + 60 * 60000 + 1));
    expect(isWithinJoinWindow(s())).toBe(false);
  });
});

describe('the 00:30 IST case', () => {
  // The case that breaks `toISOString().split('T')[0]` as a day key, and with
  // it every slot release that used it.
  const startsAt = zonedToUtc('2026-03-15', '00:30', IST);

  test('the instant is on the previous UTC day', () => {
    expect(startsAt.toISOString()).toBe('2026-03-14T19:00:00.000Z');
  });

  test('but localDate is the IST day the patient booked', () => {
    const s = session({ startsAt });
    expect(s.localDate).toBe('2026-03-15');   // NOT '2026-03-14'
    expect(s.localTime).toBe('00:30');
  });

  test('the legacy display fields agree with the instant', () => {
    const s = session({ startsAt });
    expect(s.sessionTime).toBe('12:30 AM');
    expect(s.sessionDate.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  test('endsAt is derived from the instant, crossing midnight UTC cleanly', () => {
    const s = session({ startsAt, duration: 60 });
    expect(resolveEndsAt(s).toISOString()).toBe('2026-03-14T20:00:00.000Z');
  });
});

describe('deriveFields keeps every representation consistent', () => {
  test('a 15:00 IST booking', () => {
    const f = deriveFields(zonedToUtc('2026-06-01', '15:00', IST), 40, IST);
    expect(f.localDate).toBe('2026-06-01');
    expect(f.localTime).toBe('15:00');
    expect(f.sessionTime).toBe('03:00 PM');          // matches the 12h slot grid
    expect(f.startsAt.toISOString()).toBe('2026-06-01T09:30:00.000Z');
    expect(f.endsAt.toISOString()).toBe('2026-06-01T10:10:00.000Z');
    expect(f.timezone).toBe(IST);
  });

  test('midnight IST', () => {
    const f = deriveFields(zonedToUtc('2026-06-01', '00:00', IST), 60, IST);
    expect(f.localTime).toBe('00:00');
    expect(f.sessionTime).toBe('12:00 AM');
    expect(f.startsAt.toISOString()).toBe('2026-05-31T18:30:00.000Z');
  });
});

describe('hasElapsed', () => {
  test('false during the session, true after its end', () => {
    const s = session({ startsAt: new Date(NOW.getTime() - 30 * 60000), duration: 60 });
    expect(hasElapsed(s)).toBe(false);
    jest.setSystemTime(new Date(NOW.getTime() + 31 * 60000));
    expect(hasElapsed(s)).toBe(true);
  });
});
