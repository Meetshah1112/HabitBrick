import { mergeRemote, type RemoteHabit, type RemoteCompletion } from '../mergeRemote';
import { EMPTY_OUTBOX, type Outbox } from '../outbox';
import type { Habit } from '../../types';

// Thursday 24 September 2026, local time.
const NOW = new Date(2026, 8, 24, 12, 0, 0);
const TODAY = '2026-09-24';
const T1 = '2026-09-24T10:00:00.000Z';
const T2 = '2026-09-24T10:05:00.000Z';
const T3 = '2026-09-24T10:10:00.000Z';
const EVERY_DAY = [true, true, true, true, true, true, true];

function local(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    title: 'Read',
    category: 'reading',
    frequency: EVERY_DAY,
    targetDaysPerWeek: 7,
    currentStreak: 0,
    longestStreak: 0,
    completedToday: false,
    completionLog: {},
    createdAt: '2026-09-01',
    ...overrides,
  };
}

function remote(overrides: Partial<RemoteHabit> = {}): RemoteHabit {
  return {
    local_id: 'h1',
    title: 'Read',
    description: null,
    category: 'reading',
    frequency: EVERY_DAY,
    target_days_per_week: 7,
    created_at: '2026-09-01',
    client_updated_at: T2,
    deleted_at: null,
    ...overrides,
  };
}

function done(day: string, clock: string, overrides: Partial<RemoteCompletion> = {}): RemoteCompletion {
  return { local_id: 'h1', completed_on: day, done: true, completed_at: clock, client_updated_at: clock, ...overrides };
}

const pendingHabit = (at: string, deleted = false): Outbox => ({
  habits: { h1: { at, deleted } },
  completions: {},
});

describe('mergeRemote: habits', () => {
  test('adds a habit created on another device, under the same id', () => {
    const result = mergeRemote([], { habits: [remote({ title: 'Stretch' })], completions: [] }, EMPTY_OUTBOX, NOW);

    expect(result.habits).toHaveLength(1);
    expect(result.habits[0]).toMatchObject({ id: 'h1', title: 'Stretch', completionLog: {}, currentStreak: 0 });
    expect(result.habits[0].alarms).toBeUndefined();
  });

  test('applies a remote edit when nothing is pending locally', () => {
    const result = mergeRemote([local()], { habits: [remote({ title: 'Read 20 pages' })], completions: [] }, EMPTY_OUTBOX, NOW);
    expect(result.habits[0].title).toBe('Read 20 pages');
  });

  test('keeps a pending local edit that is newer than the remote one', () => {
    const result = mergeRemote(
      [local({ title: 'Mine, newer' })],
      { habits: [remote({ title: 'Theirs', client_updated_at: T1 })], completions: [] },
      pendingHabit(T2),
      NOW,
    );
    expect(result.habits[0].title).toBe('Mine, newer');
  });

  test('takes a remote edit that is newer than the pending local one', () => {
    const result = mergeRemote(
      [local({ title: 'Mine, older' })],
      { habits: [remote({ title: 'Theirs, newer', client_updated_at: T3 })], completions: [] },
      pendingHabit(T2),
      NOW,
    );
    expect(result.habits[0].title).toBe('Theirs, newer');
  });

  test('compares clocks as times, not strings (server sends +00:00, the app writes Z)', () => {
    const result = mergeRemote(
      [local({ title: 'Mine at 10:00' })],
      { habits: [remote({ title: 'Theirs at 10:05', client_updated_at: '2026-09-24T10:05:00+00:00' })], completions: [] },
      pendingHabit('2026-09-24T10:00:00.000Z'),
      NOW,
    );
    expect(result.habits[0].title).toBe('Theirs at 10:05');
  });

  test('a remote deletion wins even over a newer pending local edit', () => {
    const doomed = local({ queuedNotificationIds: { [TODAY]: ['n1'] } });
    const result = mergeRemote(
      [doomed],
      { habits: [remote({ deleted_at: T1, client_updated_at: T1 })], completions: [] },
      pendingHabit(T3),
      NOW,
    );
    expect(result.habits).toEqual([]);
    // Reported with its device fields so the caller can cancel its reminders.
    expect(result.removed).toEqual([doomed]);
  });

  test('does not resurrect a habit the user just deleted on this device', () => {
    const result = mergeRemote([], { habits: [remote()], completions: [] }, pendingHabit(T1, true), NOW);
    expect(result.habits).toEqual([]);
  });

  test('keeps device-only fields when applying a remote edit', () => {
    const mine = local({ alarms: ['08:00'], queuedNotificationIds: { [TODAY]: ['n1'] } });
    const result = mergeRemote([mine], { habits: [remote({ title: 'Renamed' })], completions: [] }, EMPTY_OUTBOX, NOW);
    expect(result.habits[0]).toMatchObject({ title: 'Renamed', alarms: ['08:00'], queuedNotificationIds: { [TODAY]: ['n1'] } });
  });

  test('maps a category this app version does not know to custom instead of crashing', () => {
    const result = mergeRemote([], { habits: [remote({ category: 'underwaterBasketWeaving' })], completions: [] }, EMPTY_OUTBOX, NOW);
    expect(result.habits[0].category).toBe('custom');
  });

  test('skips a remote habit with an unusable schedule', () => {
    const result = mergeRemote([], { habits: [remote({ frequency: [true] as boolean[] })], completions: [] }, EMPTY_OUTBOX, NOW);
    expect(result.habits).toEqual([]);
  });
});

describe('mergeRemote: completions', () => {
  test('applies a remote completion, normalising its timestamp', () => {
    const result = mergeRemote(
      [local()],
      { habits: [], completions: [done('2026-09-23', '2026-09-23T07:30:00+00:00')] },
      EMPTY_OUTBOX,
      NOW,
    );
    expect(result.habits[0].completionLog).toEqual({ '2026-09-23': '2026-09-23T07:30:00.000Z' });
  });

  test('applies a remote un-completion by removing the day', () => {
    const result = mergeRemote(
      [local({ completionLog: { '2026-09-23': T1 } })],
      { habits: [], completions: [done('2026-09-23', T2, { done: false, completed_at: null })] },
      EMPTY_OUTBOX,
      NOW,
    );
    expect(result.habits[0].completionLog).toEqual({});
  });

  test('keeps a pending local un-completion newer than a remote completion', () => {
    const pending: Outbox = {
      habits: {},
      completions: { h1: { '2026-09-23': { done: false, at: T3, completedAt: null } } },
    };
    const result = mergeRemote([local()], { habits: [], completions: [done('2026-09-23', T2)] }, pending, NOW);
    expect(result.habits[0].completionLog).toEqual({});
  });

  test('takes a remote completion newer than a pending local un-completion', () => {
    const pending: Outbox = {
      habits: {},
      completions: { h1: { '2026-09-23': { done: false, at: T1, completedAt: null } } },
    };
    const result = mergeRemote([local()], { habits: [], completions: [done('2026-09-23', T2)] }, pending, NOW);
    expect(result.habits[0].completionLog['2026-09-23']).toBe(T2);
  });

  test('ignores completions for habits that are not on this device', () => {
    const result = mergeRemote([], { habits: [], completions: [done('2026-09-23', T1)] }, EMPTY_OUTBOX, NOW);
    expect(result.habits).toEqual([]);
  });

  test('applies completions for a habit that arrives in the same pull', () => {
    const result = mergeRemote([], { habits: [remote()], completions: [done('2026-09-23', T1)] }, EMPTY_OUTBOX, NOW);
    expect(Object.keys(result.habits[0].completionLog)).toEqual(['2026-09-23']);
  });

  test('ignores remote completions on impossible dates', () => {
    const result = mergeRemote([local()], { habits: [], completions: [done('2026-02-30', T1)] }, EMPTY_OUTBOX, NOW);
    expect(result.habits[0].completionLog).toEqual({});
  });
});

describe('mergeRemote: derived state', () => {
  test('recomputes today, the streak and the longest streak, and reports today changing', () => {
    const result = mergeRemote(
      [local({ currentStreak: 0, longestStreak: 0, completedToday: false })],
      {
        habits: [],
        completions: [done('2026-09-22', T1), done('2026-09-23', T1), done(TODAY, T2)],
      },
      EMPTY_OUTBOX,
      NOW,
    );
    expect(result.habits[0]).toMatchObject({ completedToday: true, currentStreak: 3, longestStreak: 3 });
    expect(result.todayChanged).toEqual([{ habitId: 'h1', done: true }]);
  });

  test('never lowers the longest streak', () => {
    const result = mergeRemote(
      [local({ longestStreak: 40, completionLog: { '2026-09-23': T1 } })],
      { habits: [], completions: [done('2026-09-23', T2, { done: false, completed_at: null })] },
      EMPTY_OUTBOX,
      NOW,
    );
    expect(result.habits[0].longestStreak).toBe(40);
  });

  test('reports no change and returns the same array for a no-op pull', () => {
    const habits = [local({ completionLog: { '2026-09-23': T1 }, currentStreak: 1, longestStreak: 1 })];
    const result = mergeRemote(habits, { habits: [remote({ client_updated_at: T1 })], completions: [done('2026-09-23', T1)] }, EMPTY_OUTBOX, NOW);
    expect(result.changed).toBe(false);
    expect(result.habits).toBe(habits);
  });

  test('does not mutate its inputs', () => {
    const habits = [local({ completionLog: { '2026-09-23': T1 } })];
    const incoming = { habits: [remote({ title: 'New' })], completions: [done('2026-09-22', T1)] };
    const snapshot = JSON.stringify([habits, incoming]);
    mergeRemote(habits, incoming, EMPTY_OUTBOX, NOW);
    expect(JSON.stringify([habits, incoming])).toBe(snapshot);
  });
});
