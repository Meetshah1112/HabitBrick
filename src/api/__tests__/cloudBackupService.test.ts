import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Habit } from '../../types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Only its presence matters: every write now goes through the sync engine.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const mockSession = { userId: 'alice' as string | null };
jest.mock('../authService', () => ({
  getCurrentUserId: async () => mockSession.userId,
}));

import {
  claimDevice,
  checkSyncAccess,
  evaluateBackup,
  readClaim,
  recordSyncResult,
  CLAIM_KEY,
} from '../cloudBackupService';

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
  mockSession.userId = 'alice';
});

describe('claimDevice safety rules', () => {
  test('refuses the first claim without consent and records nothing', async () => {
    const result = await claimDevice({ userId: 'alice', habits: HABITS, consent: false });

    expect(result).toMatchObject({ ok: false, refusal: 'needsConsent' });
    expect(await readClaim()).toBeNull();
  });

  test('never lets a second account take over a claimed device', async () => {
    await claimDevice({ userId: 'alice', habits: HABITS, consent: true });
    mockSession.userId = 'bob'; // shared phone: Bob signs in afterwards

    const result = await claimDevice({ userId: 'bob', habits: HABITS, consent: true });

    expect(result).toMatchObject({ ok: false, refusal: 'otherOwner' });
    expect((await readClaim())?.ownerUserId).toBe('alice');
  });

  test('refuses when the live session is not the requested account', async () => {
    mockSession.userId = 'bob';
    const result = await claimDevice({ userId: 'alice', habits: HABITS, consent: true });
    expect(result).toMatchObject({ ok: false, refusal: 'sessionChanged' });
  });
});

describe('claimDevice', () => {
  test('records consent and queues everything on the device for the first sync', async () => {
    const result = await claimDevice({ userId: 'alice', habits: HABITS, consent: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await readClaim()).toMatchObject({ ownerUserId: 'alice', lastUpload: null });
    expect(Object.keys(result.fullOutbox.habits)).toEqual(['h1']);
    expect(Object.keys(result.fullOutbox.completions.h1).sort()).toEqual(['2026-05-02', '2026-05-03']);
  });

  test('lets the owner re-claim without asking again (a retry after a failed sync)', async () => {
    await claimDevice({ userId: 'alice', habits: HABITS, consent: true });
    const retry = await claimDevice({ userId: 'alice', habits: HABITS, consent: false });
    expect(retry.ok).toBe(true);
  });

  test('never modifies the local habits', async () => {
    const snapshot = JSON.stringify(HABITS);
    await claimDevice({ userId: 'alice', habits: HABITS, consent: true });
    expect(JSON.stringify(HABITS)).toBe(snapshot);
  });
});

describe('checkSyncAccess', () => {
  test('allows the owner', async () => {
    await claimDevice({ userId: 'alice', habits: HABITS, consent: true });
    expect(await checkSyncAccess('alice')).toBeNull();
  });

  test('refuses an unclaimed device, another owner, and a changed session', async () => {
    expect(await checkSyncAccess('alice')).toBe('needsConsent');

    await claimDevice({ userId: 'alice', habits: HABITS, consent: true });
    mockSession.userId = 'bob';
    expect(await checkSyncAccess('bob')).toBe('otherOwner');
    expect(await checkSyncAccess('alice')).toBe('sessionChanged');
  });
});

describe('evaluateBackup', () => {
  test('asks for consent when unclaimed habits exist', async () => {
    expect((await evaluateBackup('alice', HABITS)).decision).toBe('needsConsent');
    expect(await readClaim()).toBeNull();
  });

  test('claims an empty device on the spot, so the account can be restored onto it', async () => {
    const { decision } = await evaluateBackup('alice', []);

    expect(decision).toBe('resumeUpload');
    expect((await readClaim())?.ownerUserId).toBe('alice');
  });

  test('reads a corrupt claim record as unclaimed, which forces consent again', async () => {
    await AsyncStorage.setItem(CLAIM_KEY, '{not json');
    expect((await evaluateBackup('alice', HABITS)).decision).toBe('needsConsent');
  });
});

describe('recordSyncResult', () => {
  test('remembers the outcome for the owner only', async () => {
    await claimDevice({ userId: 'alice', habits: HABITS, consent: true });

    await recordSyncResult('bob', { ok: true, habits: 9, completions: 9 });
    expect((await readClaim())?.lastUpload).toBeNull();

    await recordSyncResult('alice', { ok: true, habits: 1, completions: 2 });
    expect((await readClaim())?.lastUpload).toMatchObject({ status: 'complete', habits: 1, completions: 2 });
  });
});
