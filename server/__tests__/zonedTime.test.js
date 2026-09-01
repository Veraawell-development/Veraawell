/**
 * Timezone conversion. Pure, no DB, no clock.
 *
 * Every assertion here must hold regardless of the server's own timezone —
 * that is the whole point, since the bug being fixed was code that silently
 * used the server's offset. `npm run test:tz` re-runs the suite under
 * America/Los_Angeles (DST-observing, west of UTC, whole-hour offset) which
 * breaks all three assumptions the old `setHours` code made.
 */

const {
  zonedToUtc, utcToZoned, zoneOffsetMinutes,
  normalizeTimeTo24h, to12hSlot, normalizeDate, slotKey
} = require('../utils/zonedTime');

const IST = 'Asia/Kolkata';
const NY = 'America/New_York';

describe('zoneOffsetMinutes', () => {
  test('IST is +330 all year (no DST)', () => {
    expect(zoneOffsetMinutes(new Date('2026-01-15T00:00:00Z'), IST)).toBe(330);
    expect(zoneOffsetMinutes(new Date('2026-07-15T00:00:00Z'), IST)).toBe(330);
  });

  test('a DST zone reports both offsets', () => {
    expect(zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), NY)).toBe(-300); // EST
    expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), NY)).toBe(-240); // EDT
  });
});

describe('zonedToUtc', () => {
  test('a 9:00 AM IST slot is 03:30Z — the exact case the old code got wrong', () => {
    // The old code produced 09:00Z on a UTC server, i.e. 2:30 PM IST.
    expect(zonedToUtc('2026-03-14', '09:00', IST).toISOString()).toBe('2026-03-14T03:30:00.000Z');
  });

  test('00:30 IST belongs to the PREVIOUS UTC day', () => {
    // This is the case that breaks `toISOString().split('T')[0]` as a day key:
    // the UTC date is the 13th while the booking is on the 14th.
    expect(zonedToUtc('2026-03-14', '00:30', IST).toISOString()).toBe('2026-03-13T19:00:00.000Z');
  });

  test('23:45 IST stays on the same UTC day', () => {
    expect(zonedToUtc('2026-03-14', '23:45', IST).toISOString()).toBe('2026-03-14T18:15:00.000Z');
  });

  test('05:30 IST is exactly UTC midnight', () => {
    expect(zonedToUtc('2026-03-14', '05:30', IST).toISOString()).toBe('2026-03-14T00:00:00.000Z');
  });

  test('accepts 12-hour input identically', () => {
    const a = zonedToUtc('2026-03-14', '09:00', IST);
    const b = zonedToUtc('2026-03-14', '09:00 AM', IST);
    const c = zonedToUtc('2026-03-14', '9:00 AM', IST);
    expect(b.getTime()).toBe(a.getTime());
    expect(c.getTime()).toBe(a.getTime());
  });

  test('round-trips every half hour across three dates', () => {
    for (const date of ['2026-01-31', '2026-03-14', '2026-12-31']) {
      for (let h = 0; h < 24; h += 1) {
        for (const m of ['00', '30']) {
          const time = `${String(h).padStart(2, '0')}:${m}`;
          const back = utcToZoned(zonedToUtc(date, time, IST), IST);
          expect(back).toEqual({ localDate: date, localTime: time });
        }
      }
    }
  });

  // Not production zones, but they prove the two-pass fixpoint is real rather
  // than incidentally correct for a DST-free zone.
  test('a nonexistent local time (spring forward) maps forward, deterministically', () => {
    // 02:30 does not exist in New York on 2026-03-08.
    const d = zonedToUtc('2026-03-08', '02:30', NY);
    expect(d.toISOString()).toBe('2026-03-08T06:30:00.000Z');
  });

  test('an ambiguous local time (fall back) resolves to the earlier instant', () => {
    // 01:30 occurs twice in New York on 2026-11-01.
    const d = zonedToUtc('2026-11-01', '01:30', NY);
    expect(d.toISOString()).toBe('2026-11-01T05:30:00.000Z'); // EDT, the earlier one
  });
});

describe('normalizeTimeTo24h', () => {
  test.each([
    ['09:00 AM', '09:00'],
    ['9:00 AM', '09:00'],
    ['12:00 AM', '00:00'],
    ['12:00 PM', '12:00'],
    ['03:00 PM', '15:00'],
    ['11:59 PM', '23:59'],
    ['14:30', '14:30'],
    ['00:00', '00:00'],
    ['23:59', '23:59'],
    ['09:00', '09:00'],
    ['  09:00 am  ', '09:00']
  ])('%s -> %s', (input, expected) => {
    expect(normalizeTimeTo24h(input)).toBe(expected);
  });

  test.each([['0900'], ['abc'], [''], ['25:00'], ['12:99'], ['13:00 PM'], [null], [undefined]])(
    'rejects %p with a ValidationError rather than throwing a TypeError',
    (bad) => {
      // utils/timeUtils.parseTime threw `cm.includes is not a function` on
      // colon-less input, which surfaced as a 500.
      expect(() => normalizeTimeTo24h(bad)).toThrow(/Invalid time/);
    }
  );
});

describe('to12hSlot', () => {
  test.each([
    ['00:00', '12:00 AM'],
    ['09:00', '09:00 AM'],
    ['12:00', '12:00 PM'],
    ['15:00', '03:00 PM'],
    ['23:59', '11:59 PM']
  ])('%s -> %s', (input, expected) => {
    expect(to12hSlot(input)).toBe(expected);
  });

  test('is idempotent on its own output', () => {
    expect(to12hSlot(to12hSlot('15:00'))).toBe('03:00 PM');
  });
});

describe('slotKey', () => {
  test('all three producer formats collapse to one identity', () => {
    // The formats that exist in the codebase: the availability grid emits
    // 12-hour, bookImmediate emitted bare 24-hour. A mismatch between them is
    // why releaseSlot could silently fail and leak a slot forever.
    const a = slotKey('2026-03-14', '9:00 AM');
    const b = slotKey('2026-03-14', '09:00 AM');
    const c = slotKey('2026-03-14', '09:00');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test('distinguishes different times and dates', () => {
    expect(slotKey('2026-03-14', '09:00')).not.toBe(slotKey('2026-03-14', '10:00'));
    expect(slotKey('2026-03-14', '09:00')).not.toBe(slotKey('2026-03-15', '09:00'));
  });

  test('accepts a Date for the date part', () => {
    expect(slotKey(new Date('2026-03-14T00:00:00Z'), '09:00')).toBe('2026-03-14T09:00');
  });
});

describe('normalizeDate', () => {
  test('accepts an ISO string, a date-only string, and a Date', () => {
    expect(normalizeDate('2026-03-14')).toBe('2026-03-14');
    expect(normalizeDate('2026-03-14T18:15:00.000Z')).toBe('2026-03-14');
    expect(normalizeDate(new Date('2026-03-14T00:00:00Z'))).toBe('2026-03-14');
  });

  test('rejects garbage', () => {
    expect(() => normalizeDate('14/03/2026')).toThrow(/Invalid date/);
    expect(() => normalizeDate('not-a-date')).toThrow(/Invalid date/);
  });
});
