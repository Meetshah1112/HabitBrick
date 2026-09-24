/**
 * Keep a habit's reminders in step with whether it is done today.
 *
 * Extracted from habitStore.toggleHabit so that a completion arriving from
 * another device (sync) silences reminders exactly like a tap on this one.
 */

import type { Habit } from '../types';
import { getLocalDateStr } from '../utils/streaks';
import {
  scheduleNaggingAlarms,
  cancelNaggingAlarmsForDate,
  cancelAllAlarmsForHabit,
  scheduleEndOfDayReminders,
  cancelEndOfDayReminderForDate,
  cancelAllEndOfDayReminders,
} from './notificationService';

export type ReminderIds = Pick<Habit, 'queuedNotificationIds' | 'queuedEodIds'>;

/** Done today: silence today's nags and "last chance" nudge. Not done: restore them. */
export async function syncTodayReminders(habit: Habit, isDoneToday: boolean): Promise<ReminderIds> {
  const todayStr = getLocalDateStr();

  if (isDoneToday) {
    const afterNags = await cancelNaggingAlarmsForDate(habit, todayStr);
    const afterEod = await cancelEndOfDayReminderForDate(afterNags, todayStr);
    return { queuedNotificationIds: afterEod.queuedNotificationIds, queuedEodIds: afterEod.queuedEodIds };
  }

  const notDone: Habit = {
    ...habit,
    completedToday: false,
    completionLog: { ...habit.completionLog, [todayStr]: false },
  };
  const afterNags = await scheduleNaggingAlarms(notDone);
  const afterEod = await scheduleEndOfDayReminders(afterNags);
  return { queuedNotificationIds: afterEod.queuedNotificationIds, queuedEodIds: afterEod.queuedEodIds };
}

/** A habit that no longer exists must not keep firing "complete me" reminders. */
export async function cancelAllReminders(habit: Habit): Promise<void> {
  await Promise.allSettled([cancelAllAlarmsForHabit(habit), cancelAllEndOfDayReminders(habit)]);
}
