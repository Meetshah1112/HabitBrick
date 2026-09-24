/**
 * The production SyncGateway: the sync_push / sync_pull RPCs over PostgREST.
 *
 * Its counterpart in supabase/tests/sync.integration.test.mjs calls the same
 * two SQL functions directly, which is what the two-device tests exercise.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Result } from '../types/social';
import type { PullResult, SyncGateway } from './syncEngine';

export function friendlySyncError(raw: string): string {
  const message = raw.toLowerCase();
  if (message.includes('network') || message.includes('fetch')) {
    return 'No connection. Your habits are safe on this phone and will sync later.';
  }
  if (message.includes('jwt') || message.includes('authenticated') || message.includes('row-level security')) {
    return 'Your session expired. Sign in again to keep syncing.';
  }
  if (message.includes('could not find the function') || message.includes('does not exist')) {
    // The app is newer than the database: migrations have not been applied.
    return 'Sync is not available right now. Your habits are safe on this phone.';
  }
  return 'Sync could not finish. Your habits are safe on this phone.';
}

function isPullShape(value: unknown): value is { habits: unknown[]; completions: unknown[]; server_time: string } {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.habits) && Array.isArray(v.completions) && typeof v.server_time === 'string';
}

export function supabaseSyncGateway(client: SupabaseClient): SyncGateway {
  return {
    async push(payload): Promise<Result<null>> {
      const { error } = await client.rpc('sync_push', {
        p_habits: payload.habits,
        p_completions: payload.completions,
      });
      if (error) return { ok: false, error: friendlySyncError(error.message) };
      return { ok: true, data: null };
    },

    async pull(since): Promise<Result<PullResult>> {
      const { data, error } = await client.rpc('sync_pull', { p_since: since });
      if (error) return { ok: false, error: friendlySyncError(error.message) };
      // Never trust the shape of external data; mergeRemote validates rows too.
      if (!isPullShape(data)) return { ok: false, error: friendlySyncError('unexpected response') };
      return {
        ok: true,
        data: {
          habits: data.habits as PullResult['habits'],
          completions: data.completions as PullResult['completions'],
          serverTime: data.server_time,
        },
      };
    },
  };
}
