/**
 * Cloud backup — the one-time, non-destructive migration of this device's
 * local habits into the signed-in account (Phase 3).
 *
 * Non-destructive: nothing local is ever deleted or modified. AsyncStorage
 * stays the source of truth; this only copies it up.
 *
 * Safety rules are enforced HERE, not only in the UI, so no future caller can
 * bypass them:
 *   1. Never upload a device claimed by a different account (shared phones).
 *   2. Never make the first upload without explicit consent.
 *   3. Re-check the live session right before uploading, so an account switch
 *      mid-flight cannot send one person's data into another's account.
 *      (RLS would reject a mismatched user_id anyway; this fails earlier and
 *      with a clearer message.)
 *
 * Scope note for Phase 4: re-running a backup pushes new and edited habits
 * and new completions, but NOT deletions or un-completions — the upserts
 * never remove rows. Nothing reads cloud data back yet, so this is invisible
 * today; two-way sync must reconcile removals before anything is pulled.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from './authService';
import { runUpload, type BackupGateway, type UploadReport } from './backupUploader';
import { buildBackupPlan } from '../utils/backupPlan';
import { decideBackup, type BackupDecision, type CloudClaim } from '../utils/backupDecision';
import type { Habit } from '../types';

/** Removed by "Reset Progress" along with every other @atomicstep/ key. */
const CLAIM_KEY = '@atomicstep/cloudClaim';

export type BackupRefusal = 'unavailable' | 'otherOwner' | 'needsConsent' | 'sessionChanged';

export type BackupResult =
  | { ok: true; data: { report: UploadReport; claim: CloudClaim; skippedHabits: number; skippedEntries: number } }
  | { ok: false; error: string; refusal?: BackupRefusal; claim?: CloudClaim | null };

// ---------------------------------------------------------------------------
// Claim storage — parsed defensively; a corrupt record reads as "unclaimed",
// which is safe because the next upload then requires consent again.
// ---------------------------------------------------------------------------

function parseClaim(json: string | null): CloudClaim | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json);
    if (!value || typeof value.ownerUserId !== 'string' || typeof value.claimedAt !== 'string') {
      return null;
    }
    const last = value.lastUpload;
    const lastUpload =
      last && (last.status === 'complete' || last.status === 'failed') && typeof last.at === 'string'
        ? {
            status: last.status as 'complete' | 'failed',
            at: last.at as string,
            habits: Number(last.habits) || 0,
            completions: Number(last.completions) || 0,
          }
        : null;
    return { ownerUserId: value.ownerUserId, claimedAt: value.claimedAt, lastUpload };
  } catch {
    return null;
  }
}

export async function readClaim(): Promise<CloudClaim | null> {
  return parseClaim(await AsyncStorage.getItem(CLAIM_KEY));
}

async function writeClaim(claim: CloudClaim): Promise<void> {
  await AsyncStorage.setItem(CLAIM_KEY, JSON.stringify(claim));
}

// ---------------------------------------------------------------------------
// Supabase gateway
// ---------------------------------------------------------------------------

function friendlyBackupError(raw: string): string {
  const message = raw.toLowerCase();
  if (message.includes('network') || message.includes('fetch')) {
    return 'No connection. Your habits are safe on this phone, and backup will retry.';
  }
  if (message.includes('row-level security') || message.includes('jwt')) {
    return 'Your session expired. Sign in again to finish the backup.';
  }
  return 'Backup could not finish. Your habits are safe on this phone.';
}

function supabaseGateway(client: SupabaseClient): BackupGateway {
  return {
    async upsertHabits(rows) {
      const { data, error } = await client
        .from('habits')
        .upsert(rows, { onConflict: 'user_id,local_id' })
        .select('id, local_id');
      if (error) return { ok: false, error: friendlyBackupError(error.message) };
      return { ok: true, data: data ?? [] };
    },
    async insertCompletions(rows) {
      const { error } = await client
        .from('habit_completions')
        .upsert(rows, { onConflict: 'habit_id,completed_on', ignoreDuplicates: true });
      if (error) return { ok: false, error: friendlyBackupError(error.message) };
      return { ok: true, data: null };
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Where does this device stand for `userId`? A device with no habits is
 * claimed on the spot (there is nothing to consent to), so that habits added
 * later belong to this account rather than being up for grabs.
 */
export async function evaluateBackup(
  userId: string,
  habits: readonly Habit[],
): Promise<{ decision: BackupDecision; claim: CloudClaim | null }> {
  const claim = await readClaim();
  const decision = decideBackup({ userId, claim, habitCount: habits.length });

  if (decision !== 'claimSilently') return { decision, claim };

  const now = new Date().toISOString();
  const created: CloudClaim = {
    ownerUserId: userId,
    claimedAt: now,
    lastUpload: { status: 'complete', at: now, habits: 0, completions: 0 },
  };
  await writeClaim(created);
  return { decision: 'upToDate', claim: created };
}

let inFlight: { userId: string; promise: Promise<BackupResult> } | null = null;

/**
 * Copy this device's habits into `userId`'s account. `consent` must be true
 * for the first upload; afterwards the recorded claim stands in for it.
 *
 * Concurrent calls for the same account share one upload rather than racing.
 * A call for a DIFFERENT account (switch mid-upload) waits for the running
 * one to settle and then runs its own checks — it is never handed the other
 * account's result.
 */
export function backUpThisDevice(input: {
  userId: string;
  habits: readonly Habit[];
  consent: boolean;
}): Promise<BackupResult> {
  if (inFlight?.userId === input.userId) return inFlight.promise;

  const previous = inFlight?.promise ?? Promise.resolve(null);
  const promise = previous
    .catch(() => null)
    .then(() => performBackup(input))
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
  inFlight = { userId: input.userId, promise };
  return promise;
}

async function performBackup({
  userId,
  habits,
  consent,
}: {
  userId: string;
  habits: readonly Habit[];
  consent: boolean;
}): Promise<BackupResult> {
  if (!supabase) {
    return { ok: false, error: 'Backup is not available in this version of the app.', refusal: 'unavailable' };
  }

  if ((await getCurrentUserId()) !== userId) {
    return { ok: false, error: 'The signed-in account changed. Sign in again to back up.', refusal: 'sessionChanged' };
  }

  let claim = await readClaim();

  if (claim && claim.ownerUserId !== userId) {
    return {
      ok: false,
      error: "This phone's habits are already backed up to a different account.",
      refusal: 'otherOwner',
      claim,
    };
  }

  if (!claim) {
    if (!consent && habits.length > 0) {
      return { ok: false, error: 'Confirm the backup first.', refusal: 'needsConsent', claim };
    }
    // Record consent BEFORE uploading: if the app dies mid-upload, the next
    // launch resumes rather than asking again.
    claim = { ownerUserId: userId, claimedAt: new Date().toISOString(), lastUpload: null };
    await writeClaim(claim);
  }

  const plan = buildBackupPlan(userId, habits);
  const result = await runUpload(supabaseGateway(supabase), plan, userId);
  const at = new Date().toISOString();

  if (!result.ok) {
    const failed: CloudClaim = {
      ...claim,
      lastUpload: { status: 'failed', at, habits: 0, completions: 0 },
    };
    await writeClaim(failed);
    return { ok: false, error: result.error, claim: failed };
  }

  const completed: CloudClaim = {
    ...claim,
    lastUpload: {
      status: 'complete',
      at,
      habits: result.data.habitsUploaded,
      completions: result.data.completionsUploaded,
    },
  };
  await writeClaim(completed);

  return {
    ok: true,
    data: {
      report: result.data,
      claim: completed,
      skippedHabits: plan.skippedHabits.length,
      skippedEntries: plan.skippedCompletionEntries,
    },
  };
}
