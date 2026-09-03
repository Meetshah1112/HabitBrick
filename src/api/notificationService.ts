/**
 * notificationService.ts
 *
 * Handles all expo-notifications scheduling, permissions,
 * and smart (anti-repeat) message selection for HabitBrick.
 *
 * ⚠️  Expo Go (SDK 53+) no longer supports push notification
 *     infrastructure. All functions gracefully no-op when
 *     running in Expo Go so the app doesn't crash.
 *     Full notifications work in a development build or
 *     production build.
 */

import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Habit } from '../types';
import { NOTIFICATION_MESSAGES } from '../constants/notificationMessages';

// ---------------------------------------------------------------------------
// Expo Go guard
// ---------------------------------------------------------------------------

/**
 * Returns true when the app is running inside Expo Go (storeClient).
 * In this environment expo-notifications remote/push infra is unavailable
 * since SDK 53, so we skip all scheduling and just return mock values.
 */
export const IS_EXPO_GO =
  Constants.executionEnvironment === 'storeClient' ||
  // fallback for older Constants API shape
  (Constants as any).appOwnership === 'expo';

// ---------------------------------------------------------------------------
// Notification handler — only initialise outside Expo Go
// ---------------------------------------------------------------------------

/** Cached reference to expo-notifications module (null in Expo Go) */
let _Notifications: any = null;

function getNotifications() {
  if (!_Notifications && !IS_EXPO_GO) {
    _Notifications = require('expo-notifications');
  }
  return _Notifications;
}

if (!IS_EXPO_GO) {
  const Notifications = getNotifications();

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Android requires a notification channel (Android 8+)
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('habit-reminders', {
      name: 'Habit Reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      lightColor: '#FF6B35',
      enableVibrate: true,
      showBadge: true,
    });
  }

  // Configure action categories for In-App Alarm
  Notifications.setNotificationCategoryAsync('HABIT_ALARM', [
    {
      identifier: 'COMPLETE',
      buttonTitle: 'Mark Completed',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'SNOOZE',
      buttonTitle: 'Snooze 10m',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'DISMISS',
      buttonTitle: 'Dismiss',
      options: { isDestructive: true, opensAppToForeground: false },
    },
  ]);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HISTORY_KEY_PREFIX = '@atomicstep/notif_history/';
const HISTORY_DEPTH = 3; // number of recent messages to avoid repeating

// End-of-day "last chance" reminder — fires a few hours before midnight for any
// scheduled habit that is still incomplete. Independent of user-set alarms.
const EOD_REMINDER_HOUR = 21; // 9 PM
const EOD_REMINDER_MINUTE = 0;
const EOD_LOOKAHEAD_DAYS = 3; // schedule today + next 2 days

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a trigger object for a specific Date with correct type and channelId.
 */
function buildDateTrigger(date: Date): any {
  const Notifications = getNotifications();
  const trigger: any = {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: date,
  };
  if (Platform.OS === 'android') {
    trigger.channelId = 'habit-reminders';
  }
  return trigger;
}

/**
 * Build a seconds-from-now trigger.
 */
function buildSecondsTrigger(seconds: number): any {
  const Notifications = getNotifications();
  const trigger: any = {
    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    seconds,
  };
  if (Platform.OS === 'android') {
    trigger.channelId = 'habit-reminders';
  }
  return trigger;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Request OS notification permissions.
 * Returns true immediately in Expo Go (no-op).
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (IS_EXPO_GO) {
    console.log('[Notifications] Expo Go detected — skipping permission request.');
    return false;
  }
  try {
    const Notifications = getNotifications();
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    console.warn('[Notifications] Permission request failed:', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Anti-repeat message picker
// ---------------------------------------------------------------------------

async function loadHistory(habitId: string): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY_PREFIX + habitId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveHistory(habitId: string, history: number[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      HISTORY_KEY_PREFIX + habitId,
      JSON.stringify(history.slice(-HISTORY_DEPTH)),
    );
  } catch {
    // fail silently — non-critical
  }
}

/**
 * Pick a random message from the habit's category pool for a given context,
 * avoiding the last HISTORY_DEPTH messages shown for that habit.
 */
export async function getHabitMessage(
  habit: Habit,
  context: 'pending' | 'completed',
): Promise<string> {
  const pool = NOTIFICATION_MESSAGES[habit.category]?.[context] ?? [];

  if (pool.length === 0) {
    return context === 'pending'
      ? `Time to work on "${habit.title}"!`
      : `Great job completing "${habit.title}"! 🎉`;
  }

  const history = await loadHistory(habit.id + '_' + context);
  const available = pool.map((_, i) => i).filter((i) => !history.includes(i));

  // If all messages have been recently shown, reset
  const candidates = available.length > 0 ? available : pool.map((_, i) => i);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  await saveHistory(habit.id + '_' + context, [...history, chosen]);
  return pool[chosen];
}

/**
 * Synchronous version for immediate use (no history tracking).
 * Useful for inline UI previews.
 */
export function getHabitMessageSync(
  habit: Habit,
  context: 'pending' | 'completed',
): string {
  const pool = NOTIFICATION_MESSAGES[habit.category]?.[context] ?? [];
  if (pool.length === 0) return `Time to work on "${habit.title}"!`;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------------------------------------------------------------------------
// Pre-scheduled Nagging Engine
// ---------------------------------------------------------------------------

function generateNaggingTimes(startHour: number, startMinute: number): {h: number, m: number}[] {
  const times: {h: number, m: number}[] = [];
  
  // 1. Initial alarm
  times.push({h: startHour, m: startMinute});
  
  // 2. Every 2 hours after initial
  let currentH = startHour + 2;
  while (currentH < 22) {
    times.push({h: currentH, m: startMinute});
    currentH += 2;
  }
  
  // 3. Final hours (22:00 -> 23:30) every 30 mins
  // only add if they are after the initial start time
  const urgent = [
    {h: 22, m: 0}, {h: 22, m: 30},
    {h: 23, m: 0}, {h: 23, m: 30}
  ];
  for (const u of urgent) {
    if (u.h > startHour || (u.h === startHour && u.m > startMinute)) {
      times.push(u);
    }
  }
  
  return times;
}

/**
 * Schedules up to 3 days of localized nagging notifications.
 * 
 * @param habit - The habit to schedule for.
 * @param skipCompletionCheck - When true, schedule even if the habit is
 *   completed today. Use this when the user explicitly sets alarms.
 */
export async function scheduleNaggingAlarms(
  habit: Habit,
  skipCompletionCheck: boolean = false,
): Promise<Habit> {
  const updatedHabit = { ...habit };
  if (!updatedHabit.queuedNotificationIds) updatedHabit.queuedNotificationIds = {};
  
  if (IS_EXPO_GO || !habit.alarms || habit.alarms.length === 0) return updatedHabit;

  const Notifications = getNotifications();
  
  // We schedule for Today, +1 day, +2 days
  const now = new Date();
  
  for (let offset = 0; offset < 3; offset++) {
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + offset);
    const dateStr = targetDate.getFullYear() + '-' + String(targetDate.getMonth() + 1).padStart(2, '0') + '-' + String(targetDate.getDate()).padStart(2, '0');
    
    // If we've already scheduled this date, skip recreating to avoid massive duplication
    if (updatedHabit.queuedNotificationIds[dateStr] && updatedHabit.queuedNotificationIds[dateStr].length > 0) {
      continue;
    }
    
    // Check if scheduled for this day of week!
    const dayOfWeek = targetDate.getDay() === 0 ? 6 : targetDate.getDay() - 1;
    if (!habit.frequency[dayOfWeek]) continue;
    
    // Only skip completed days during background rescheduling, NOT when user explicitly sets alarms
    if (!skipCompletionCheck && habit.completionLog[dateStr]) continue;

    const idsForDate: string[] = [];
    
    for (const alarm of habit.alarms) {
      const [hStr, mStr] = alarm.split(':');
      const startH = parseInt(hStr, 10);
      const startM = parseInt(mStr, 10);
      
      const naggingTimes = generateNaggingTimes(startH, startM);
      
      for (const time of naggingTimes) {
        const triggerDate = new Date(targetDate);
        triggerDate.setHours(time.h, time.m, 0, 0);
        
        if (triggerDate <= now) continue; // Past time today
        
        try {
          const message = await getHabitMessage(habit, 'pending');
          const identifier = await Notifications.scheduleNotificationAsync({
            content: {
              title: habit.title,
              body: time.h === 22 || time.h === 23 ? `URGENT: ${message} Day is ending!` : message,
              data: { habitId: habit.id, dateStr },
              sound: 'default',
              vibrate: [0, 250, 250, 250],
              categoryIdentifier: 'HABIT_ALARM',
              priority: 'max',
            },
            trigger: buildDateTrigger(triggerDate),
          });
          idsForDate.push(identifier);
        } catch (e) {
          console.warn('Failed scheduling exact date trigger:', e);
        }
      }
    }
    
    updatedHabit.queuedNotificationIds[dateStr] = idsForDate;
  }
  
  return updatedHabit;
}

/**
 * Fire a confirmation notification immediately so the user knows alarms are working.
 * Also schedules a test notification 5 seconds from now as a double-check.
 */
export async function fireAlarmConfirmation(habit: Habit, alarmTime: string): Promise<void> {
  if (IS_EXPO_GO) return;
  try {
    const Notifications = getNotifications();
    
    // Immediate confirmation
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ Alarm Set: ${habit.title}`,
        body: `You'll be reminded at ${formatTime12h(alarmTime)} daily. We'll nag you until it's done! 💪`,
        data: { habitId: habit.id },
        sound: 'default',
      },
      trigger: null, // fire immediately
    });
  } catch (e) {
    console.warn('[Notifications] Alarm confirmation failed:', e);
  }
}

/**
 * Format "14:29" -> "02:29 PM"
 */
function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Cancel a habit's daily scheduled nagging for a specific date (e.g. today after completion)
 * Returns a new Habit object with those IDs cleared.
 */
export async function cancelNaggingAlarmsForDate(habit: Habit, dateStr: string): Promise<Habit> {
  const updatedHabit = { ...habit };
  if (!updatedHabit.queuedNotificationIds || !updatedHabit.queuedNotificationIds[dateStr]) {
    return updatedHabit; // Nothing to cancel
  }
  
  if (IS_EXPO_GO) {
    updatedHabit.queuedNotificationIds[dateStr] = [];
    return updatedHabit;
  }
  
  try {
    const Notifications = getNotifications();
    for (const id of updatedHabit.queuedNotificationIds[dateStr]) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  } catch(e) {
     console.warn('Error cancelling specific nags', e);
  }
  
  updatedHabit.queuedNotificationIds[dateStr] = [];
  return updatedHabit;
}

/**
 * Brute force clean ALL scheduled notifications for a habit across all days.
 */
export async function cancelAllAlarmsForHabit(habit: Habit): Promise<Habit> {
  const updatedHabit = { ...habit };
  if (!updatedHabit.queuedNotificationIds) return updatedHabit;
  
  if (!IS_EXPO_GO) {
    const Notifications = getNotifications();
    for (const dateStr of Object.keys(updatedHabit.queuedNotificationIds)) {
      for (const id of updatedHabit.queuedNotificationIds[dateStr]) {
        try {
          await Notifications.cancelScheduledNotificationAsync(id);
        } catch(e) {}
      }
    }
  }
  
  updatedHabit.queuedNotificationIds = {};
  return updatedHabit;
}

export async function fireCompletionNotification(habit: Habit): Promise<void> {
  if (IS_EXPO_GO) return;
  try {
    const Notifications = getNotifications();
    const message = await getHabitMessage(habit, 'completed');

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `✅ ${habit.title}`,
        body: message,
        data: { habitId: habit.id },
        sound: 'default',
      },
      trigger: null, // fire immediately
    });
  } catch (e) {
    console.warn('[Notifications] Completion notification failed:', e);
  }
}

// ---------------------------------------------------------------------------
// End-of-day "last chance" reminder
// ---------------------------------------------------------------------------

const EOD_MESSAGES = [
  "Only a few hours left in the day. Don't let this one slip. ⏳",
  "The day's almost over — finish strong before midnight. 🌙",
  "Last call! Complete this before the day ends and keep your streak alive. 🔥",
  "A few hours left. Future-you will be glad you didn't skip today.",
  "Day's winding down. One quick action and it's done. ✅",
];

function pickEodMessage(): string {
  return EOD_MESSAGES[Math.floor(Math.random() * EOD_MESSAGES.length)];
}

/**
 * Schedule a single evening "last chance" reminder for each upcoming scheduled
 * day a habit is still incomplete. Skips habits that already have user alarms
 * (those get their own urgent end-of-day nags from the nagging engine).
 *
 * Returns a new Habit with queuedEodIds populated so the IDs can later be
 * cancelled (e.g. once the habit is completed).
 */
export async function scheduleEndOfDayReminders(habit: Habit): Promise<Habit> {
  const updatedHabit = { ...habit };
  if (!updatedHabit.queuedEodIds) updatedHabit.queuedEodIds = {};

  // Habits with explicit alarms already receive urgent 22:00–23:30 nags.
  if (IS_EXPO_GO || (habit.alarms && habit.alarms.length > 0)) return updatedHabit;

  const Notifications = getNotifications();
  const now = new Date();

  for (let offset = 0; offset < EOD_LOOKAHEAD_DAYS; offset++) {
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + offset);
    const dateStr =
      targetDate.getFullYear() +
      '-' + String(targetDate.getMonth() + 1).padStart(2, '0') +
      '-' + String(targetDate.getDate()).padStart(2, '0');

    // Already scheduled for this date → don't duplicate.
    if (updatedHabit.queuedEodIds[dateStr] && updatedHabit.queuedEodIds[dateStr].length > 0) {
      continue;
    }

    // Only on scheduled days, and only if still incomplete.
    const dayOfWeek = targetDate.getDay() === 0 ? 6 : targetDate.getDay() - 1;
    if (!habit.frequency[dayOfWeek]) continue;
    if (habit.completionLog[dateStr]) continue;

    const triggerDate = new Date(targetDate);
    triggerDate.setHours(EOD_REMINDER_HOUR, EOD_REMINDER_MINUTE, 0, 0);
    if (triggerDate <= now) continue; // evening already passed today

    try {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏳ Last chance: ${habit.title}`,
          body: pickEodMessage(),
          data: { habitId: habit.id, dateStr, kind: 'eod' },
          sound: 'default',
          vibrate: [0, 250, 250, 250],
          categoryIdentifier: 'HABIT_ALARM',
          priority: 'max',
        },
        trigger: buildDateTrigger(triggerDate),
      });
      updatedHabit.queuedEodIds[dateStr] = [identifier];
    } catch (e) {
      console.warn('Failed scheduling end-of-day reminder:', e);
    }
  }

  return updatedHabit;
}

/**
 * Cancel the end-of-day reminder for a specific date (e.g. once completed).
 */
export async function cancelEndOfDayReminderForDate(habit: Habit, dateStr: string): Promise<Habit> {
  const updatedHabit = { ...habit };
  if (!updatedHabit.queuedEodIds || !updatedHabit.queuedEodIds[dateStr]) {
    return updatedHabit;
  }

  if (!IS_EXPO_GO) {
    try {
      const Notifications = getNotifications();
      for (const id of updatedHabit.queuedEodIds[dateStr]) {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
    } catch (e) {
      console.warn('Error cancelling end-of-day reminder', e);
    }
  }

  updatedHabit.queuedEodIds = { ...updatedHabit.queuedEodIds, [dateStr]: [] };
  return updatedHabit;
}

/**
 * Cancel ALL end-of-day reminders for a habit (e.g. on delete).
 */
export async function cancelAllEndOfDayReminders(habit: Habit): Promise<Habit> {
  const updatedHabit = { ...habit };
  if (!updatedHabit.queuedEodIds) return updatedHabit;

  if (!IS_EXPO_GO) {
    const Notifications = getNotifications();
    for (const dateStr of Object.keys(updatedHabit.queuedEodIds)) {
      for (const id of updatedHabit.queuedEodIds[dateStr]) {
        try {
          await Notifications.cancelScheduledNotificationAsync(id);
        } catch (e) {}
      }
    }
  }

  updatedHabit.queuedEodIds = {};
  return updatedHabit;
}

/**
 * Re-schedule all active habits on app launch.
 *  - Habits WITH alarms  → nagging engine (includes urgent EOD nags).
 *  - Habits WITHOUT alarms → single end-of-day "last chance" reminder.
 *
 * Returns the habits whose queued IDs changed so the caller can persist them
 * (needed so reminders can be cancelled on completion).
 */
export async function rescheduleAllHabitNotifications(
  habits: Habit[],
): Promise<Habit[]> {
  if (IS_EXPO_GO) return [];

  const updated: Habit[] = [];
  for (const habit of habits) {
    let next = habit;
    if (habit.alarms && habit.alarms.length > 0) {
      next = await scheduleNaggingAlarms(next, false);
    } else {
      next = await scheduleEndOfDayReminders(next);
    }
    if (next !== habit) updated.push(next);
  }
  return updated;
}
