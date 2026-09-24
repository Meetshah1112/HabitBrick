/**
 * Backup plan — converts this device's habits into database rows.
 *
 * Pure: no I/O and no React Native imports, so it is unit-tested directly and
 * the consent screen can show exact counts before anything leaves the phone.
 *
 * Validation matters more than usual here. Postgres rejects an ENTIRE insert
 * over a single bad value (verified: '2026-02-30' fails the statement), so one
 * malformed entry in one habit's log would otherwise sink a user's whole
 * backup. Bad entries are skipped and counted instead, never "repaired" into
 * data the user did not record.
 */

import type { Habit } from '../types';

/** Mirrors public.habits (see supabase/migrations/0001_schema.sql). */
export interface HabitRow {
  user_id: string;
  local_id: string;
  title: string;
  description: string | null;
  category: string;
  frequency: boolean[];
  target_days_per_week: number;
  /** YYYY-MM-DD */
  created_at: string;
}

/** A completion before its habit has a server id. */
export interface CompletionDraft {
  /** YYYY-MM-DD, the local calendar day the habit was done. */
  completed_on: string;
  /** ISO timestamp when known; null for legacy `true` entries. */
  completed_at: string | null;
}

export interface SkippedHabit {
  localId: string;
  reason: 'invalid frequency' | 'invalid createdAt' | 'duplicate local id';
}

export interface BackupPlan {
  habitRows: HabitRow[];
  completionsByLocalId: Record<string, CompletionDraft[]>;
  habitCount: number;
  completionCount: number;
  skippedHabits: SkippedHabit[];
  /** Log entries dropped because their key is not a real calendar date. */
  skippedCompletionEntries: number;
}

const DAYS_PER_WEEK = 7;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/** True only for a real calendar day: rejects '2026-02-30' as Postgres does. */
function isCalendarDate(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Current builds store YYYY-MM-DD. Older builds may have stored a full ISO
 * datetime; its date part is taken (the UTC date — at worst a day off for a
 * habit created near midnight, which only affects success-rate start dates).
 */
function normaliseCreatedAt(createdAt: unknown): string | null {
  if (typeof createdAt !== 'string') return null;
  const match = DATE_PREFIX.exec(createdAt);
  if (!match) return null;
  return isCalendarDate(match[1]) ? match[1] : null;
}

function isValidFrequency(frequency: unknown): frequency is boolean[] {
  return (
    Array.isArray(frequency) &&
    frequency.length === DAYS_PER_WEEK &&
    frequency.every((day) => typeof day === 'boolean')
  );
}

/** Stored target when sane, otherwise the count of scheduled days. */
function targetDays(habit: Habit, frequency: boolean[]): number {
  const stored = habit.targetDaysPerWeek;
  if (Number.isInteger(stored) && stored >= 0 && stored <= DAYS_PER_WEEK) return stored;
  return frequency.filter(Boolean).length;
}

function toCompletedAt(value: boolean | string): string | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildCompletions(
  log: Habit['completionLog'],
): { drafts: CompletionDraft[]; skipped: number } {
  const drafts: CompletionDraft[] = [];
  let skipped = 0;

  for (const [day, value] of Object.entries(log ?? {})) {
    if (!value) continue; // un-completed day: not a brick, not an error
    if (!isCalendarDate(day)) {
      skipped++;
      continue;
    }
    drafts.push({ completed_on: day, completed_at: toCompletedAt(value) });
  }

  drafts.sort((a, b) => a.completed_on.localeCompare(b.completed_on));
  return { drafts, skipped };
}

export function buildBackupPlan(userId: string, habits: readonly Habit[]): BackupPlan {
  const habitRows: HabitRow[] = [];
  const completionsByLocalId: Record<string, CompletionDraft[]> = {};
  const skippedHabits: SkippedHabit[] = [];
  const seen = new Set<string>();
  let completionCount = 0;
  let skippedCompletionEntries = 0;

  for (const habit of habits) {
    // Two rows sharing (user_id, local_id) in one upsert fail the statement.
    if (seen.has(habit.id)) {
      skippedHabits.push({ localId: habit.id, reason: 'duplicate local id' });
      continue;
    }
    if (!isValidFrequency(habit.frequency)) {
      skippedHabits.push({ localId: habit.id, reason: 'invalid frequency' });
      continue;
    }
    const createdAt = normaliseCreatedAt(habit.createdAt);
    if (!createdAt) {
      skippedHabits.push({ localId: habit.id, reason: 'invalid createdAt' });
      continue;
    }
    seen.add(habit.id);

    habitRows.push({
      user_id: userId,
      local_id: habit.id,
      title: habit.title,
      description: habit.description ?? null,
      category: habit.category,
      frequency: [...habit.frequency],
      target_days_per_week: targetDays(habit, habit.frequency),
      created_at: createdAt,
    });

    const { drafts, skipped } = buildCompletions(habit.completionLog);
    completionsByLocalId[habit.id] = drafts;
    completionCount += drafts.length;
    skippedCompletionEntries += skipped;
  }

  return {
    habitRows,
    completionsByLocalId,
    habitCount: habitRows.length,
    completionCount,
    skippedHabits,
    skippedCompletionEntries,
  };
}
