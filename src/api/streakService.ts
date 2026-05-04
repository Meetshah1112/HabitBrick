import { Habit } from '../types';

export type TriggerType = 'allComplete' | 'noneComplete' | 'none';

export interface StreakData {
  streak: number;
  status: 'maintained' | 'broken';
  completedToday: boolean;
  weeklyProgress: ('completed' | 'missed' | 'future')[];
  // NEW ──────────────────────────────────
  triggerType: TriggerType;   // what caused the celebration screen to open
  scheduledCount: number;     // habits scheduled for today
  completedCount: number;     // how many of those are done
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export const fetchDailyStreakStatus = async (habits: Habit[]): Promise<StreakData> => {
  const todayDate = new Date();
  // Convert JS getDay() (0=Sun) → HabitBrick (0=Mon, 6=Sun)
  const todayDayOfWeek = todayDate.getDay() === 0 ? 6 : todayDate.getDay() - 1;

  const activeHabitsToday = habits.filter((h) => h.frequency[todayDayOfWeek]);
  const scheduledCount = activeHabitsToday.length;
  const completedCount = activeHabitsToday.filter((h) => h.completedToday).length;

  const allComplete = scheduledCount > 0 && completedCount === scheduledCount;
  const noneComplete = scheduledCount > 0 && completedCount === 0;
  const completedToday = allComplete;

  // NEW: Account Creation Awareness ──────────────────────────
  let accountCreatedAt = await AsyncStorage.getItem('@atomicstep/accountCreatedAt');
  const todayString = getLocalDateStr(todayDate);
  
  // Determine overall streak
  let streak = habits.length > 0 ? Math.max(...habits.map((h) => h.currentStreak)) : 0;
  if (streak === 0 && completedToday) streak = 1;

  // Determine trigger type
  let triggerType: TriggerType = 'none';
  if (allComplete) triggerType = 'allComplete';
  else if (noneComplete) triggerType = 'noneComplete';

  // Was yesterday broken?
  const yesterdayDate = new Date(Date.now() - 86400000);
  const yesterdayString = getLocalDateStr(yesterdayDate);
  const yesterdayDayOfWeek = yesterdayDate.getDay() === 0 ? 6 : yesterdayDate.getDay() - 1;

  const activeHabitsYesterday = habits.filter((h) => h.frequency[yesterdayDayOfWeek]);
  let completedYesterday = true;
  if (activeHabitsYesterday.length > 0) {
    completedYesterday = activeHabitsYesterday.every((h) => h.completionLog[yesterdayString]);
  }

  // PROTECTION: If account was created today or yesterday, don't show "broken" yet
  const isFirstDay = accountCreatedAt === todayString || !accountCreatedAt;
  const status = (!completedYesterday && !completedToday && !isFirstDay) ? 'broken' : 'maintained';

  // Weekly progress (real completion log for past days, today's actual state)
  const weeklyProgress: ('completed' | 'missed' | 'future')[] = Array(7).fill('future').map((_, i) => {
    const dayDate = new Date(todayDate);
    const diff = i - todayDayOfWeek;
    dayDate.setDate(todayDate.getDate() + diff);
    const dateStr = getLocalDateStr(dayDate);

    // NEUTRALITY: If day is before account creation date, show as neutral (future style)
    if (accountCreatedAt && dateStr < accountCreatedAt) return 'future';

    if (diff > 0) return 'future'; // future day
    if (diff === 0) {
      if (allComplete) return 'completed';
      // NEUTRALITY: On first day, don't show missed if not done yet
      if (isFirstDay) return 'future'; 
      return 'missed';
    }

    // Past day — check actual completion log
    const dayDow = dayDate.getDay() === 0 ? 6 : dayDate.getDay() - 1;
    const activeOnThatDay = habits.filter((h) => h.frequency[dayDow]);
    if (activeOnThatDay.length === 0) return 'future'; 
    return activeOnThatDay.every((h) => h.completionLog[dateStr]) ? 'completed' : 'missed';
  });

  return {
    streak,
    status,
    completedToday,
    weeklyProgress,
    triggerType,
    scheduledCount,
    completedCount,
  };
};

// ---------------------------------------------------------------------------
// Should we show the celebration screen today?
// Uses separate AsyncStorage keys for allComplete vs noneComplete
// so the "none" check can't block the "all" check and vice-versa.
// ---------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';

const SHOWN_KEY = (type: TriggerType) => `@atomicstep/celebrationShown/${type}`;

export async function markCelebrationShown(triggerType: TriggerType): Promise<void> {
  const todayStr = getLocalDateStr();
  await AsyncStorage.setItem(SHOWN_KEY(triggerType), todayStr);
}

export async function wasCelebrationShownToday(triggerType: TriggerType): Promise<boolean> {
  const todayStr = getLocalDateStr();
  const lastShown = await AsyncStorage.getItem(SHOWN_KEY(triggerType));
  return lastShown === todayStr;
}
