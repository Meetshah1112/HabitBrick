import { buildBackupPlan } from '../backupPlan';
import type { Habit } from '../../types';

const USER = '11111111-1111-1111-1111-111111111111';

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'loc1',
    title: 'Read',
    category: 'reading',
    frequency: [true, true, true, true, true, false, false],
    targetDaysPerWeek: 5,
    currentStreak: 0,
    longestStreak: 0,
    completedToday: false,
    completionLog: {},
    createdAt: '2026-05-01',
    ...overrides,
  };
}

describe('buildBackupPlan', () => {
  test('maps a habit to a row owned by the signed-in user', () => {
    const plan = buildBackupPlan(USER, [habit({ description: 'Before bed' })]);

    expect(plan.habitRows).toEqual([
      {
        user_id: USER,
        local_id: 'loc1',
        title: 'Read',
        description: 'Before bed',
        category: 'reading',
        frequency: [true, true, true, true, true, false, false],
        target_days_per_week: 5,
        created_at: '2026-05-01',
      },
    ]);
  });

  test('maps a missing description to null', () => {
    const plan = buildBackupPlan(USER, [habit()]);
    expect(plan.habitRows[0].description).toBeNull();
  });

  test('expands only truthy completion entries, keeping real timestamps', () => {
    const plan = buildBackupPlan(USER, [
      habit({
        completionLog: {
          '2026-05-02': '2026-05-02T08:15:00.000Z',
          '2026-05-03': true, // legacy boolean entry
          '2026-05-04': false, // un-completed day: not a brick
        },
      }),
    ]);

    expect(plan.completionsByLocalId.loc1).toEqual([
      { completed_on: '2026-05-02', completed_at: '2026-05-02T08:15:00.000Z' },
      { completed_on: '2026-05-03', completed_at: null },
    ]);
  });

  test('skips completion keys that are not real calendar dates', () => {
    // Postgres rejects the whole INSERT over one bad date, so one malformed
    // key must not be allowed to sink a user's entire backup.
    const plan = buildBackupPlan(USER, [
      habit({ completionLog: { '2026-02-30': true, garbage: true, '2026-05-05': true } }),
    ]);

    expect(plan.completionsByLocalId.loc1).toEqual([
      { completed_on: '2026-05-05', completed_at: null },
    ]);
    expect(plan.skippedCompletionEntries).toBe(2);
  });

  test('keeps the day but drops an unparseable completion timestamp', () => {
    const plan = buildBackupPlan(USER, [habit({ completionLog: { '2026-05-06': 'not-a-date' } })]);
    expect(plan.completionsByLocalId.loc1).toEqual([
      { completed_on: '2026-05-06', completed_at: null },
    ]);
  });

  test('skips a habit whose frequency is not seven booleans', () => {
    const plan = buildBackupPlan(USER, [
      habit({ id: 'bad', frequency: [true, false] }),
      habit({ id: 'good' }),
    ]);

    expect(plan.habitRows.map((r) => r.local_id)).toEqual(['good']);
    expect(plan.skippedHabits).toEqual([{ localId: 'bad', reason: 'invalid frequency' }]);
  });

  test('accepts a legacy ISO datetime createdAt', () => {
    const plan = buildBackupPlan(USER, [habit({ createdAt: '2026-05-01T10:00:00.000Z' })]);
    expect(plan.habitRows[0].created_at).toBe('2026-05-01');
  });

  test('skips a habit with an unusable createdAt', () => {
    const plan = buildBackupPlan(USER, [habit({ createdAt: 'someday' })]);
    expect(plan.habitRows).toEqual([]);
    expect(plan.skippedHabits).toEqual([{ localId: 'loc1', reason: 'invalid createdAt' }]);
  });

  test('derives target days from frequency when the stored value is invalid', () => {
    const plan = buildBackupPlan(USER, [
      habit({ id: 'nan', targetDaysPerWeek: Number.NaN }),
      habit({ id: 'high', targetDaysPerWeek: 9 }),
    ]);
    expect(plan.habitRows.map((r) => r.target_days_per_week)).toEqual([5, 5]);
  });

  test('keeps the first of two habits sharing a local id', () => {
    // Two rows with the same (user_id, local_id) in one upsert make Postgres
    // fail the whole statement ("cannot affect row a second time").
    const plan = buildBackupPlan(USER, [
      habit({ id: 'dup', title: 'First' }),
      habit({ id: 'dup', title: 'Second' }),
    ]);

    expect(plan.habitRows.map((r) => r.title)).toEqual(['First']);
    expect(plan.skippedHabits).toEqual([{ localId: 'dup', reason: 'duplicate local id' }]);
  });

  test('counts uploadable habits and completions for the consent screen', () => {
    const plan = buildBackupPlan(USER, [
      habit({ id: 'a', completionLog: { '2026-05-02': true, '2026-05-03': true } }),
      habit({ id: 'b', completionLog: { '2026-05-02': true } }),
      habit({ id: 'c', frequency: [] }),
    ]);

    expect(plan.habitCount).toBe(2);
    expect(plan.completionCount).toBe(3);
  });

  test('does not mutate the input habits', () => {
    const input = [habit({ completionLog: { '2026-05-02': true, 'bad-key': true } })];
    const snapshot = JSON.stringify(input);

    buildBackupPlan(USER, input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
