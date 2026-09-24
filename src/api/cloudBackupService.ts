/**
 * Device claim and consent — who may sync this device's habits.
 *
 * Local data belongs to the DEVICE, not to whoever is signed in (signing out
 * keeps habits on the phone). The first account to back up this device's data
 * "claims" it, the first upload always needs explicit consent, and only the
 * claiming account ever syncs it. See utils/backupDecision.ts.
 *
 * Phase 3 uploaded here directly. As of Phase 4 every write goes through the
 * sync engine (src/sync/), so there is exactly ONE path to the server and it
 * is the one that respects last-writer-wins; a second, non-LWW upload path
 * could overwrite newer edits made on another device.
 *
 * Safety rules are enforced HERE, not only in the UI:
 *   1. Never sync a device claimed by a different account (shared phones).
 *   2. Never make the first upload without explicit consent.
 *   3. Re-check the live session before claiming or syncing.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from './authService';
import { decideBackup, type BackupDecision, type CloudClaim } from '../utils/backupDecision';
import { buildFullOutbox, type Outbox } from '../sync/outbox';
import type { Habit } from '../types';

/** Removed by "Reset Progress" unless the reset is also erasing the cloud copy. */
export const CLAIM_KEY = '@atomicstep/cloudClaim';

export type BackupRefusal = 'unavailable' | 'otherOwner' | 'needsConsent' | 'sessionChanged';

const REFUSAL_MESSAGES: Record<BackupRefusal, string> = {
  unavailable: 'Sync is not available in this version of the app.',
  otherOwner: "This phone's habits are already backed up to a different account.",
  needsConsent: 'Confirm the backup first.',
  sessionChanged: 'The signed-in account changed. Sign in again to sync.',
};

export function refusalMessage(refusal: BackupRefusal): string {
  return REFUSAL_MESSAGES[refusal];
}

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
// Decisions
// ---------------------------------------------------------------------------

/**
 * Where does this device stand for `userId`? A device with no habits is
 * claimed on the spot (there is nothing to consent to), so that habits added
 * later — or restored from the account — belong to this account.
 */
export async function evaluateBackup(
  userId: string,
  habits: readonly Habit[],
): Promise<{ decision: BackupDecision; claim: CloudClaim | null }> {
  const claim = await readClaim();
  const decision = decideBackup({ userId, claim, habitCount: habits.length });

  if (decision !== 'claimSilently') return { decision, claim };

  const now = new Date().toISOString();
  const created: CloudClaim = { ownerUserId: userId, claimedAt: now, lastUpload: null };
  await writeClaim(created);
  return { decision: 'resumeUpload', claim: created };
}

/** May `userId` sync this device right now? Null means yes. */
export async function checkSyncAccess(userId: string): Promise<BackupRefusal | null> {
  if (!supabase) return 'unavailable';
  if ((await getCurrentUserId()) !== userId) return 'sessionChanged';
  const claim = await readClaim();
  if (!claim) return 'needsConsent';
  if (claim.ownerUserId !== userId) return 'otherOwner';
  return null;
}

export type ClaimResult =
  | { ok: true; claim: CloudClaim; fullOutbox: Outbox }
  | { ok: false; refusal: BackupRefusal; error: string };

/**
 * Claim this device for `userId` (after consent) and return everything on it
 * as an outbox for the first sync. Nothing local is modified.
 */
export async function claimDevice(input: {
  userId: string;
  habits: readonly Habit[];
  consent: boolean;
}): Promise<ClaimResult> {
  const refuse = (refusal: BackupRefusal): ClaimResult => ({
    ok: false,
    refusal,
    error: refusalMessage(refusal),
  });

  if (!supabase) return refuse('unavailable');
  if ((await getCurrentUserId()) !== input.userId) return refuse('sessionChanged');

  let claim = await readClaim();
  if (claim && claim.ownerUserId !== input.userId) return refuse('otherOwner');

  if (!claim) {
    if (!input.consent && input.habits.length > 0) return refuse('needsConsent');
    // Record consent BEFORE syncing: if the app dies mid-sync, the next
    // launch resumes rather than asking again.
    claim = { ownerUserId: input.userId, claimedAt: new Date().toISOString(), lastUpload: null };
    await writeClaim(claim);
  }

  return { ok: true, claim, fullOutbox: buildFullOutbox(input.habits, new Date().toISOString()) };
}

/** Remember the outcome of the last sync round, for status text after a relaunch. */
export async function recordSyncResult(
  userId: string,
  result: { ok: true; habits: number; completions: number } | { ok: false },
): Promise<CloudClaim | null> {
  const claim = await readClaim();
  if (!claim || claim.ownerUserId !== userId) return claim;
  const at = new Date().toISOString();
  const updated: CloudClaim = {
    ...claim,
    lastUpload: result.ok
      ? { status: 'complete', at, habits: result.habits, completions: result.completions }
      : { status: 'failed', at, habits: 0, completions: 0 },
  };
  await writeClaim(updated);
  return updated;
}
