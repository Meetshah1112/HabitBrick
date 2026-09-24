/**
 * An in-memory "device" for sync tests: local habits + outbox + cursor, driven
 * by exactly the pure functions the app's reducers use (recordLocalChanges,
 * ackOutbox, mergeRemote). Shared by the jest suite and by the real-Postgres
 * two-device test in supabase/tests/sync.integration.test.mjs.
 */

import type { Habit } from '../../types';
import { EMPTY_OUTBOX, ackOutbox, recordLocalChanges, type Outbox } from '../outbox';
import { mergeRemote } from '../mergeRemote';
import type { SyncPort } from '../syncEngine';

export interface MemoryDevice {
  port: SyncPort;
  habits(): readonly Habit[];
  outbox(): Outbox;
  cursor(): string | null;
  /** A user action: transform the habit list and record it at `at`. */
  act(change: (habits: readonly Habit[]) => Habit[], at: string): void;
}

export function createMemoryDevice(initial: Habit[] = [], now: () => Date = () => new Date()): MemoryDevice {
  let habits: readonly Habit[] = initial;
  let outbox: Outbox = EMPTY_OUTBOX;
  let cursor: string | null = null;

  const device: MemoryDevice = {
    port: {
      getHabits: () => habits,
      getOutbox: () => outbox,
      getCursor: () => cursor,
      acknowledge: (sent) => {
        outbox = ackOutbox(outbox, sent);
      },
      applyPull: (pull) => {
        habits = mergeRemote(habits, pull, outbox, now()).habits;
        cursor = pull.serverTime;
      },
    },
    habits: () => habits,
    outbox: () => outbox,
    cursor: () => cursor,
    act: (change, at) => {
      const next = change(habits);
      outbox = recordLocalChanges(outbox, habits, next, at);
      habits = next;
    },
  };
  return device;
}

// ---- common user actions ---------------------------------------------------

export function addHabit(id: string, title: string, createdAt = '2026-09-01') {
  return (habits: readonly Habit[]): Habit[] => [
    ...habits,
    {
      id,
      title,
      category: 'reading',
      frequency: [true, true, true, true, true, true, true],
      targetDaysPerWeek: 7,
      currentStreak: 0,
      longestStreak: 0,
      completedToday: false,
      completionLog: {},
      createdAt,
    },
  ];
}

export function renameHabit(id: string, title: string) {
  return (habits: readonly Habit[]): Habit[] => habits.map((h) => (h.id === id ? { ...h, title } : h));
}

export function deleteHabit(id: string) {
  return (habits: readonly Habit[]): Habit[] => habits.filter((h) => h.id !== id);
}

export function complete(id: string, day: string, at: string) {
  return (habits: readonly Habit[]): Habit[] =>
    habits.map((h) => (h.id === id ? { ...h, completionLog: { ...h.completionLog, [day]: at } } : h));
}

export function uncomplete(id: string, day: string) {
  return (habits: readonly Habit[]): Habit[] =>
    habits.map((h) => {
      if (h.id !== id) return h;
      const { [day]: _removed, ...rest } = h.completionLog;
      return { ...h, completionLog: rest };
    });
}
