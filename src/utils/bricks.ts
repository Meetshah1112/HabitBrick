/**
 * Brick System — pure utilities for converting habit completions into a
 * tangible "you're building a dream life" progression.
 *
 * Rules (locked, from product spec):
 *   1 completed habit  = 1 brick
 *   10 bricks          = 1 wall
 *   100 bricks         = 1 room
 *   1000 bricks        = 1 house
 *
 * Higher tiers are designed to stay reachable within ~1 year of consistency
 * once the first House is built (3 habits/day = ~1000 bricks/year):
 *   2000 bricks        = Garden  (year ~2)
 *   5000 bricks        = Village (year ~5)
 *   10 000 bricks      = City    (year ~10)
 *   25 000 bricks      = Dream Life Map (lifetime)
 */

import type { Habit } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BRICKS_PER_WALL = 10;
export const BRICKS_PER_ROOM = 100;
export const BRICKS_PER_HOUSE = 1000;

export type TierKey =
  | 'foundation'
  | 'wall'
  | 'room'
  | 'house'
  | 'garden'
  | 'village'
  | 'city'
  | 'dreamMap';

export interface Tier {
  key: TierKey;
  /** Threshold in total bricks to *reach* this tier. */
  threshold: number;
  /** Display name shown to the user. */
  label: string;
  /** Short one-liner shown on the milestone ladder. */
  description: string;
  /** Emoji used as the tier glyph in the ladder. */
  glyph: string;
}

export const TIERS: readonly Tier[] = [
  { key: 'foundation', threshold: 0,     label: 'Foundation',     description: 'Your land is ready. Lay your first brick.',           glyph: '·' },
  { key: 'wall',       threshold: 10,    label: 'First Wall',     description: '10 bricks. A wall stands where there was nothing.',   glyph: '▭' },
  { key: 'room',       threshold: 100,   label: 'First Room',     description: '100 bricks. Four walls and a roof — a room of your own.', glyph: '▢' },
  { key: 'house',      threshold: 1000,  label: 'Your House',     description: '1,000 bricks. A house built one habit at a time.',    glyph: '⌂' },
  { key: 'garden',     threshold: 2000,  label: 'Garden',         description: '2,000 bricks. Your house gets a garden around it.',   glyph: '✿' },
  { key: 'village',    threshold: 5000,  label: 'Village',        description: '5,000 bricks. Neighbours arrive. A village forms.',   glyph: '⌂⌂' },
  { key: 'city',       threshold: 10000, label: 'City',           description: '10,000 bricks. Skyline takes shape.',                 glyph: '🏙' },
  { key: 'dreamMap',   threshold: 25000, label: 'Dream Life Map', description: '25,000 bricks. The full life you imagined.',         glyph: '✦' },
] as const;

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

/**
 * Total bricks earned across all habits.
 * Each truthy entry in a habit's completionLog counts as 1 brick.
 *
 * The completionLog values can be either `true` (legacy) or an ISO timestamp
 * string (current) — both are truthy and both count.
 */
export function countTotalBricks(habits: readonly Habit[]): number {
  let total = 0;
  for (const habit of habits) {
    for (const key in habit.completionLog) {
      if (habit.completionLog[key]) total++;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------

export interface TierProgress {
  /** The highest tier the user has currently reached. */
  currentTier: Tier;
  /** The next tier ahead (null if user is at the top tier). */
  nextTier: Tier | null;
  /** Bricks since reaching currentTier. */
  bricksIntoTier: number;
  /** Bricks needed for the next tier (0 if at top). */
  bricksToNext: number;
  /** Progress to next tier as a value between 0 and 1 (1 if at top). */
  progress: number;
}

export function getTierProgress(totalBricks: number): TierProgress {
  // Walk tiers ascending and pick the highest one whose threshold <= bricks.
  let currentIndex = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (totalBricks >= TIERS[i].threshold) currentIndex = i;
  }

  const currentTier = TIERS[currentIndex];
  const nextTier = currentIndex + 1 < TIERS.length ? TIERS[currentIndex + 1] : null;

  if (!nextTier) {
    return { currentTier, nextTier: null, bricksIntoTier: totalBricks - currentTier.threshold, bricksToNext: 0, progress: 1 };
  }

  const span = nextTier.threshold - currentTier.threshold;
  const bricksIntoTier = totalBricks - currentTier.threshold;
  const bricksToNext = nextTier.threshold - totalBricks;
  const progress = Math.min(1, Math.max(0, bricksIntoTier / span));

  return { currentTier, nextTier, bricksIntoTier, bricksToNext, progress };
}

// ---------------------------------------------------------------------------
// Decomposition — pure derived counts for the scene
// ---------------------------------------------------------------------------

export interface BrickBreakdown {
  total: number;
  /** Whole houses built (each = 1000 bricks). */
  houses: number;
  /** Whole rooms left over after houses (0–9). */
  rooms: number;
  /** Whole walls left over after rooms (0–9). */
  walls: number;
  /** Loose bricks left over after walls (0–9). */
  looseBricks: number;
}

/**
 * Decompose total bricks into the largest assemblies first:
 * houses → rooms → walls → loose bricks.
 * Useful for building the scene without rendering thousands of nodes.
 */
export function decomposeBricks(totalBricks: number): BrickBreakdown {
  const safe = Math.max(0, Math.floor(totalBricks));
  const houses = Math.floor(safe / BRICKS_PER_HOUSE);
  let remainder = safe - houses * BRICKS_PER_HOUSE;
  const rooms = Math.floor(remainder / BRICKS_PER_ROOM);
  remainder -= rooms * BRICKS_PER_ROOM;
  const walls = Math.floor(remainder / BRICKS_PER_WALL);
  remainder -= walls * BRICKS_PER_WALL;
  return { total: safe, houses, rooms, walls, looseBricks: remainder };
}
