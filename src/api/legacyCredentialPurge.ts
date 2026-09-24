/**
 * Purge plaintext credentials left behind by the old device-local "auth".
 *
 * Builds shipped between 2026-05-04 and 2026-09-03 stored the user's password
 * in plain text in AsyncStorage (and displayed it on "Forgot password").
 * Removing those screens did not remove the data, so the passwords are still
 * on users' devices. AsyncStorage is unencrypted — readable via device backup
 * or root — and people reuse passwords, so these must go.
 *
 * Runs on EVERY launch for EVERY user, whether or not they ever sign in to the
 * new cloud accounts. It is idempotent and costs one small batched read, so
 * there is deliberately no "already done" flag: a restored device backup could
 * bring the keys back, and a flag would stop us noticing.
 *
 * The old email is not a secret, so it is kept (on-device only, as before) as a
 * prefill hint for the new sign-up form, then cleared once an account exists.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAINTEXT_PASSWORD_KEYS = [
  '@atomicstep/password',
  '@habitflow/password',
] as const;

const LEGACY_EMAIL_KEYS = ['@atomicstep/email', '@habitflow/email'] as const;

export const LEGACY_EMAIL_HINT_KEY = '@atomicstep/legacyEmailHint';

export async function purgeLegacyCredentials(): Promise<void> {
  const keys = [...PLAINTEXT_PASSWORD_KEYS, ...LEGACY_EMAIL_KEYS];
  const entries = await AsyncStorage.multiGet(keys);
  const present = entries.filter(([, value]) => value !== null);
  if (present.length === 0) return;

  // Keep the first legacy email found as a non-secret prefill hint.
  const legacyEmail = present.find(([key]) =>
    (LEGACY_EMAIL_KEYS as readonly string[]).includes(key),
  )?.[1];
  if (legacyEmail) {
    await AsyncStorage.setItem(LEGACY_EMAIL_HINT_KEY, legacyEmail);
  }

  await AsyncStorage.multiRemove(present.map(([key]) => key));
}

export async function getLegacyEmailHint(): Promise<string | null> {
  return AsyncStorage.getItem(LEGACY_EMAIL_HINT_KEY);
}

export async function clearLegacyEmailHint(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_EMAIL_HINT_KEY);
}
