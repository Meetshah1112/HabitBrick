/**
 * Social — friends, the milestone feed, claps and the weekly leaderboard.
 *
 * Friendships are created and accepted ONLY through the SQL functions
 * send_friend_request / respond_to_friend_request (migration 0007): the
 * database refuses direct writes, which is what enforces consent. Every
 * response is validated before use — these rows describe OTHER people and
 * come from the network — and every call returns a Result<T>.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type {
  ActivityEvent,
  ActivityPayload,
  ActivityType,
  Friend,
  FriendshipStatus,
  LeaderboardRow,
  ProfileSummary,
  Result,
} from '../types/social';
import type { MilestoneEvent } from '../social/milestones';

export interface BlockedUser {
  userId: string;
  username: string;
  displayName: string | null;
}

const FEED_PAGE_SIZE = 30;
const MIN_SEARCH_LENGTH = 3;
const ACTIVITY_TYPES: readonly ActivityType[] = ['brick_milestone', 'streak_milestone', 'badge_unlock', 'tier_up'];
const FRIENDSHIP_STATUSES: readonly FriendshipStatus[] = ['pending', 'accepted', 'blocked'];

const UNAVAILABLE: Result<never> = { ok: false, error: 'Social features are not available in this version of the app.' };

/** Messages our own SQL raises are written for users; anything else is not shown. */
const KNOWN_MESSAGES = [
  'You cannot befriend yourself',
  'Could not send the request',
  'Friend request not found',
  'You cannot block yourself',
];

function friendlyError(raw: string): string {
  const known = KNOWN_MESSAGES.find((m) => raw.includes(m));
  if (known) return known === 'Friend request not found' ? 'That request is no longer there.' : `${known}.`;
  const message = raw.toLowerCase();
  if (message.includes('network') || message.includes('fetch')) return 'No connection. Try again when you are online.';
  if (message.includes('jwt') || message.includes('not signed in')) return 'Your session expired. Sign in again.';
  return 'Something went wrong. Please try again.';
}

function fail<T>(error: { message: string }): Result<T> {
  return { ok: false, error: friendlyError(error.message) };
}

// ---------------------------------------------------------------------------
// Validation of rows about other people
// ---------------------------------------------------------------------------

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const optionalString = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function toProfileSummary(row: Record<string, unknown>, idKey = 'id'): ProfileSummary | null {
  if (!isString(row[idKey]) || !isString(row.username)) return null;
  return {
    id: row[idKey] as string,
    username: row.username as string,
    displayName: optionalString(row.display_name),
    avatarUrl: optionalString(row.avatar_url),
  };
}

function rowsOf(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? data.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object') : [];
}

function toPayload(value: unknown): ActivityPayload {
  // Keep only fields describeActivity() knows; it validates them again.
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  const payload: ActivityPayload = {};
  if (typeof v.streak === 'number') payload.streak = v.streak;
  if (typeof v.bricks === 'number') payload.bricks = v.bricks;
  if (typeof v.tierKey === 'string') payload.tierKey = v.tierKey;
  if (typeof v.badgeId === 'string') payload.badgeId = v.badgeId;
  return payload;
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

export async function searchProfiles(query: string): Promise<Result<ProfileSummary[]>> {
  if (!supabase) return UNAVAILABLE;
  const q = query.trim();
  if (q.length < MIN_SEARCH_LENGTH) return { ok: true, data: [] };
  const { data, error } = await supabase.rpc('search_profiles', { q });
  if (error) return fail(error);
  return { ok: true, data: rowsOf(data).map((r) => toProfileSummary(r)).filter((p): p is ProfileSummary => !!p) };
}

export async function listFriendships(): Promise<Result<Friend[]>> {
  if (!supabase) return UNAVAILABLE;
  const { data, error } = await supabase.rpc('my_friendships');
  if (error) return fail(error);

  const friends: Friend[] = [];
  for (const row of rowsOf(data)) {
    const profile = toProfileSummary(row, 'other_id');
    const status = row.status as FriendshipStatus;
    if (!profile || !isString(row.friendship_id) || !FRIENDSHIP_STATUSES.includes(status)) continue;
    friends.push({ friendshipId: row.friendship_id as string, profile, status, isIncoming: row.direction === 'incoming' });
  }
  return { ok: true, data: friends };
}

export async function listBlocked(): Promise<Result<BlockedUser[]>> {
  if (!supabase) return UNAVAILABLE;
  const { data, error } = await supabase.rpc('my_blocks');
  if (error) return fail(error);
  const blocked = rowsOf(data)
    .filter((r) => isString(r.blocked_id) && isString(r.username))
    .map((r) => ({ userId: r.blocked_id as string, username: r.username as string, displayName: optionalString(r.display_name) }));
  return { ok: true, data: blocked };
}

async function rpcVoid(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Result<null>> {
  const { error } = await client.rpc(fn, args);
  return error ? fail(error) : { ok: true, data: null };
}

export async function sendFriendRequest(userId: string): Promise<Result<null>> {
  if (!supabase) return UNAVAILABLE;
  return rpcVoid(supabase, 'send_friend_request', { target: userId });
}

export async function respondToFriendRequest(friendshipId: string, accept: boolean): Promise<Result<null>> {
  if (!supabase) return UNAVAILABLE;
  return rpcVoid(supabase, 'respond_to_friend_request', { request_id: friendshipId, accept });
}

/** Cancel a sent request, or unfriend. Removing can never create a friendship. */
export async function removeFriendship(friendshipId: string): Promise<Result<null>> {
  if (!supabase) return UNAVAILABLE;
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  return error ? fail(error) : { ok: true, data: null };
}

export async function blockUser(userId: string): Promise<Result<null>> {
  if (!supabase) return UNAVAILABLE;
  return rpcVoid(supabase, 'block_user', { target: userId });
}

export async function unblockUser(userId: string): Promise<Result<null>> {
  if (!supabase) return UNAVAILABLE;
  const { data: auth } = await supabase.auth.getSession();
  const me = auth.session?.user?.id;
  if (!me) return { ok: false, error: 'Sign in again.' };
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', userId);
  return error ? fail(error) : { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Feed, claps, leaderboard
// ---------------------------------------------------------------------------

export async function fetchFeed(before?: string): Promise<Result<ActivityEvent[]>> {
  if (!supabase) return UNAVAILABLE;
  const { data, error } = await supabase.rpc('friend_feed', { limit_n: FEED_PAGE_SIZE, before_ts: before ?? null });
  if (error) return fail(error);

  const events: ActivityEvent[] = [];
  for (const row of rowsOf(data)) {
    const type = row.type as ActivityType;
    if (!isString(row.id) || !isString(row.user_id) || !isString(row.username) || !isString(row.created_at)) continue;
    if (!ACTIVITY_TYPES.includes(type)) continue;
    events.push({
      id: row.id as string,
      userId: row.user_id as string,
      username: row.username as string,
      displayName: optionalString(row.display_name),
      avatarUrl: optionalString(row.avatar_url),
      type,
      payload: toPayload(row.payload),
      createdAt: row.created_at as string,
      clapCount: Math.max(0, Number(row.clap_count) || 0),
      iClapped: row.i_clapped === true,
    });
  }
  return { ok: true, data: events };
}

export async function setClap(eventId: string, clapped: boolean): Promise<Result<null>> {
  if (!supabase) return UNAVAILABLE;
  const { data: auth } = await supabase.auth.getSession();
  const me = auth.session?.user?.id;
  if (!me) return { ok: false, error: 'Sign in again.' };

  const { error } = clapped
    ? await supabase.from('claps').upsert({ event_id: eventId, user_id: me }, { onConflict: 'event_id,user_id', ignoreDuplicates: true })
    : await supabase.from('claps').delete().eq('event_id', eventId).eq('user_id', me);
  return error ? fail(error) : { ok: true, data: null };
}

export async function fetchLeaderboard(sinceDate: string): Promise<Result<LeaderboardRow[]>> {
  if (!supabase) return UNAVAILABLE;
  const { data, error } = await supabase.rpc('friends_leaderboard', { since_date: sinceDate });
  if (error) return fail(error);
  const board = rowsOf(data)
    .filter((r) => isString(r.user_id) && isString(r.username))
    .map((r) => ({
      userId: r.user_id as string,
      username: r.username as string,
      displayName: optionalString(r.display_name),
      avatarUrl: optionalString(r.avatar_url),
      bricks: Math.max(0, Number(r.bricks) || 0),
    }));
  return { ok: true, data: board };
}

/** Post milestones; ones already posted are ignored by the dedupe key. */
export async function postMilestones(userId: string, events: readonly MilestoneEvent[]): Promise<Result<null>> {
  if (!supabase) return UNAVAILABLE;
  if (events.length === 0) return { ok: true, data: null };
  const rows = events.map((e) => ({ user_id: userId, type: e.type, payload: e.payload, dedupe_key: e.dedupeKey }));
  const { error } = await supabase
    .from('activity_events')
    .upsert(rows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
  return error ? fail(error) : { ok: true, data: null };
}
