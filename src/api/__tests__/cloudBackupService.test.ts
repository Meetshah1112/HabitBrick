import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Habit } from '../../types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Records every write the service makes, and can simulate a server failure.
const mockServer = {
  calls: [] as { table: string; rows: any[]; options: any }[],
  failWith: null as string | null,
};

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from(table: string) {
      return {
        upsert(rows: any[], options: any) {
          mockServer.calls.push({ table, rows, options });
          const response = mockServer.failWith
            ? { data: null, error: { message: mockServer.failWith } }
            : {
                data: table === 'habits'
                  ? rows.map((r) => ({ id: `srv-${r.local_id}`, local_id: r.local_id }))
                  : null,
                error: null,
              };
          const pending: any = Promise.resolve(response);
          pending.select = () => Promise.resolve(response);
          return pending;
        },
      };
    },
  },
}));

const mockSession = { userId: 'alice' as string | null };
jest.mock('../authService', () => ({
  getCurrentUserId: async () => mockSession.userId,
}));

import { backUpThisDevice, evaluateBackup, readClaim } from '../cloudBackupService';

function habit(id: string, log: Habit['completionLog'] = {}): Habit {
  return {
    id,
    title: `Habit ${id}`,
    category: 'reading',
    frequency: [true, true, true, true, true, true, true],
    targetDaysPerWeek: 7,
    currentStreak: 0,
    longestStreak: 0,
    completedToday: false,
    completionLog: log,
    createdAt: '2026-05-01',
  };
}

const HABITS = [habit('h1', { '2026-05-02': true, '2026-05-03': '2026-05-03T09:00:00.000Z' })];

beforeEach(async () => {
  await AsyncStorage.clear();
  mockServer.calls = [];
  mockServer.failWith = null;
  mockSession.userId = 'alice';
});

describe('backUpThisDevice safety rules', () => {
  test('refuses the first upload without consent and sends nothing', async () => {
    const result = await backUpThisDevice({ userId: 'alice', habits: HABITS, consent: false });

    expect(result).toMatchObject({ ok: false, refusal: 'needsConsent' });
    expect(mockServer.calls).toHaveLength(0);
    expect(await readClaim()).toBeNull();
  });

  test('never uploads a device claimed by another account', async () => {
    await backUpThisDevice({ userId: 'alice', habits: HABITS, consent: true });
    mockServer.calls = [];
    mockSession.userId = 'bob'; // shared phone: Bob signs in afterwards

    const result = await backUpThisDevice({ userId: 'bob', habits: HABITS, consent: true });

    expect(result).toMatchObject({ ok: false, refusal: 'otherOwner' });
    expect(mockServer.calls).toHaveLength(0);
    expect((await readClaim())?.ownerUserId).toBe('alice');
  });

  test('refuses when the live session is not the requested account', async () => {
    mockSession.userId = 'bob';

    const result = await backUpThisDevice({ userId: 'alice', habits: HABITS, consent: true });

    expect(result).toMatchObject({ ok: false, refusal: 'sessionChanged' });
    expect(mockServer.calls).toHaveLength(0);
  });
});

describe('backUpThisDevice upload', () => {
  test('sends the upserts verified against Postgres, attached to server ids', async () => {
    const result = await backUpThisDevice({ userId: 'alice', habits: HABITS, consent: true });

    expect(result.ok).toBe(true);
    const [habitsCall, completionsCall] = mockServer.calls;
    expect(habitsCall.table).toBe('habits');
    expect(habitsCall.options).toEqual({ onConflict: 'user_id,local_id' });
    expect(habitsCall.rows[0]).toMatchObject({ user_id: 'alice', local_id: 'h1' });
    expect(completionsCall.table).toBe('habit_completions');
    expect(completionsCall.options).toEqual({ onConflict: 'habit_id,completed_on', ignoreDuplicates: true });
    expect(completionsCall.rows).toEqual([
      { user_id: 'alice', habit_id: 'srv-h1', completed_on: '2026-05-02', completed_at: null },
      { user_id: 'alice', habit_id: 'srv-h1', completed_on: '2026-05-03', completed_at: '2026-05-03T09:00:00.000Z' },
    ]);
  });

  test('records a completed claim with what was uploaded', async () => {
    await backUpThisDevice({ userId: 'alice', habits: HABITS, consent: true });

    expect(await readClaim()).toMatchObject({
      ownerUserId: 'alice',
      lastUpload: { status: 'complete', habits: 1, completions: 2 },
    });
  });

  test('keeps consent after a failure so the retry does not ask again', async () => {
    mockServer.failWith = 'TypeError: Failed to fetch';

    const failed = await backUpThisDevice({ userId: 'alice', habits: HABITS, consent: true });

    expect(failed).toMatchObject({
      ok: false,
      error: 'No connection. Your habits are safe on this phone, and backup will retry.',
    });
    expect(await readClaim()).toMatchObject({ ownerUserId: 'alice', lastUpload: { status: 'failed' } });

    mockServer.failWith = null;
    const retried = await backUpThisDevice({ userId: 'alice', habits: HABITS, consent: false });
    expect(retried.ok).toBe(true);
  });

  test('never modifies the local habits it uploads', async () => {
    const snapshot = JSON.stringify(HABITS);
    await backUpThisDevice({ userId: 'alice', habits: HABITS, consent: true });
    expect(JSON.stringify(HABITS)).toBe(snapshot);
  });

  test('shares one upload between concurrent calls for the same account', async () => {
    const [a, b] = await Promise.all([
      backUpThisDevice({ userId: 'alice', habits: HABITS, consent: true }),
      backUpThisDevice({ userId: 'alice', habits: HABITS, consent: true }),
    ]);

    expect(a).toBe(b);
    expect(mockServer.calls.filter((c) => c.table === 'habits')).toHaveLength(1);
  });
});

describe('evaluateBackup', () => {
  test('asks for consent when unclaimed habits exist', async () => {
    expect((await evaluateBackup('alice', HABITS)).decision).toBe('needsConsent');
    expect(await readClaim()).toBeNull();
  });

  test('claims an empty device for the account without prompting', async () => {
    const { decision } = await evaluateBackup('alice', []);

    expect(decision).toBe('upToDate');
    expect((await readClaim())?.ownerUserId).toBe('alice');
  });

  test('reads a corrupt claim record as unclaimed, which forces consent again', async () => {
    await AsyncStorage.setItem('@atomicstep/cloudClaim', '{not json');
    expect((await evaluateBackup('alice', HABITS)).decision).toBe('needsConsent');
  });
});
