/**
 * useHabitStore() — drop-in hook that all screens already import.
 *
 * Under the hood it now delegates to Redux Toolkit (habitSlice) and
 * auto-persists via the store subscriber in store.ts.
 *
 * The return shape is identical to the old pub-sub implementation so
 * existing screens require zero import changes.
 */

import { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from './store';
import {
  addHabit as addHabitAction,
  toggleHabit as toggleHabitAction,
  deleteHabit as deleteHabitAction,
  editHabit as editHabitAction,
} from './habitSlice';
import type { Habit } from '../types';
import {
  scheduleNaggingAlarms,
  cancelAllAlarmsForHabit,
  fireAlarmConfirmation,
} from '../api/notificationService';
import { syncTodayReminders, cancelAllReminders } from '../api/reminderSync';

export function useHabitStore() {
  const dispatch = useDispatch<AppDispatch>();
  const habits = useSelector((s: RootState) => s.habits.habits);
  const badges = useSelector((s: RootState) => s.habits.badges);
  const isLoaded = useSelector((s: RootState) => s.habits.isLoaded);

  const addHabit = useCallback(
    (habit: Omit<Habit, 'id' | 'currentStreak' | 'longestStreak' | 'completedToday' | 'completionLog' | 'createdAt'>) => {
      dispatch(addHabitAction(habit));
    },
    [dispatch],
  );

  const toggleHabit = useCallback(
    async (habitId: string) => {
      // Find current habit value
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;

      const newCompleted = !habit.completedToday;

      // Dispatch original sync action for immediate UI update
      dispatch(toggleHabitAction(habitId));

      // Done → silence today's reminders (alarm nags + EOD nudge);
      // un-done → turn them back on. Shared with sync (api/reminderSync.ts).
      const reminderIds = await syncTodayReminders(habit, newCompleted);
      dispatch(editHabitAction({ id: habitId, updates: reminderIds }));
    },
    [dispatch, habits],
  );

  const deleteHabit = useCallback(
    (habitId: string) => {
      // Best-effort: cancel any scheduled reminders so a deleted habit can't
      // keep firing "complete me" notifications. Fire-and-forget.
      const habit = habits.find((h) => h.id === habitId);
      if (habit) cancelAllReminders(habit).catch(() => {});
      dispatch(deleteHabitAction(habitId));
    },
    [dispatch, habits],
  );

  const editHabit = useCallback(
    (habitId: string, updates: Partial<Pick<Habit, 'title' | 'description' | 'category' | 'frequency' | 'targetDaysPerWeek' | 'alarms' | 'queuedNotificationIds' | 'queuedEodIds'>>) => {
      dispatch(editHabitAction({ id: habitId, updates }));
    },
    [dispatch],
  );

  const setAlarms = useCallback(
    async (habitId: string, alarms: string[]) => {
      dispatch(editHabitAction({ id: habitId, updates: { alarms } }));

      // Find the updated habit from current state
      const allHabits = habits;
      const habit = allHabits.find((h) => h.id === habitId);
      if (!habit) return;

      const updatedHabit: Habit = { ...habit, alarms };

      // Clean completely first, then reschedule
      const cleanedHabit = await cancelAllAlarmsForHabit(updatedHabit);
      if (alarms.length > 0) {
        // skipCompletionCheck=true: user explicitly set alarms, so schedule
        // even if the habit is already completed today
        const finalHabit = await scheduleNaggingAlarms(cleanedHabit, true);
        dispatch(editHabitAction({ id: habitId, updates: { queuedNotificationIds: finalHabit.queuedNotificationIds } }));
        
        // Fire an immediate confirmation notification so user sees proof it works
        const latestAlarm = alarms[alarms.length - 1];
        await fireAlarmConfirmation(updatedHabit, latestAlarm);
      } else {
        dispatch(editHabitAction({ id: habitId, updates: { queuedNotificationIds: cleanedHabit.queuedNotificationIds } }));
      }
    },
    [dispatch, habits],
  );

  return { habits, badges, isLoaded, addHabit, toggleHabit, deleteHabit, editHabit, setAlarms };
}
