import { configureStore } from '@reduxjs/toolkit';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../lib/supabase', () => ({ supabase: null, isCloudEnabled: false }));
jest.mock('../../api/notificationService', () => ({
  fireCompletionNotification: jest.fn(async () => {}),
}));

import habitReducer, {
  addHabit,
  toggleHabit,
  editHabit,
  deleteHabit,
  resetProgress,
  loadData,
  applyRemoteChanges,
} from '../habitSlice';
import authReducer from '../authSlice';
import syncReducer, { loadSyncState } from '../syncSlice';
import { syncListener } from '../syncListener';
import { EMPTY_OUTBOX } from '../../sync/outbox';
import type { Habit } from '../../types';

function makeStore() {
  return configureStore({
    reducer: { habits: habitReducer, auth: authReducer, sync: syncReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }).prepend(syncListener.middleware),
  });
}

type TestStore = ReturnType<typeof makeStore>;

function habit(id: string, overrides: Partial<Habit> = {}): Habit {
  return {
    id,
    title: id,
    category: 'reading',
    frequency: [true, true, true, true, true, true, true],
    targetDaysPerWeek: 7,
    currentStreak: 0,
    longestStreak: 0,
    completedToday: false,
    completionLog: {},
    createdAt: '2026-09-01',
    ...overrides,
  };
}

function boot(store: TestStore, { claimed, habits = [] }: { claimed: boolean; habits?: Habit[] }) {
  store.dispatch(loadData.fulfilled({ habits, badges: [] }, 'boot'));
  store.dispatch(
    loadSyncState.fulfilled(
      { claimOwner: claimed ? 'alice' : null, lastSyncedAt: null, outbox: EMPTY_OUTBOX, cursor: null },
      'boot',
    ),
  );
}

const outboxOf = (store: TestStore) => store.getState().sync.outbox;

describe('syncListener', () => {
  test('records nothing on a device no account has claimed (local-only users)', () => {
    const store = makeStore();
    boot(store, { claimed: false, habits: [habit('h1')] });

    store.dispatch(toggleHabit('h1'));
    store.dispatch(addHabit({ title: 'New', category: 'reading', frequency: habit('x').frequency, targetDaysPerWeek: 7 }));

    expect(outboxOf(store)).toEqual(EMPTY_OUTBOX);
  });

  test('never records the boot load, even on a claimed device', () => {
    const store = makeStore();
    store.dispatch(
      loadSyncState.fulfilled({ claimOwner: 'alice', lastSyncedAt: null, outbox: EMPTY_OUTBOX, cursor: null }, 'b'),
    );
    store.dispatch(loadData.fulfilled({ habits: [habit('h1'), habit('h2')], badges: [] }, 'b'));

    expect(outboxOf(store)).toEqual(EMPTY_OUTBOX);
  });

  test('records nothing before the stored outbox has been loaded', () => {
    const store = makeStore();
    store.dispatch(loadData.fulfilled({ habits: [habit('h1')], badges: [] }, 'b'));
    store.dispatch(toggleHabit('h1'));
    expect(outboxOf(store)).toEqual(EMPTY_OUTBOX);
  });

  test('records a completion from a real toggle', () => {
    const store = makeStore();
    boot(store, { claimed: true, habits: [habit('h1')] });

    store.dispatch(toggleHabit('h1'));

    const days = outboxOf(store).completions.h1;
    expect(Object.values(days)).toEqual([expect.objectContaining({ done: true })]);
  });

  test('records a new habit and a deletion', () => {
    const store = makeStore();
    boot(store, { claimed: true, habits: [habit('h1')] });

    store.dispatch(addHabit({ title: 'New', category: 'reading', frequency: habit('x').frequency, targetDaysPerWeek: 7 }));
    store.dispatch(deleteHabit('h1'));

    const { habits } = outboxOf(store);
    const added = store.getState().habits.habits[0].id;
    expect(habits[added]).toMatchObject({ deleted: false });
    expect(habits.h1).toMatchObject({ deleted: true });
  });

  test('ignores device-only edits such as reminder bookkeeping', () => {
    const store = makeStore();
    boot(store, { claimed: true, habits: [habit('h1')] });

    store.dispatch(editHabit({ id: 'h1', updates: { queuedNotificationIds: { '2026-09-24': ['n1'] } } }));

    expect(outboxOf(store)).toEqual(EMPTY_OUTBOX);
  });

  test('never echoes a merge from the server back into the outbox', () => {
    const store = makeStore();
    boot(store, { claimed: true, habits: [habit('h1')] });

    store.dispatch(applyRemoteChanges({ habits: [habit('h1', { title: 'Renamed elsewhere' }), habit('h2')] }));

    expect(store.getState().habits.habits.map((h) => h.title)).toEqual(['Renamed elsewhere', 'h2']);
    expect(outboxOf(store)).toEqual(EMPTY_OUTBOX);
  });

  test('queues a deletion for every habit when progress is reset on a claimed device', () => {
    const store = makeStore();
    boot(store, { claimed: true, habits: [habit('h1'), habit('h2')] });

    store.dispatch(resetProgress());

    expect(outboxOf(store).habits).toEqual({
      h1: expect.objectContaining({ deleted: true }),
      h2: expect.objectContaining({ deleted: true }),
    });
  });
});
