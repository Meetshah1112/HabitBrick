/**
 * Backup decision — whose habits are on this device, and may we upload them?
 *
 * Local data belongs to the DEVICE, not to whoever happens to be signed in.
 * Signing out keeps habits on the phone (see store/authSlice.ts), so on a
 * shared phone the next person to sign in would otherwise have the previous
 * person's habits uploaded into their account.
 *
 * The rule: the first account to back up this device's data "claims" it, and
 * that first upload always needs explicit consent — it is the first time this
 * data leaves the phone, for users who were promised it never would. After
 * that, only the claiming account ever uploads it.
 *
 * Pure, so every branch is unit-tested.
 */

export interface CloudClaim {
  /** The account that consented to back up this device's habits. */
  ownerUserId: string;
  claimedAt: string;
  /** Null until an upload has been attempted after consent. */
  lastUpload: {
    status: 'complete' | 'failed';
    at: string;
    habits: number;
    completions: number;
  } | null;
}

export type BackupDecision =
  /** Unclaimed habits exist: ask before anything is sent. */
  | 'needsConsent'
  /** Nothing to upload: record the claim, no prompt needed. */
  | 'claimSilently'
  /** Another account claimed this device: never upload into this one. */
  | 'otherOwner'
  /** Consent given but the upload never finished (killed, offline, error). */
  | 'resumeUpload'
  | 'upToDate';

export function decideBackup(input: {
  userId: string;
  claim: CloudClaim | null;
  habitCount: number;
}): BackupDecision {
  const { userId, claim, habitCount } = input;

  if (claim) {
    if (claim.ownerUserId !== userId) return 'otherOwner';
    return claim.lastUpload?.status === 'complete' ? 'upToDate' : 'resumeUpload';
  }

  return habitCount > 0 ? 'needsConsent' : 'claimSilently';
}
