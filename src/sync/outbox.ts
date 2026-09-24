/**
 * Sync outbox — local changes not yet accepted by the server.
 *
 * Keyed, so it only ever holds the LATEST state per habit and per habit-day:
 * toggling a day ten times offline queues one entry, not ten. Each entry
 * carries the client clock of the user's action, which the server uses for
 * last-writer-wins (see supabase/migrations/0006_two_way_sync.sql).
 *
 * Pure: no I/O and no React Native imports (also run under plain Node by
 * supabase/tests/sync.integration.test.mjs).
 */

import type { Habit } from '../types';
import { isCalendarDate } from '../utils/streaks';
import { toCompletedAt, validateSyncedHabit, type SyncedHabitFields } from '../utils/backupPlan';

export interface HabitOutboxEntry {
  at: string;
  deleted: boolean;
}

export interface CompletionOutboxEntry {
  done: boolean;
  at: string;
  /** ISO time the habit was done; null for un-completions and legacy entries. */
  completedAt: string | null;
}

export interface Outbox {
  habits: Record<string, HabitOutboxEntry>;
  completions: Record<string, Record<string, CompletionOutboxEntry>>;
}

export const EMPTY_OUTBOX: Outbox = Object.freeze({ habits: {}, completions: {} }) as Outbox;

/** The oldest possible clock: loses to any real change made anywhere. */
export const EPOCH = '1970-01-01T00:00:00.000Z';

/** Compare as instants: the server sends +00:00, the app writes Z. */
export function clockValue(iso: string | null | undefined): number {
  const value = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

export function outboxSize(outbox: Outbox): number {
  let size = Object.keys(outbox.habits).length;
  for (const days of Object.values(outbox.completions)) size += Object.keys(days).length;
  return size;
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/** Only these fields sync. Reminders, notification ids and streaks are device-local. */
function syncedFieldsDiffer(a: Habit, b: Habit): boolean {
  return (
    a.title !== b.title ||
    (a.description ?? null) !== (b.description ?? null) ||
    a.category !== b.category ||
    a.targetDaysPerWeek !== b.targetDaysPerWeek ||
    a.createdAt !== b.createdAt ||
    a.frequency.length !== b.frequency.length ||
    a.frequency.some((day, i) => day !== b.frequency[i])
  );
}

function completionChanges(
  prevLog: Habit['completionLog'],
  nextLog: Habit['completionLog'],
  now: string,
): Record<string, CompletionOutboxEntry> {
  const changes: Record<string, CompletionOutboxEntry> = {};
  const days = new Set([...Object.keys(prevLog ?? {}), ...Object.keys(nextLog ?? {})]);

  for (const day of days) {
    if (!isCalendarDate(day)) continue;
    const before = prevLog?.[day];
    const after = nextLog?.[day];
    const wasDone = Boolean(before);
    const isDone = Boolean(after);
    if (wasDone === isDone && before === after) continue;
    if (!wasDone && !isDone) continue;

    changes[day] = isDone
      ? { done: true, at: now, completedAt: toCompletedAt(after as boolean | string) }
      : { done: false, at: now, completedAt: null };
  }
  return changes;
}

/**
 * Diff two versions of the local habit list and queue what changed. Returns
 * the SAME outbox object when nothing sync-relevant changed, so callers can
 * skip persisting.
 */
export function recordLocalChanges(
  outbox: Outbox,
  prevHabits: readonly Habit[],
  nextHabits: readonly Habit[],
  now: string,
): Outbox {
  if (prevHabits === nextHabits) return outbox;

  const prevById = new Map(prevHabits.map((h) => [h.id, h]));
  const nextById = new Map(nextHabits.map((h) => [h.id, h]));
  let habits: Outbox['habits'] | null = null;
  let completions: Outbox['completions'] | null = null;
  const writableHabits = () => (habits ??= { ...outbox.habits });
  const writableCompletions = () => (completions ??= { ...outbox.completions });

  // Deleted locally: tombstone, and drop its now-pointless pending completions.
  for (const [id] of prevById) {
    if (nextById.has(id)) continue;
    writableHabits()[id] = { at: now, deleted: true };
    if (outbox.completions[id]) delete writableCompletions()[id];
  }

  for (const [id, next] of nextById) {
    const prev = prevById.get(id);
    if (!prev || syncedFieldsDiffer(prev, next)) {
      writableHabits()[id] = { at: now, deleted: false };
    }
    const changes = completionChanges(prev?.completionLog ?? {}, next.completionLog, now);
    if (Object.keys(changes).length > 0) {
      const all = writableCompletions();
      all[id] = { ...(all[id] ?? {}), ...changes };
    }
  }

  if (!habits && !completions) return outbox;
  return { habits: habits ?? outbox.habits, completions: completions ?? outbox.completions };
}

/**
 * Everything on this device, for the first sync after the user consents.
 * Habits get `now`; completions keep their real completion time, and legacy
 * `true` entries get EPOCH so any genuine change elsewhere beats them.
 */
export function buildFullOutbox(habits: readonly Habit[], now: string): Outbox {
  const outbox: Outbox = { habits: {}, completions: {} };
  for (const habit of habits) {
    if (!validateSyncedHabit(habit).ok) continue;
    outbox.habits[habit.id] = { at: now, deleted: false };

    const days: Record<string, CompletionOutboxEntry> = {};
    for (const [day, value] of Object.entries(habit.completionLog ?? {})) {
      if (!value || !isCalendarDate(day)) continue;
      const completedAt = toCompletedAt(value);
      days[day] = { done: true, at: completedAt ?? EPOCH, completedAt };
    }
    if (Object.keys(days).length > 0) outbox.completions[habit.id] = days;
  }
  return outbox;
}

/** Combine two outboxes, keeping the newer entry for every key. */
export function mergeOutboxes(a: Outbox, b: Outbox): Outbox {
  const habits = { ...a.habits };
  for (const [id, entry] of Object.entries(b.habits)) {
    if (!habits[id] || clockValue(entry.at) > clockValue(habits[id].at)) habits[id] = entry;
  }
  const completions: Outbox['completions'] = { ...a.completions };
  for (const [id, days] of Object.entries(b.completions)) {
    const merged = { ...(completions[id] ?? {}) };
    for (const [day, entry] of Object.entries(days)) {
      if (!merged[day] || clockValue(entry.at) > clockValue(merged[day].at)) merged[day] = entry;
    }
    completions[id] = merged;
  }
  return { habits, completions };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type PushHabit =
  | (SyncedHabitFields & { client_updated_at: string })
  | { local_id: string; deleted: true; client_updated_at: string };

export interface PushCompletion {
  local_id: string;
  completed_on: string;
  done: boolean;
  completed_at: string | null;
  client_updated_at: string;
}

export interface PushPayload {
  habits: PushHabit[];
  completions: PushCompletion[];
  /** Habit ids that can never be sent (vanished, or invalid); acknowledged and dropped. */
  unsendable: string[];
}

export function buildPushPayload(outbox: Outbox, habits: readonly Habit[]): PushPayload {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const payload: PushPayload = { habits: [], completions: [], unsendable: [] };

  for (const [id, entry] of Object.entries(outbox.habits)) {
    if (entry.deleted) {
      payload.habits.push({ local_id: id, deleted: true, client_updated_at: entry.at });
      continue;
    }
    // Fields are read at send time, so the newest local version goes out.
    const habit = byId.get(id);
    const validated = habit ? validateSyncedHabit(habit) : null;
    if (!validated?.ok) {
      payload.unsendable.push(id);
      continue;
    }
    payload.habits.push({ ...validated.fields, client_updated_at: entry.at });
  }

  for (const [id, days] of Object.entries(outbox.completions)) {
    if (outbox.habits[id]?.deleted) continue;
    for (const [day, entry] of Object.entries(days)) {
      if (!isCalendarDate(day)) continue;
      payload.completions.push({
        local_id: id,
        completed_on: day,
        done: entry.done,
        completed_at: entry.done ? entry.completedAt : null,
        client_updated_at: entry.at,
      });
    }
  }
  return payload;
}

function sameHabitEntry(a: HabitOutboxEntry | undefined, b: HabitOutboxEntry): boolean {
  return !!a && a.at === b.at && a.deleted === b.deleted;
}

function sameCompletionEntry(a: CompletionOutboxEntry | undefined, b: CompletionOutboxEntry): boolean {
  return !!a && a.at === b.at && a.done === b.done;
}

/**
 * Drop the entries the server accepted. An entry that changed again while the
 * push was in flight no longer matches what was sent, so it stays queued.
 */
export function ackOutbox(current: Outbox, sent: Outbox): Outbox {
  const habits = { ...current.habits };
  for (const [id, entry] of Object.entries(sent.habits)) {
    if (sameHabitEntry(habits[id], entry)) delete habits[id];
  }

  const completions: Outbox['completions'] = {};
  for (const [id, days] of Object.entries(current.completions)) {
    const remaining: Record<string, CompletionOutboxEntry> = {};
    for (const [day, entry] of Object.entries(days)) {
      if (!sameCompletionEntry(sent.completions[id]?.[day], entry)) remaining[day] = entry;
    }
    if (Object.keys(remaining).length > 0) completions[id] = remaining;
  }
  return { habits, completions };
}
