/**
 * Social layer types — mirror the Supabase schema in supabase/migrations/.
 *
 * Kept separate from types/index.ts so the existing local-only habit model
 * stays readable and free of network concerns.
 */

export interface Profile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

/** The trimmed shape returned by the search_profiles() RPC. */
export interface ProfileSummary {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;
  respondedAt: string | null;
}

/** A friendship resolved against the other party's profile, for list UI. */
export interface Friend {
  friendshipId: string;
  profile: ProfileSummary;
  status: FriendshipStatus;
  /** True when the other person asked us, so the UI can offer Accept/Decline. */
  isIncoming: boolean;
}

export type ActivityType =
  | 'brick_milestone'
  | 'streak_milestone'
  | 'badge_unlock'
  | 'tier_up';

/**
 * Payload is intentionally loose per type, but never carries a habit title —
 * see the privacy note in 0002_rls.sql. Milestones describe the achievement,
 * not the habit behind it.
 */
export interface ActivityPayload {
  /** streak_milestone: the streak length reached. */
  streak?: number;
  /** brick_milestone / tier_up: total bricks at the time of the event. */
  bricks?: number;
  /** tier_up: the tier key reached, e.g. 'house'. */
  tierKey?: string;
  /** tier_up: human label, e.g. 'Your House'. */
  tierLabel?: string;
  /** badge_unlock: badge id and title from the local badge list. */
  badgeId?: string;
  badgeTitle?: string;
}

export interface ActivityEvent {
  id: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  type: ActivityType;
  payload: ActivityPayload;
  createdAt: string;
  clapCount: number;
  iClapped: boolean;
}

export interface LeaderboardRow {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bricks: number;
}

/** Discriminated result so callers handle failure explicitly. */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
