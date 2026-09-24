/**
 * The badge catalog: every badge the app can award, in display order.
 *
 * Lives outside habitSlice so pure modules (e.g. the social feed, which
 * renders a friend's badge unlock from its id) can use it without pulling in
 * storage and notification code. Treat as read-only; copy before mutating.
 */

import type { Badge } from '../types';

export const BADGE_CATALOG: readonly Badge[] = [
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
