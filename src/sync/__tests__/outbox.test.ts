import {
  EMPTY_OUTBOX,
  EPOCH,
  recordLocalChanges,
  ackOutbox,
  buildPushPayload,
  buildFullOutbox,
  mergeOutboxes,
  outboxSize,
  type Outbox,
} from '../outbox';
import type { Habit } from '../../types';

const T1 = '2026-09-24T10:00:00.000Z';
const T2 = '2026-09-24T10:05:00.000Z';

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    title: 'Read',
    category: 'reading',
    frequency: [true, true, true, true, true, false, false],
    targetDaysPerWeek: 5,
    currentStreak: 0,
    longestStreak: 0,
    completedToday: false,
    completionLog: {},
    createdAt: '2026-09-01',
    ...overrides,
  };
}

describe('recordLocalChanges', () => {
  test('records a newly added habit', () => {
    const out = recordLocalChanges(EMPTY_OUTBOX, [], [habit()], T1);
    expect(out.habits).toEqual({ h1: { at: T1, deleted: false } });
  });

  test('records an edit to a synced field', () => {
    const out = recordLocalChanges(EMPTY_OUTBOX, [habit()], [habit({ title: 'Read more' })], T1);
    expect(out.habits.h1).toEqual({ at: T1, deleted: false });
  });

  test('records a change to the schedule', () => {
    const next = habit({ frequency: [true, true, true, true, true, true, true] });
    expect(recordLocalChanges(EMPTY_OUTBOX, [habit()], [next], T1).habits.h1).toBeDefined();
  });

  test('ignores device-only fields: reminders, notification ids and derived streaks', () => {
    const next = habit({
      alarms: ['08:00'],
      queuedNotificationIds: { '2026-09-24': ['n1'] },
      queuedEodIds: { '2026-09-24': ['e1'] },
      currentStreak: 4,
      longestStreak: 9,
      completedToday: true,
    });
    // Same reference back: nothing to persist, nothing to push.
    expect(recordLocalChanges(EMPTY_OUTBOX, [habit()], [next], T1)).toBe(EMPTY_OUTBOX);
  });

  test('records a completion with its timestamp', () => {
    const next = habit({ completionLog: { '2026-09-24': T1 } });
    const out = recordLocalChanges(EMPTY_OUTBOX, [habit()], [next], T2);
    expect(out.completions.h1['2026-09-24']).toEqual({ done: true, at: T2, completedAt: T1 });
  });

  test('records an un-completion as a timestamped "not done", not a deletion', () => {
    const prev = habit({ completionLog: { '2026-09-24': T1 } });
    const out = recordLocalChanges(EMPTY_OUTBOX, [prev], [habit()], T2);
    expect(out.completions.h1['2026-09-24']).toEqual({ done: false, at: T2, completedAt: null });
  });

  test('keeps only the latest state when a day is toggled twice before syncing', () => {
    const done = habit({ completionLog: { '2026-09-24': T1 } });
    const once = recordLocalChanges(EMPTY_OUTBOX, [habit()], [done], T1);
    const twice = recordLocalChanges(once, [done], [habit()], T2);
    expect(twice.completions.h1['2026-09-24']).toEqual({ done: false, at: T2, completedAt: null });
    expect(outboxSize(twice)).toBe(1);
  });

  test('records a deletion and drops that habit\'s pending completions', () => {
    const done = habit({ completionLog: { '2026-09-24': T1 } });
    const withCompletion = recordLocalChanges(EMPTY_OUTBOX, [habit()], [done], T1);
    const out = recordLocalChanges(withCompletion, [done], [], T2);
    expect(out.habits.h1).toEqual({ at: T2, deleted: true });
    expect(out.completions.h1).toBeUndefined();
  });

  test('records a tombstone for every habit when progress is reset', () => {
    const out = recordLocalChanges(EMPTY_OUTBOX, [habit({ id: 'a' }), habit({ id: 'b' })], [], T1);
    expect(out.habits).toEqual({ a: { at: T1, deleted: true }, b: { at: T1, deleted: true } });
  });

  test('ignores log keys that are not real calendar dates', () => {
    const next = habit({ completionLog: { '2026-02-30': true } });
    expect(recordLocalChanges(EMPTY_OUTBOX, [habit()], [next], T1)).toBe(EMPTY_OUTBOX);
  });

  test('does not mutate its inputs', () => {
    const prev = [habit()];
    const next = [habit({ title: 'Changed', completionLog: { '2026-09-24': T1 } })];
    const snapshot = JSON.stringify([EMPTY_OUTBOX, prev, next]);
    recordLocalChanges(EMPTY_OUTBOX, prev, next, T2);
    expect(JSON.stringify([EMPTY_OUTBOX, prev, next])).toBe(snapshot);
  });
});

describe('ackOutbox', () => {
  test('removes exactly the entries that were sent', () => {
    const sent: Outbox = {
      habits: { h1: { at: T1, deleted: false } },
      completions: { h1: { '2026-09-24': { done: true, at: T1, completedAt: T1 } } },
    };
    expect(ackOutbox(sent, sent)).toEqual(EMPTY_OUTBOX);
  });

  test('keeps entries that changed again while the push was in flight', () => {
    const sent: Outbox = {
      habits: { h1: { at: T1, deleted: false } },
      completions: { h1: { '2026-09-24': { done: true, at: T1, completedAt: T1 } } },
    };
    const current: Outbox = {
      habits: { h1: { at: T2, deleted: false } },
      completions: { h1: { '2026-09-24': { done: false, at: T2, completedAt: null } } },
    };
    expect(ackOutbox(current, sent)).toEqual(current);
  });
});

describe('buildPushPayload', () => {
  test('sends current local fields for an edited habit and a tombstone for a deleted one', () => {
    const outbox: Outbox = {
      habits: { h1: { at: T1, deleted: false }, gone: { at: T2, deleted: true } },
      completions: {},
    };
    const payload = buildPushPayload(outbox, [habit({ description: 'Nightly' })]);

    expect(payload.habits).toEqual([
      {
        local_id: 'h1',
        title: 'Read',
        description: 'Nightly',
        category: 'reading',
        frequency: [true, true, true, true, true, false, false],
        target_days_per_week: 5,
        created_at: '2026-09-01',
        client_updated_at: T1,
      },
      { local_id: 'gone', deleted: true, client_updated_at: T2 },
    ]);
  });

  test('sends completions with done state and clock', () => {
    const outbox: Outbox = {
      habits: {},
      completions: {
        h1: {
          '2026-09-23': { done: true, at: T1, completedAt: T1 },
          '2026-09-24': { done: false, at: T2, completedAt: null },
        },
      },
    };
    expect(buildPushPayload(outbox, [habit()]).completions).toEqual([
      { local_id: 'h1', completed_on: '2026-09-23', done: true, completed_at: T1, client_updated_at: T1 },
      { local_id: 'h1', completed_on: '2026-09-24', done: false, completed_at: null, client_updated_at: T2 },
    ]);
  });

  test('drops a habit entry that can never be sent instead of retrying it forever', () => {
    const outbox: Outbox = {
      habits: { broken: { at: T1, deleted: false }, vanished: { at: T1, deleted: false } },
      completions: {},
    };
    const payload = buildPushPayload(outbox, [habit({ id: 'broken', frequency: [] })]);
    expect(payload.habits).toEqual([]);
    expect(payload.unsendable).toEqual(['broken', 'vanished']);
  });
});

describe('buildFullOutbox', () => {
  test('queues every habit and every completion for the first sync', () => {
    const out = buildFullOutbox(
      [habit({ completionLog: { '2026-09-23': T1, '2026-09-24': true, '2026-09-22': false } })],
      T2,
    );
    expect(out.habits).toEqual({ h1: { at: T2, deleted: false } });
    expect(out.completions.h1).toEqual({
      '2026-09-23': { done: true, at: T1, completedAt: T1 },
      // Legacy `true` has no time: the oldest possible clock, so any real
      // change made on another device wins over it.
      '2026-09-24': { done: true, at: EPOCH, completedAt: null },
    });
  });
});

describe('mergeOutboxes', () => {
  test('keeps the newer entry per key', () => {
    const older: Outbox = { habits: { h1: { at: T1, deleted: false } }, completions: {} };
    const newer: Outbox = { habits: { h1: { at: T2, deleted: true } }, completions: {} };
    expect(mergeOutboxes(older, newer).habits.h1).toEqual({ at: T2, deleted: true });
    expect(mergeOutboxes(newer, older).habits.h1).toEqual({ at: T2, deleted: true });
  });
});
