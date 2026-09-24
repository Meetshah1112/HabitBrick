import { decideBackup, type CloudClaim } from '../backupDecision';

const ALICE = 'alice-id';
const BOB = 'bob-id';

function claim(overrides: Partial<CloudClaim> = {}): CloudClaim {
  return {
    ownerUserId: ALICE,
    claimedAt: '2026-09-24T10:00:00.000Z',
    lastUpload: null,
    ...overrides,
  };
}

describe('decideBackup', () => {
  test('asks for consent before the first upload of existing habits', () => {
    // First time this device's data would leave the phone: never silent.
    expect(decideBackup({ userId: ALICE, claim: null, habitCount: 3 })).toBe('needsConsent');
  });

  test('claims silently when there is nothing on the device to upload', () => {
    expect(decideBackup({ userId: ALICE, claim: null, habitCount: 0 })).toBe('claimSilently');
  });

  test('never uploads a device claimed by a different account', () => {
    // Shared phone: Alice backed these habits up; Bob signs in afterwards.
    expect(decideBackup({ userId: BOB, claim: claim(), habitCount: 3 })).toBe('otherOwner');
  });

  test('refuses another account even when the device now has no habits', () => {
    expect(decideBackup({ userId: BOB, claim: claim(), habitCount: 0 })).toBe('otherOwner');
  });

  test('resumes an upload the owner consented to but never finished', () => {
    // Consent was recorded, then the app was killed mid-upload.
    expect(decideBackup({ userId: ALICE, claim: claim(), habitCount: 3 })).toBe('resumeUpload');
  });

  test('retries after a failed upload without asking again', () => {
    const failed = claim({
      lastUpload: { status: 'failed', at: '2026-09-24T10:05:00.000Z', habits: 0, completions: 0 },
    });
    expect(decideBackup({ userId: ALICE, claim: failed, habitCount: 3 })).toBe('resumeUpload');
  });

  test('is up to date once the owner upload completed', () => {
    const done = claim({
      lastUpload: { status: 'complete', at: '2026-09-24T10:05:00.000Z', habits: 3, completions: 40 },
    });
    expect(decideBackup({ userId: ALICE, claim: done, habitCount: 3 })).toBe('upToDate');
  });
});
