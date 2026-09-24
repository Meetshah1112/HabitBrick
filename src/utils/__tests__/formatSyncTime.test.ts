import { formatSyncTime } from '../formatSyncTime';

const NOW = new Date(2026, 8, 24, 12, 0, 0);
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe('formatSyncTime', () => {
  test('says "just now" within the first minute', () => {
    expect(formatSyncTime(minutesAgo(0), NOW)).toBe('just now');
  });

  test('treats a slightly future timestamp (clock skew) as just now', () => {
    expect(formatSyncTime(minutesAgo(-2), NOW)).toBe('just now');
  });

  test('counts minutes within the hour', () => {
    expect(formatSyncTime(minutesAgo(5), NOW)).toBe('5 min ago');
  });

  test('shows the time for earlier today', () => {
    expect(formatSyncTime(new Date(2026, 8, 24, 9, 5).toISOString(), NOW)).toBe('today at 09:05');
  });

  test('shows a date for earlier days', () => {
    const text = formatSyncTime(new Date(2026, 8, 20, 9, 5).toISOString(), NOW);
    expect(text).not.toMatch(/ago|today/);
    expect(text).toMatch(/2026/);
  });

  test('never throws on a bad timestamp', () => {
    expect(formatSyncTime('not-a-date', NOW)).toBe('recently');
  });
});
