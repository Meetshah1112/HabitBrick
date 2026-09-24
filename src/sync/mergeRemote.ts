/**
 * Apply what the server returned to this device's habits.
 *
 * Sync pushes before it pulls, so by the time this runs the server already
 * holds the resolved, last-writer-wins value for every key this device sent.
 * The server is therefore authoritative for everything except entries still
 * in the outbox — changes made while the sync was in flight. For those, the
 * newer clock wins, using the same strict "newer beats older, ties keep the
 * server" rule as sync_push, so every device converges to the same state.
 *
 * Rules:
 *   - a remote deletion always removes the habit (deletions are final)
 *   - a pending local deletion is never undone by a remote copy
 *   - device-only fields (alarms, notification ids) are never touched
 *   - streaks and completedToday are recomputed from the merged log;
 *     longestStreak never goes down
 *
 * Pure: no I/O and no React Native imports.
 */

import { CATEGORY_CONFIG, type Habit, type HabitCategory } from '../types';
import { calculateLongestStreak, calculateStreak, getLocalDateStr, isCalendarDate } from '../utils/streaks';
import { clockValue, type Outbox } from './outbox';

export interface RemoteHabit {
  local_id: string;
  title: string;
  description: string | null;
  category: string;
  frequency: boolean[];
  target_days_per_week: number;
  created_at: string;
  client_updated_at: string;
  deleted_at: string | null;
}

export interface RemoteCompletion {
  local_id: string;
  completed_on: string;
  done: boolean;
  completed_at: string | null;
  client_updated_at: string;
}

export interface MergeResult {
  habits: Habit[];
  /** Local habits removed by a remote deletion, with their device fields, for reminder cleanup. */
  removed: Habit[];
  /** Habits whose "done today" flipped, so the caller can silence or restore reminders. */
  todayChanged: { habitId: string; done: boolean }[];
  changed: boolean;
}

function toCategory(value: string): HabitCategory {
  return Object.prototype.hasOwnProperty.call(CATEGORY_CONFIG, value)
    ? (value as HabitCategory)
    : 'custom';
}

function isValidRemoteHabit(remote: RemoteHabit): boolean {
  return (
    typeof remote.local_id === 'string' &&
    remote.local_id.length > 0 &&
    typeof remote.title === 'string' &&
    Array.isArray(remote.frequency) &&
    remote.frequency.length === 7 &&
    remote.frequency.every((day) => typeof day === 'boolean') &&
    isCalendarDate(remote.created_at)
  );
}

function withRemoteFields(base: Habit, remote: RemoteHabit): Habit {
  return {
    ...base,
    title: remote.title,
    description: remote.description ?? undefined,
    category: toCategory(remote.category),
    frequency: [...remote.frequency],
    targetDaysPerWeek: remote.target_days_per_week,
    createdAt: remote.created_at,
  };
}

function newHabitFrom(remote: RemoteHabit): Habit {
  return withRemoteFields(
    {
      id: remote.local_id,
      title: remote.title,
      category: 'custom',
      frequency: [],
      targetDaysPerWeek: 0,
      currentStreak: 0,
      longestStreak: 0,
      completedToday: false,
      completionLog: {},
      createdAt: remote.created_at,
    },
    remote,
  );
}

function sameSyncedFields(a: Habit, b: Habit): boolean {
  return (
    a.title === b.title &&
    (a.description ?? null) === (b.description ?? null) &&
    a.category === b.category &&
    a.targetDaysPerWeek === b.targetDaysPerWeek &&
    a.createdAt === b.createdAt &&
    a.frequency.length === b.frequency.length &&
    a.frequency.every((day, i) => day === b.frequency[i])
  );
}

function normaliseTimestamp(value: string | null): string | true {
  if (!value) return true;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? true : new Date(parsed).toISOString();
}

export function mergeRemote(
  local: readonly Habit[],
  remote: { habits: readonly RemoteHabit[]; completions: readonly RemoteCompletion[] },
  pending: Outbox,
  now: Date = new Date(),
): MergeResult {
  const byId = new Map<string, Habit>(local.map((h) => [h.id, h]));
  const order = local.map((h) => h.id);
  const removed: Habit[] = [];
  const touched = new Set<string>();

  // 1. Habit definitions.
  for (const incoming of remote.habits) {
    const id = incoming.local_id;
    const existing = byId.get(id);

    if (incoming.deleted_at) {
      if (existing) {
        removed.push(existing);
        byId.delete(id);
      }
      continue;
    }
    if (!isValidRemoteHabit(incoming)) continue;

    const pendingEntry = pending.habits[id];
    if (!existing) {
      if (pendingEntry?.deleted) continue; // our deletion is on its way up
      byId.set(id, newHabitFrom(incoming));
      order.push(id);
      touched.add(id);
      continue;
    }

    const localIsNewer =
      pendingEntry && clockValue(pendingEntry.at) > clockValue(incoming.client_updated_at);
    if (localIsNewer) continue;

    const updated = withRemoteFields(existing, incoming);
    if (!sameSyncedFields(existing, updated)) {
      byId.set(id, updated);
      touched.add(id);
    }
  }

  // 2. Completions, for habits that exist after step 1.
  const logs = new Map<string, Habit['completionLog']>();
  for (const incoming of remote.completions) {
    const id = incoming.local_id;
    const habit = byId.get(id);
    if (!habit || !isCalendarDate(incoming.completed_on)) continue;

    const pendingEntry = pending.completions[id]?.[incoming.completed_on];
    if (pendingEntry && clockValue(pendingEntry.at) > clockValue(incoming.client_updated_at)) continue;

    const log = logs.get(id) ?? { ...habit.completionLog };
    const day = incoming.completed_on;
    if (incoming.done) {
      const value = normaliseTimestamp(incoming.completed_at);
      if (log[day] === value) continue;
      log[day] = value;
    } else {
      if (!(day in log)) continue;
      delete log[day];
    }
    logs.set(id, log);
    touched.add(id);
  }

  // 3. Recompute derived state for everything that changed.
  const todayStr = getLocalDateStr(now);
  const todayChanged: MergeResult['todayChanged'] = [];
  for (const id of touched) {
    const habit = byId.get(id);
    if (!habit) continue;
    const completionLog = logs.get(id) ?? habit.completionLog;
    const currentStreak = calculateStreak(completionLog, habit.frequency, now);
    const completedToday = Boolean(completionLog[todayStr]);
    const longestStreak = Math.max(
      habit.longestStreak,
      currentStreak,
      calculateLongestStreak(completionLog, habit.frequency, now),
    );

    const previous = local.find((h) => h.id === id);
    if (previous && previous.completedToday !== completedToday) {
      todayChanged.push({ habitId: id, done: completedToday });
    }
    byId.set(id, { ...habit, completionLog, currentStreak, completedToday, longestStreak });
  }

  const changed = touched.size > 0 || removed.length > 0;
  if (!changed) return { habits: local as Habit[], removed, todayChanged, changed };

  const habits = order.filter((id) => byId.has(id)).map((id) => byId.get(id) as Habit);
  return { habits, removed, todayChanged, changed };
}
