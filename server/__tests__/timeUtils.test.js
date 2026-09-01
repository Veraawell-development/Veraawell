const { parseTime } = require('../utils/timeUtils');

describe('timeUtils.parseTime', () => {
  test('parses AM times', () => {
    expect(parseTime('9:00 AM')).toEqual([9, 0]);
    expect(parseTime('12:00 AM')).toEqual([0, 0]); // midnight
  });

  test('parses PM times', () => {
    expect(parseTime('3:30 PM')).toEqual([15, 30]);
    expect(parseTime('12:00 PM')).toEqual([12, 0]); // noon stays 12
  });

  test('parses single-digit hours', () => {
    expect(parseTime('1:05 PM')).toEqual([13, 5]);
  });

  test('empty/undefined input returns [0, 0] rather than throwing', () => {
    expect(parseTime('')).toEqual([0, 0]);
    expect(parseTime(undefined)).toEqual([0, 0]);
  });
});
