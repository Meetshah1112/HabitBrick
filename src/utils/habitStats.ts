/**
 * Habit performance statistics — pure, derived from a habit's completionLog.
 *
 * Used by:
 *   - InsightsScreen single-habit view  → success rate card
 *   - InsightsScreen aggregate view     → best-performing habits ranking
 *
 * "Success rate" = completed scheduled days / total scheduled days, measured
 * from the day the habit was created (never before the account existed) up to
 * today. Today is only counted in the denominator once it's actually been
 * completed, so an in-progress day never drags the rate down — same philosophy
 * as the streak calculation.
 */

import type { Habit } from '../types';
import { getLocalDateStr } from '../store/habitSlice';

export interface HabitStats {
  /** Scheduled days counted toward the rate (today excluded unless done). */
  scheduledDays: number;
  /** Of the scheduled days, how many were completed. */
  completedDays: number;
  /** completedDays / scheduledDays, in [0, 1]. 0 when no scheduled days yet. */
  successRate: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Walk every day from the habit's start date through today and tally
 * scheduled vs. completed days.
 */
export function computeHabitStats(
  habit: Habit,
  accountCreatedAt: string | null,
): HabitStats {
  const todayStr = getLocalDateStr();

  // Start from the later of (habit creation, account creation) so we never
  // count days before the user could possibly have acted on this habit.
  const startStr =
    accountCreatedAt && accountCreatedAt > habit.createdAt
      ? accountCreatedAt
      : habit.createdAt;

  const start = new Date(startStr);
  const today = new Date(todayStr);

  // Guard against malformed dates.
  if (isNaN(start.getTime()) || isNaN(today.getTime())) {
    return { scheduledDays: 0, completedDays: 0, successRate: 0 };
  }

  let scheduledDays = 0;
  let completedDays = 0;

  const totalDays = Math.floor((today.getTime() - start.getTime()) / MS_PER_DAY);

  for (let i = 0; i <= totalDays; i++) {
    const date = new Date(start.getTime() + i * MS_PER_DAY);
    const dateStr = getLocalDateStr(date);
    const dayOfWeek = date.getDay() === 0 ? 6 : date.getDay() - 1; // Mon = 0

    if (!habit.frequency[dayOfWeek]) continue; // not a scheduled day

    const isCompleted = !!habit.completionLog[dateStr];

    // Don't penalise an in-progress day: if today is scheduled but not yet
    // done, leave it out of the denominator entirely.
    if (dateStr === todayStr && !isCompleted) continue;

    scheduledDays++;
    if (isCompleted) completedDays++;
  }

  const successRate = scheduledDays > 0 ? completedDays / scheduledDays : 0;
  return { scheduledDays, completedDays, successRate };
}

export interface RankedHabit {
  habit: Habit;
  stats: HabitStats;
}

/**
 * Rank habits by success rate (desc), tie-broken by current streak (desc).
 * Habits with no scheduled days yet are excluded — they have no signal.
 */
export function getBestPerformingHabits(
  habits: readonly Habit[],
  accountCreatedAt: string | null,
  limit = 3,
): RankedHabit[] {
  return habits
    .map((habit) => ({ habit, stats: computeHabitStats(habit, accountCreatedAt) }))
    .filter((r) => r.stats.scheduledDays > 0)
    .sort((a, b) => {
      if (b.stats.successRate !== a.stats.successRate) {
        return b.stats.successRate - a.stats.successRate;
      }
      return b.habit.currentStreak - a.habit.currentStreak;
    })
    .slice(0, limit);
}

/** Format a 0–1 rate as a whole-number percentage string, e.g. 0.834 → "83%". */
export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
