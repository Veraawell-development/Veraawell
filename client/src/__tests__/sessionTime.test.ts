import { describe, it, expect } from 'vitest';
import {
  resolveSessionStart,
  sessionLocalDateKey,
  daysUntilSession,
  formatSessionClock,
  formatSessionDay,
} from '../utils/dateUtils';

/**
 * `sessionDate` is a UTC midnight and `sessionTime` an IST wall-clock string,
 * so `new Date(sessionDate).setHours(h, m)` gives a different instant on every
 * machine whose offset isn't +05:30. These helpers must not depend on the
 * machine's zone at all — the assertions below hold whatever TZ the test
 * runner is in.
 */
describe('resolveSessionStart', () => {
  it('prefers startsAt', () => {
    const start = resolveSessionStart({
      startsAt: '2026-03-10T09:00:00.000Z',
      sessionDate: '2026-01-01T00:00:00.000Z',
      sessionTime: '11:00 PM',
    });
    expect(start.toISOString()).toBe('2026-03-10T09:00:00.000Z');
  });

  it('reads the legacy pair as IST wall clock, independent of the viewer', () => {
    // 2:30 PM IST on 10 March = 09:00 UTC.
    expect(resolveSessionStart({ sessionDate: '2026-03-10T00:00:00.000Z', sessionTime: '02:30 PM' }).toISOString())
      .toBe('2026-03-10T09:00:00.000Z');
    expect(resolveSessionStart({ sessionDate: '2026-03-10T00:00:00.000Z', sessionTime: '14:30' }).toISOString())
      .toBe('2026-03-10T09:00:00.000Z');
  });

  it('handles early-morning IST slots that fall on the previous UTC day', () => {
    // 1:00 AM IST on 10 March = 19:30 UTC on 9 March.
    expect(resolveSessionStart({ sessionDate: '2026-03-10', sessionTime: '01:00 AM' }).toISOString())
      .toBe('2026-03-09T19:30:00.000Z');
  });

  it("keeps an immediate session's sessionDate, which is already an instant", () => {
    expect(resolveSessionStart({ sessionDate: '2026-03-10T11:47:13.000Z', sessionTime: '05:17 PM' }).toISOString())
      .toBe('2026-03-10T11:47:13.000Z');
  });

  it('returns an invalid date rather than "now" when there is nothing to go on', () => {
    expect(Number.isNaN(resolveSessionStart({}).getTime())).toBe(true);
    expect(Number.isNaN(resolveSessionStart(null).getTime())).toBe(true);
  });
});

describe('sessionLocalDateKey', () => {
  it('is the IST calendar day', () => {
    expect(sessionLocalDateKey({ startsAt: '2026-03-09T19:30:00.000Z' })).toBe('2026-03-10');
    expect(sessionLocalDateKey({ startsAt: '2026-03-10T18:29:00.000Z' })).toBe('2026-03-10');
    expect(sessionLocalDateKey({ startsAt: '2026-03-10T18:30:00.000Z' })).toBe('2026-03-11');
    expect(sessionLocalDateKey({ sessionDate: '2026-03-10T00:00:00.000Z', sessionTime: '10:00 AM' })).toBe('2026-03-10');
  });
});

describe('daysUntilSession', () => {
  const now = new Date('2026-03-10T18:00:00.000Z'); // 11:30 PM IST, 10 March

  it('counts IST calendar days', () => {
    expect(daysUntilSession({ startsAt: '2026-03-10T17:00:00.000Z' }, now)).toBe(0);
    expect(daysUntilSession({ startsAt: '2026-03-10T19:00:00.000Z' }, now)).toBe(1); // 12:30 AM IST, 11 March
    expect(daysUntilSession({ startsAt: '2026-03-13T05:00:00.000Z' }, now)).toBe(3);
  });
});

describe('display helpers', () => {
  it('format in IST regardless of the viewer', () => {
    const start = new Date('2026-03-10T09:00:00.000Z');
    expect(formatSessionClock(start, 'en-US')).toBe('2:30 PM');
    expect(formatSessionDay(start, { day: 'numeric', month: 'short' }, 'en-US')).toBe('Mar 10');
    expect(formatSessionDay(new Date('2026-03-09T19:30:00.000Z'), { day: 'numeric', month: 'short' }, 'en-US')).toBe('Mar 10');
  });
});
