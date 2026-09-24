/**
 * Milestones — what a user's friends see in their feed.
 *
 * Privacy rule (see supabase/migrations/0002_rls.sql): friends see
 * milestones, never habits. So a milestone carries only numbers and ids —
 * a streak length, a brick count, a tier key, a badge id — never a habit
 * title or anything else the user typed.
 *
 * The same rule protects the READER: payloads come from other people's
 * clients, so describeActivity() renders only from this app's own tables
 * (TIERS, BADGE_CATALOG) and validated numbers, and ignores any strings a
 * payload carries.
 *
 * Detection diffs before/after a user action, so milestones are posted as
 * they happen — history is never back-filled into friends' feeds when a user
 * first turns social on. Dedupe keys make re-sending harmless.
 *
 * Pure: no I/O, no React Native imports.
 */

import type { Badge, Habit } from '../types';
import type { ActivityPayload, ActivityType } from '../types/social';
import { countTotalBricks, getTierProgress, TIERS, type TierKey } from '../utils/bricks';
import { BADGE_CATALOG } from '../constants/badges';

export const STREAK_MILESTONES = [7, 30, 50, 100, 180, 365] as const;
export const BRICKS_PER_MILESTONE = 100;

/**
 * Category-mastery badges ("Healthy Living", "Money Maker", "Zen Master"...)
 * reveal WHAT KIND of habit someone tracks. Someone privately tracking a
 * health habit — medication, say — would have it announced to friends. They
 * stay private: never posted, and never rendered even if another client posts
 * one. Streak, total, time-of-day and consistency badges say nothing about
 * what the habits are, so those are shared.
 */
export const PRIVATE_BADGE_IDS: ReadonlySet<string> = new Set([
  'b18', 'b19', 'b20', 'b21', 'b22', 'b23', 'b24', 'b25',
]);

export interface MilestoneEvent {
  type: ActivityType;
  dedupeKey: string;
  payload: ActivityPayload;
}

interface Snapshot {
  habits: readonly Habit[];
  badges: readonly Badge[];
}

function highestCrossed(thresholds: readonly number[], before: number, after: number): number | null {
  let best: number | null = null;
  for (const t of thresholds) if (before < t && after >= t) best = t;
  return best;
}

function streakEvents(prev: readonly Habit[], next: readonly Habit[], today: string): MilestoneEvent[] {
  const before = new Map(prev.map((h) => [h.id, h.currentStreak]));
  const events: MilestoneEvent[] = [];
  for (const habit of next) {
    const reached = highestCrossed(STREAK_MILESTONES, before.get(habit.id) ?? 0, habit.currentStreak);
    if (reached === null) continue;
    events.push({
      type: 'streak_milestone',
      // Per day: reaching 7 again on a later run is a new achievement.
      dedupeKey: `streak:${habit.id}:${reached}:${today}`,
      payload: { streak: reached },
    });
  }
  return events;
}

function brickEvents(prev: readonly Habit[], next: readonly Habit[]): MilestoneEvent[] {
  const before = countTotalBricks(prev);
  const after = countTotalBricks(next);
  if (after <= before) return [];

  const events: MilestoneEvent[] = [];
  const fromTier = getTierProgress(before).currentTier;
  const toTier = getTierProgress(after).currentTier;
  if (toTier.threshold > fromTier.threshold) {
    events.push({
      type: 'tier_up',
      dedupeKey: `tier:${toTier.key}`, // once ever
      payload: { tierKey: toTier.key, bricks: toTier.threshold },
    });
  }

  const tierThresholds = new Set(TIERS.map((t) => t.threshold));
  const highestHundred = Math.floor(after / BRICKS_PER_MILESTONE) * BRICKS_PER_MILESTONE;
  if (highestHundred > before && highestHundred > 0 && !tierThresholds.has(highestHundred)) {
    events.push({
      type: 'brick_milestone',
      dedupeKey: `bricks:${highestHundred}`, // once ever
      payload: { bricks: highestHundred },
    });
  }
  return events;
}

function badgeEvents(prev: readonly Badge[], next: readonly Badge[]): MilestoneEvent[] {
  const wasUnlocked = new Set(prev.filter((b) => b.unlocked).map((b) => b.id));
  return next
    .filter((b) => b.unlocked && !wasUnlocked.has(b.id) && !PRIVATE_BADGE_IDS.has(b.id))
    .map((b) => ({ type: 'badge_unlock' as const, dedupeKey: `badge:${b.id}`, payload: { badgeId: b.id } }));
}

export function detectMilestones(prev: Snapshot, next: Snapshot, today: string): MilestoneEvent[] {
  if (prev.habits === next.habits && prev.badges === next.badges) return [];
  return [
    ...streakEvents(prev.habits, next.habits, today),
    ...brickEvents(prev.habits, next.habits),
    ...badgeEvents(prev.badges, next.badges),
  ];
}

// ---------------------------------------------------------------------------
// Rendering a friend's milestone
// ---------------------------------------------------------------------------

const TIER_EMOJI: Record<TierKey, string> = {
  foundation: '🌱',
  wall: '🧱',
  room: '🚪',
  house: '🏠',
  garden: '🌿',
  village: '🏘️',
  city: '🏙️',
  dreamMap: '✨',
};

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export function describeActivity(
  type: ActivityType,
  payload: ActivityPayload,
): { emoji: string; text: string } | null {
  switch (type) {
    case 'streak_milestone': {
      const streak = positiveInteger(payload.streak);
      return streak ? { emoji: '🔥', text: `hit a ${streak}-day streak` } : null;
    }
    case 'brick_milestone': {
      const bricks = positiveInteger(payload.bricks);
      return bricks ? { emoji: '🧱', text: `laid ${bricks.toLocaleString()} bricks` } : null;
    }
    case 'tier_up': {
      const tier = TIERS.find((t) => t.key === payload.tierKey);
      return tier ? { emoji: TIER_EMOJI[tier.key], text: `built ${tier.label}` } : null;
    }
    case 'badge_unlock': {
      if (payload.badgeId && PRIVATE_BADGE_IDS.has(payload.badgeId)) return null;
      const badge = BADGE_CATALOG.find((b) => b.id === payload.badgeId);
      return badge ? { emoji: '🏅', text: `unlocked the "${badge.title}" badge` } : null;
    }
    default:
      return null;
  }
}
