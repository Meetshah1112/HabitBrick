import { calculateStreak, calculateLongestStreak, isCalendarDate } from '../streaks';

// Thursday 24 September 2026, local time. Mon 21, Tue 22, Wed 23; Fri 18,
// Sat 19, Sun 20.
const NOW = new Date(2026, 8, 24, 12, 0, 0);
const EVERY_DAY = [true, true, true, true, true, true, true];
const WEEKDAYS = [true, true, true, true, true, false, false];
const WEEKENDS = [false, false, false, false, false, true, true];

describe('isCalendarDate', () => {
  test('accepts real days and rejects impossible or malformed ones', () => {
    expect(isCalendarDate('2026-09-24')).toBe(true);
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-9-24')).toBe(false);
    expect(isCalendarDate('garbage')).toBe(false);
  });
});

describe('calculateStreak (moved from habitSlice, behaviour unchanged)', () => {
  test('does not break the streak on a not-yet-completed today', () => {
    expect(calculateStreak({ '2026-09-22': true, '2026-09-23': true }, EVERY_DAY, NOW)).toBe(2);
  });

  test('counts today once completed', () => {
    const log = { '2026-09-22': true, '2026-09-23': true, '2026-09-24': true };
    expect(calculateStreak(log, EVERY_DAY, NOW)).toBe(3);
  });

  test('breaks on a missed scheduled day', () => {
    expect(calculateStreak({ '2026-09-23': true }, EVERY_DAY, NOW)).toBe(1);
  });

  test('skips unscheduled days without breaking', () => {
    // Fri 18, then the weekend (unscheduled), then Mon-Wed.
    const log = { '2026-09-18': true, '2026-09-21': true, '2026-09-22': true, '2026-09-23': true };
    expect(calculateStreak(log, WEEKDAYS, NOW)).toBe(4);
  });
});

describe('calculateLongestStreak', () => {
  test('is 0 with no completions', () => {
    expect(calculateLongestStreak({}, EVERY_DAY, NOW)).toBe(0);
  });

  test('finds the longest run even when it is not the current one', () => {
    const log = {
      '2026-09-14': true, '2026-09-15': true, '2026-09-16': true, // run of 3
      // 17th missed
      '2026-09-18': true, '2026-09-19': true, // run of 2
    };
    expect(calculateLongestStreak(log, EVERY_DAY, NOW)).toBe(3);
  });

  test('does not let unscheduled days break a run', () => {
    expect(calculateLongestStreak({ '2026-09-18': true, '2026-09-21': true }, WEEKDAYS, NOW)).toBe(2);
  });

  test('counts a completed today even on an unscheduled day, like calculateStreak', () => {
    const log = { '2026-09-19': true, '2026-09-20': true, '2026-09-24': true };
    expect(calculateLongestStreak(log, WEEKENDS, NOW)).toBe(3);
    expect(calculateStreak(log, WEEKENDS, NOW)).toBe(3);
  });

  test('ignores falsy entries, impossible dates and future dates', () => {
    const log = {
      '2026-09-22': false,
      '2026-02-30': true,
      '2026-12-01': true,
      '2026-09-23': true,
    };
    expect(calculateLongestStreak(log, EVERY_DAY, NOW)).toBe(1);
  });

  test('accepts ISO timestamp values as completions', () => {
    const log = { '2026-09-22': '2026-09-22T07:00:00.000Z', '2026-09-23': true };
    expect(calculateLongestStreak(log, EVERY_DAY, NOW)).toBe(2);
  });
});
