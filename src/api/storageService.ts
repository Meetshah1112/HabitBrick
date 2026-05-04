import AsyncStorage from '@react-native-async-storage/async-storage';
import { Habit, Badge } from '../types';

const HABITS_KEY = '@atomicstep/habits';
const BADGES_KEY = '@atomicstep/badges';
const LEGACY_HABITS_KEY = '@habitflow/habits';
const LEGACY_BADGES_KEY = '@habitflow/badges';

export const storageService = {
  async getHabits(): Promise<Habit[] | null> {
    let json = await AsyncStorage.getItem(HABITS_KEY);
    if (!json) {
      // Try migration from old key
      json = await AsyncStorage.getItem(LEGACY_HABITS_KEY);
      if (json) {
        await AsyncStorage.setItem(HABITS_KEY, json);
        // Optionally remove old key: await AsyncStorage.removeItem(LEGACY_HABITS_KEY);
      }
    }
    return json ? JSON.parse(json) : null;
  },

  async saveHabits(habits: Habit[]): Promise<void> {
    await AsyncStorage.setItem(HABITS_KEY, JSON.stringify(habits));
  },

  async getBadges(): Promise<Badge[] | null> {
    let json = await AsyncStorage.getItem(BADGES_KEY);
    if (!json) {
      json = await AsyncStorage.getItem(LEGACY_BADGES_KEY);
      if (json) {
        await AsyncStorage.setItem(BADGES_KEY, json);
      }
    }
    return json ? JSON.parse(json) : null;
  },

  async saveBadges(badges: Badge[]): Promise<void> {
    await AsyncStorage.setItem(BADGES_KEY, JSON.stringify(badges));
  },

  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove([HABITS_KEY, BADGES_KEY]);
  },

  async resetAllAppData(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const atomicKeys = keys.filter(k => k.startsWith('@atomicstep/'));
    // We might want to keep some system keys like isLoggedIn if we just want to reset progress,
    // but the user said "behave like a new user" and "directed to AddHabit".
    // I will remove everything, including username and accountCreatedAt,
    // but RootNavigator will fix the login state if needed.
    await AsyncStorage.multiRemove(atomicKeys);
  },
};
