import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Habit, HabitCategory, Badge } from '../types';
import { storageService } from '../api/storageService';
import { fireCompletionNotification } from '../api/notificationService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const generateId = () => Math.random().toString(36).substring(2, 15);

// Pure date/streak helpers now live in utils/streaks.ts; re-exported here so
// existing `from '../store/habitSlice'` imports keep working.
export { getLocalDateStr, calculateStreak } from '../utils/streaks';
import { getLocalDateStr, calculateStreak } from '../utils/streaks';

// ---------------------------------------------------------------------------
// Initial / default data (used on very first launch only)
// ---------------------------------------------------------------------------

const INITIAL_HABITS: Habit[] = [];

const INITIAL_BADGES: Badge[] = [
  // === INITIATION ===
  { id: 'b01', title: 'First Step',        description: 'Complete your very first habit.',              icon: 'Star',       unlocked: false, requirement: 'Complete any 1 habit', streakRequired: 0 },
  { id: 'b02', title: 'Hat Trick',         description: 'Complete 3 different habits on the same day.', icon: 'Zap',        unlocked: false, requirement: 'Mark 3 habits done today', streakRequired: 0 },
  { id: 'b03', title: 'Habit Collector',   description: 'Have 5 active habits in your list.',           icon: 'Layers',     unlocked: false, requirement: 'Add 5 habits', streakRequired: 0 },
  { id: 'b04', title: 'Habit Hoarder',     description: 'Have 10 active habits in your list.',          icon: 'Package',    unlocked: false, requirement: 'Add 10 habits', streakRequired: 0 },

  // === STREAK MILESTONES ===
  { id: 'b05', title: '3-Day Spark',       description: 'Build a 3-day streak on any habit.',           icon: 'Flame',      unlocked: false, requirement: 'Maintain a 3-day streak', streakRequired: 3 },
  { id: 'b06', title: 'Week Warrior',      description: '7 days of unbroken commitment.',               icon: 'Trophy',     unlocked: false, requirement: 'Maintain a 7-day streak', streakRequired: 7 },
  { id: 'b07', title: 'Fortnight Fighter', description: '14 consecutive days of discipline.',            icon: 'Shield',     unlocked: false, requirement: 'Maintain a 14-day streak', streakRequired: 14 },
  { id: 'b08', title: 'Monthly Master',    description: 'A full month of unbroken consistency.',        icon: 'Award',      unlocked: false, requirement: 'Maintain a 30-day streak', streakRequired: 30 },
  { id: 'b09', title: 'Fifty Strong',      description: '50 days of rock-solid discipline.',            icon: 'Target',     unlocked: false, requirement: 'Maintain a 50-day streak', streakRequired: 50 },
  { id: 'b10', title: 'Century Club',      description: 'An elite 100-day streak achieved.',            icon: 'Crown',      unlocked: false, requirement: 'Maintain a 100-day streak', streakRequired: 100 },
  { id: 'b11', title: 'Half Year Hero',    description: '180 days of complete unwavering dedication.',  icon: 'ShieldCheck',unlocked: false, requirement: 'Maintain a 180-day streak', streakRequired: 180 },
  { id: 'b12', title: 'Iron Will',         description: 'A full year of a single relentless habit.',    icon: 'Rocket',     unlocked: false, requirement: 'Maintain a 365-day streak', streakRequired: 365 },

  // === TOTAL COMPLETIONS ===
  { id: 'b13', title: 'Getting Started',   description: 'Log 10 total habit completions.',              icon: 'Check',      unlocked: false, requirement: 'Complete habits 10 times total', streakRequired: 0 },
  { id: 'b14', title: 'Fifty Done',        description: '50 total habit completions logged.',           icon: 'CheckCheck', unlocked: false, requirement: 'Complete habits 50 times total', streakRequired: 0 },
  { id: 'b15', title: 'Century Runner',    description: 'Hit 100 total habit completions.',             icon: 'Activity',   unlocked: false, requirement: 'Complete habits 100 times total', streakRequired: 0 },
  { id: 'b16', title: 'Five Hundred',      description: 'Half a thousand total completions.',           icon: 'TrendingUp', unlocked: false, requirement: 'Complete habits 500 times total', streakRequired: 0 },
  { id: 'b17', title: 'The Thousand',      description: '1,000 habit completions — truly legendary.',   icon: 'Star',       unlocked: false, requirement: 'Complete habits 1000 times total', streakRequired: 0 },

  // === CATEGORY MASTERY ===
  { id: 'b18', title: 'Fitness Buff',      description: 'Stay physically active for 7 days straight.',  icon: 'Heart',      unlocked: false, requirement: '7-day streak on physical habits', streakRequired: 7 },
  { id: 'b19', title: 'Zen Master',        description: 'Deepen mindfulness for 30 unbroken days.',     icon: 'Leaf',       unlocked: false, requirement: '30-day streak on mindfulness habits', streakRequired: 30 },
  { id: 'b20', title: 'Scholar',           description: 'Study consistently for 60 days.',              icon: 'BookOpen',   unlocked: false, requirement: '60-day streak on academic habits', streakRequired: 60 },
  { id: 'b21', title: 'Money Maker',       description: 'Track finances for 21 straight days.',         icon: 'TrendingUp', unlocked: false, requirement: '21-day streak on finance habits', streakRequired: 21 },
  { id: 'b22', title: 'Healthy Living',    description: 'Prioritize your health for 21 days.',          icon: 'Heart',      unlocked: false, requirement: '21-day streak on health habits', streakRequired: 21 },
  { id: 'b23', title: 'Creative Soul',     description: 'Express your creativity for 14 days running.', icon: 'Sparkles',   unlocked: false, requirement: '14-day streak on creativity habits', streakRequired: 14 },
  { id: 'b24', title: 'Social Butterfly',  description: 'Stay socially engaged for 14 days.',           icon: 'Users',      unlocked: false, requirement: '14-day streak on social habits', streakRequired: 14 },
  { id: 'b25', title: 'Well Rested',       description: 'Maintain great sleep habits for 21 days.',     icon: 'Moon',       unlocked: false, requirement: '21-day streak on sleep habits', streakRequired: 21 },

  // === TIME-BASED ===
  { id: 'b26', title: 'Early Bird',        description: 'Complete a habit before 8:00 AM.',             icon: 'Sun',        unlocked: false, requirement: 'Log a habit before 8:00 AM', streakRequired: 0 },
  { id: 'b27', title: 'Night Grind',       description: 'Complete a habit after 10:00 PM.',             icon: 'Moon',       unlocked: false, requirement: 'Log a habit after 10:00 PM', streakRequired: 0 },
  { id: 'b28', title: 'Weekend Warrior',   description: 'Complete habits on both Saturday & Sunday.',   icon: 'Calendar',   unlocked: false, requirement: 'Complete habits on Sat and Sun', streakRequired: 0 },

  // === CONSISTENCY ===
  { id: 'b29', title: 'Perfect Week',      description: 'Complete every scheduled habit for a full week.',       icon: 'Trophy',  unlocked: false, requirement: '100% scheduled habits completed for 7 days', streakRequired: 0 },
  { id: 'b30', title: 'Habit Ninja',       description: 'Zero missed habits across 21 consecutive days.',        icon: 'Brain',   unlocked: false, requirement: '21 days with no missed scheduled habits', streakRequired: 21 },
  { id: 'b31', title: 'Legendary',         description: 'Unlock 25 or more badges. The ultimate HabitBrick achievement.', icon: 'Gift', unlocked: false, requirement: 'Unlock 25 other badges first', streakRequired: 0 },
];


// ---------------------------------------------------------------------------
// Async thunk — loads persisted data (or seeds defaults on first launch)
// ---------------------------------------------------------------------------

export const loadData = createAsyncThunk('habits/loadData', async () => {
  const [storedHabits, storedBadges] = await Promise.all([
    storageService.getHabits(),
    storageService.getBadges(),
  ]);

  const todayStr = getLocalDateStr();
  let habits = storedHabits || INITIAL_HABITS;

  // ── Badge migration ────────────────────────────────────────────────────────
  // Always start from the canonical INITIAL_BADGES list (all 31 definitions).
  // Preserve any unlock state the user already earned from prior sessions.
  const storedMap: Record<string, Badge> = {};
  if (storedBadges) {
    for (const b of storedBadges) storedMap[b.id] = b;
  }
  const badges: Badge[] = INITIAL_BADGES.map((template) => {
    const saved = storedMap[template.id];
    if (saved) {
      // Badge already known — keep its unlock state but refresh the definition
      return { ...template, unlocked: saved.unlocked, unlockedAt: saved.unlockedAt };
    }
    return { ...template }; // New badge not yet in storage
  });
  // ──────────────────────────────────────────────────────────────────────────

  // Recalculate completedToday + streaks on every cold start
  habits = habits.map((h) => {
    const currentStreak = calculateStreak(h.completionLog, h.frequency);
    return {
      ...h,
      completedToday: !!h.completionLog[todayStr],
      currentStreak,
      longestStreak: Math.max(h.longestStreak, currentStreak),
    };
  });

  // Persist (seeds defaults on first launch, or saves recalculated data)
  await Promise.all([
    storageService.saveHabits(habits),
    storageService.saveBadges(badges),
  ]);

  return { habits, badges };
});


// ---------------------------------------------------------------------------
// Badge evaluation helper
// ---------------------------------------------------------------------------

function evaluateBadges(state: { habits: Habit[]; badges: Badge[] }): void {
  const habits = state.habits;
  const badges = state.badges;
  const todayStr = getLocalDateStr();
  
  // Stats for evaluation
  const allCompletionsLog = habits.flatMap(h => Object.keys(h.completionLog).filter(d => h.completionLog[d]));
  const totalCompletions = allCompletionsLog.length;
  const maxStreak = habits.length > 0 ? Math.max(...habits.map(h => h.currentStreak)) : 0;
  const currentHabitCount = habits.length;
  const unlockedBadgesCount = badges.filter(b => b.unlocked).length;

  // Completion times (requires parsing logs or having a specific 'completedAt' which we don't have fully, 
  // but we can estimate or use the live toggle event in the future. 
  // For now we'll focus on streaks and totals).

  for (const badge of badges) {
    if (badge.unlocked) continue;

    let shouldUnlock = false;

    switch (badge.id) {
      case 'b01': // First Step
        shouldUnlock = totalCompletions >= 1;
        break;
      case 'b02': // Hat Trick
        shouldUnlock = habits.filter(h => h.completedToday).length >= 3;
        break;
      case 'b03': // Habit Collector
        shouldUnlock = currentHabitCount >= 5;
        break;
      case 'b04': // Habit Hoarder
        shouldUnlock = currentHabitCount >= 10;
        break;
      case 'b05': case 'b06': case 'b07': case 'b08': case 'b09': case 'b10': case 'b11': case 'b12':
        shouldUnlock = maxStreak >= badge.streakRequired;
        break;
      case 'b13': shouldUnlock = totalCompletions >= 10; break;
      case 'b14': shouldUnlock = totalCompletions >= 50; break;
      case 'b15': shouldUnlock = totalCompletions >= 100; break;
      case 'b16': shouldUnlock = totalCompletions >= 500; break;
      case 'b17': shouldUnlock = totalCompletions >= 1000; break;
      case 'b18': // Fitness Buff
        shouldUnlock = habits.filter(h => h.category === 'physical').some(h => h.currentStreak >= 7);
        break;
      case 'b19': // Zen Master
        shouldUnlock = habits.filter(h => h.category === 'mindfulness').some(h => h.currentStreak >= 30);
        break;
      case 'b20': // Scholar
        shouldUnlock = habits.filter(h => h.category === 'academics').some(h => h.currentStreak >= 60);
        break;
      case 'b21': // Money Maker
        shouldUnlock = habits.filter(h => h.category === 'finance').some(h => h.currentStreak >= 21);
        break;
      case 'b22': // Healthy Living
        shouldUnlock = habits.filter(h => h.category === 'health').some(h => h.currentStreak >= 21);
        break;
      case 'b23': // Creative Soul
        shouldUnlock = habits.filter(h => h.category === 'creativity').some(h => h.currentStreak >= 14);
        break;
      case 'b24': // Social Butterfly
        shouldUnlock = habits.filter(h => h.category === 'social').some(h => h.currentStreak >= 14);
        break;
      case 'b25': // Well Rested
        shouldUnlock = habits.filter(h => h.category === 'sleep').some(h => h.currentStreak >= 21);
        break;
      case 'b26': // Early Bird
        shouldUnlock = habits.some(h => {
          const entry = h.completionLog[todayStr];
          if (typeof entry === 'string') {
            const hour = new Date(entry).getHours();
            return hour < 8;
          }
          return false;
        });
        break;
      case 'b27': // Night Grind
        shouldUnlock = habits.some(h => {
          const entry = h.completionLog[todayStr];
          if (typeof entry === 'string') {
            const hour = new Date(entry).getHours();
            return hour >= 22;
          }
          return false;
        });
        break;
      case 'b28': { // Weekend Warrior (Sat & Sun in same week)
        const now = new Date();
        const Sat = new Date(now);
        const Sun = new Date(now);
        Sat.setDate(now.getDate() - ((now.getDay() + 1) % 7)); // Recent Sat
        Sun.setDate(now.getDate() - (now.getDay() % 7)); // Recent Sun
        if (now.getDay() === 0) Sat.setDate(now.getDate() - 1); // If today is Sun, Sat was yesterday
        
        const satStr = getLocalDateStr(Sat);
        const sunStr = getLocalDateStr(Sun);
        shouldUnlock = habits.some(h => h.completionLog[satStr]) && habits.some(h => h.completionLog[sunStr]);
        break;
      }
      case 'b29': { // Perfect Week (100% scheduled habits for 7 days)
        let consecutivePerfectDays = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dStr = getLocalDateStr(d);
          const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1;
          
          const scheduled = habits.filter(h => h.frequency[dayOfWeek]);
          const completed = scheduled.filter(h => h.completionLog[dStr]);
          if (scheduled.length > 0 && scheduled.length === completed.length) {
            consecutivePerfectDays++;
          } else if (scheduled.length === 0) {
            consecutivePerfectDays++; // No habits scheduled is technically perfect
          } else {
            break;
          }
        }
        shouldUnlock = consecutivePerfectDays >= 7;
        break;
      }
      case 'b30': { // Habit Ninja (21 days no missed scheduled habits)
        let cleanDays = 0;
        for (let i = 0; i < 21; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dStr = getLocalDateStr(d);
          const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1;
          
          const scheduled = habits.filter(h => h.frequency[dayOfWeek]);
          const missed = scheduled.some(h => !h.completionLog[dStr]);
          if (!missed) {
            cleanDays++;
          } else {
            break;
          }
        }
        shouldUnlock = cleanDays >= 21;
        break;
      }
      case 'b31': // Legendary
        shouldUnlock = unlockedBadgesCount >= 25;
        break;
    }

    if (shouldUnlock) {
      badge.unlocked = true;
      badge.unlockedAt = todayStr;
      badge.isNewUnlock = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

interface HabitState {
  habits: Habit[];
  badges: Badge[];
  isLoaded: boolean;
}

const initialState: HabitState = {
  habits: [],
  badges: [],
  isLoaded: false,
};

const habitSlice = createSlice({
  name: 'habits',
  initialState,
  reducers: {
    addHabit(
      state,
      action: PayloadAction<
        Omit<Habit, 'id' | 'currentStreak' | 'longestStreak' | 'completedToday' | 'completionLog' | 'createdAt'>
      >,
    ) {
      state.habits.push({
        ...action.payload,
        id: generateId(),
        currentStreak: 0,
        longestStreak: 0,
        completedToday: false,
        completionLog: {},
        createdAt: getLocalDateStr(),
      });
      evaluateBadges(state);
    },

    toggleHabit(state, action: PayloadAction<string>) {
      const habit = state.habits.find((h) => h.id === action.payload);
      if (!habit) return;

      const todayStr = getLocalDateStr();
      const newCompleted = !habit.completedToday;

      habit.completedToday = newCompleted;

      if (newCompleted) {
        habit.completionLog[todayStr] = new Date().toISOString();
        // Fire a celebration notification (async, non-blocking)
        fireCompletionNotification({ ...habit }).catch(() => {});
        // Recalculate — then guarantee at least 1 (handles off-schedule days)
        habit.currentStreak = Math.max(1, calculateStreak(habit.completionLog, habit.frequency));
      } else {
        delete habit.completionLog[todayStr];
        habit.currentStreak = calculateStreak(habit.completionLog, habit.frequency);
      }

      habit.longestStreak = Math.max(habit.longestStreak, habit.currentStreak);

      evaluateBadges(state);
    },

    deleteHabit(state, action: PayloadAction<string>) {
      state.habits = state.habits.filter((h) => h.id !== action.payload);
    },

    /**
     * Called when the app returns to the foreground on a new calendar day.
     * Resets completedToday based on today's completionLog entry and
     * recalculates each habit's streak from the full log.
     */
    rehydrateDay(state) {
      const todayStr = getLocalDateStr();
      state.habits = state.habits.map((habit) => {
        const currentStreak = calculateStreak(habit.completionLog, habit.frequency);
        return {
          ...habit,
          completedToday: !!habit.completionLog[todayStr],
          currentStreak,
          longestStreak: Math.max(habit.longestStreak, currentStreak),
        };
      });
    },

    editHabit(
      state,
      action: PayloadAction<{
        id: string;
        updates: Partial<Pick<Habit, 'title' | 'description' | 'category' | 'frequency' | 'targetDaysPerWeek' | 'alarms' | 'queuedNotificationIds' | 'queuedEodIds'>>;
      }>,
    ) {
      const habit = state.habits.find((h) => h.id === action.payload.id);
      if (habit) {
        Object.assign(habit, action.payload.updates);
      }
    },

    dismissNewBadge(state, action: PayloadAction<string>) {
      const badge = state.badges.find(b => b.id === action.payload);
      if (badge) {
        badge.isNewUnlock = false;
      }
    },

    markBadgesSeen(state) {
      state.badges.forEach(b => {
        if (b.isNewUnlock) b.isNewUnlock = false;
      });
    },

    /**
     * Install the result of a sync merge (computed by sync/mergeRemote.ts).
     * Not recorded in the outbox — see store/syncListener.ts — or every pulled
     * change would be echoed straight back to the server.
     */
    applyRemoteChanges(state, action: PayloadAction<{ habits: Habit[] }>) {
      state.habits = action.payload.habits;
      // Merged history from another device can unlock badges here too.
      evaluateBadges(state);
    },

    resetProgress(state) {
      state.habits = [];
      state.badges = JSON.parse(JSON.stringify(INITIAL_BADGES));
      state.isLoaded = true;
    },

  },

  extraReducers: (builder) => {
    builder.addCase(loadData.fulfilled, (state, action) => {
      state.habits = action.payload.habits;
      state.badges = action.payload.badges;
      evaluateBadges(state);
      state.isLoaded = true;
    });
  },
});

export const {
  addHabit,
  toggleHabit,
  deleteHabit,
  editHabit,
  rehydrateDay,
  dismissNewBadge,
  markBadgesSeen,
  resetProgress,
  applyRemoteChanges,
} = habitSlice.actions;

export const selectHasNewBadges = (state: any) => 
  state.habits.badges.some((b: any) => b.isNewUnlock);

export default habitSlice.reducer;
