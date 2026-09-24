/**
 * Date and streak helpers — pure, no React Native imports.
 *
 * getLocalDateStr and calculateStreak moved here from store/habitSlice.ts
 * (which re-exports them, so existing imports keep working). Keeping them
 * pure lets the sync merge recompute streaks, and lets both be unit-tested
 * and run under plain Node in supabase/tests/sync.integration.test.mjs.
 */

type CompletionLog = Record<string, boolean | string>;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
/** Longest history walked when looking for streaks: ~20 years. */
const MAX_DAYS_WALKED = 7300;

/** Local-timezone date string (YYYY-MM-DD) — avoids the UTC midnight edge-case. */
export function getLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** True only for a real calendar day: rejects '2026-02-30' as Postgres does. */
export function isCalendarDate(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Monday = 0 … Sunday = 6, matching Habit.frequency. */
function scheduleIndex(date: Date): number {
  return date.getDay() === 0 ? 6 : date.getDay() - 1;
}

/**
 * Walk backwards from today through the completionLog and count consecutive
 * scheduled days that were completed. Today is skipped if not yet completed
 * (so the streak doesn't break mid-day).
 */
export function calculateStreak(
  completionLog: CompletionLog,
  frequency: boolean[],
  now: Date = new Date(),
): number {
  const todayStr = getLocalDateStr(now);
  let streak = 0;

  // Walk backwards up to 2 years
  for (let i = 0; i < 730; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const dateStr = getLocalDateStr(date);

    if (dateStr === todayStr) {
      // Today: count if completed regardless of whether it is a scheduled day.
      // This ensures marking a habit on an off-schedule day still shows streak >= 1.
      if (completionLog[dateStr]) streak++;
      // Always continue — never break on today
      continue;
    }

    // Past days: only scheduled days matter for the streak chain
    if (!frequency[scheduleIndex(date)]) {
      continue; // unscheduled day — skip without breaking
    }

    if (completionLog[dateStr]) {
      streak++;
    } else {
      break; // missed a past scheduled day — streak broken
    }
  }

  return streak;
}

/**
 * The longest run anywhere in the log, by the same rules as calculateStreak:
 * unscheduled past days neither count nor break a run, and a completed today
 * counts even when unscheduled.
 *
 * Needed once sync can merge in history from another device: a run completed
 * over there never passed through this device's calculateStreak, so the
 * stored longestStreak could otherwise stay too low forever.
 */
export function calculateLongestStreak(
  completionLog: CompletionLog,
  frequency: boolean[],
  now: Date = new Date(),
): number {
  const todayStr = getLocalDateStr(now);
  const days = Object.keys(completionLog)
    .filter((key) => completionLog[key] && isCalendarDate(key) && key <= todayStr)
    .sort();
  if (days.length === 0) return 0;

  const [y, m, d] = days[0].split('-').map(Number);
  const cursor = new Date(y, m - 1, d, 12); // midday: immune to DST shifts
  let best = 0;
  let run = 0;

  for (let i = 0; i < MAX_DAYS_WALKED; i++) {
    const dateStr = getLocalDateStr(cursor);
    const isDone = Boolean(completionLog[dateStr]);

    if (dateStr === todayStr) {
      if (isDone) run++;
      return Math.max(best, run);
    }

    if (frequency[scheduleIndex(cursor)]) {
      run = isDone ? run + 1 : 0;
      best = Math.max(best, run);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return best;
}
