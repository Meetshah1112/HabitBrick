/**
 * Auth — email + password via Supabase.
 *
 * Every function returns a Result<T> rather than throwing, so screens are
 * forced to handle the failure path instead of relying on an error boundary.
 * Raw Supabase error strings are mapped to user-facing copy here and are
 * never shown to the user directly.
 *
 * Accounts are optional (see lib/supabase.ts). When the build has no cloud
 * config, `supabase` is null and every call here returns UNAVAILABLE instead
 * of crashing.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearLegacyEmailHint } from './legacyCredentialPurge';
import { MIN_PASSWORD_LENGTH } from '../utils/passwordStrength';
import type { Profile, Result } from '../types/social';

const UNAVAILABLE = 'Accounts are not available in this version of the app.';

function unavailable<T>(): Result<T> {
  return { ok: false, error: UNAVAILABLE };
}

// ---------------------------------------------------------------------------
// Validation — enforced at the boundary, and again by the DB constraint
// ---------------------------------------------------------------------------

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (!trimmed) return 'Pick a username.';
  if (trimmed.length < 3) return 'Username must be at least 3 characters.';
  if (trimmed.length > 20) return 'Username must be 20 characters or fewer.';
  if (!USERNAME_PATTERN.test(trimmed)) {
    return 'Use only letters, numbers and underscores.';
  }
  return null;
}

export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Enter your email.';
  if (!EMAIL_PATTERN.test(email.trim())) return 'That email does not look right.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Enter a password.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Error mapping — Supabase strings are for us, not for the user
// ---------------------------------------------------------------------------

function friendlyAuthError(raw: string): string {
  const message = raw.toLowerCase();

  if (message.includes('invalid login credentials')) {
    return 'That email or password is not right.';
  }
  if (message.includes('email not confirmed')) {
    return 'Check your inbox and confirm your email first.';
  }
  if (
    message.includes('user already registered') ||
    message.includes('already been registered')
  ) {
    return 'An account with that email already exists. Try signing in.';
  }
  // The profile trigger hitting the username unique index surfaces as this
  // generic message. Only reachable if two people race for the same name
  // after both passed the username_available() pre-check.
  if (message.includes('database error saving new user')) {
    return 'That username was just taken. Try another.';
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'No connection. Your habits still work offline.';
  }
  return 'Something went wrong. Please try again.';
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.user?.id ?? null;
}

export function onAuthStateChange(
  callback: (userId: string | null) => void,
): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user?.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}

// ---------------------------------------------------------------------------
// Sign up / in / out
// ---------------------------------------------------------------------------

/**
 * Pre-check so the form can tell the user a name is taken before they submit.
 * Uses username_available() (granted to anon), not search_profiles() — the
 * user is not authenticated yet at this point.
 *
 * Not authoritative: the unique index is. A race is still possible, and
 * signUp() maps that collision to a friendly message.
 */
export async function isUsernameAvailable(
  username: string,
): Promise<Result<boolean>> {
  if (!supabase) return unavailable();

  const invalid = validateUsername(username);
  if (invalid) return { ok: false, error: invalid };

  const { data, error } = await supabase.rpc('username_available', {
    name: username.trim(),
  });

  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  return { ok: true, data: data === true };
}

export interface SignUpOutcome {
  userId: string;
  /**
   * Supabase requires email confirmation by default. When true there is no
   * session yet — the user must tap the link in their inbox, then sign in.
   */
  needsEmailConfirmation: boolean;
}

export async function signUp(input: {
  email: string;
  password: string;
  username: string;
  displayName?: string;
}): Promise<Result<SignUpOutcome>> {
  if (!supabase) return unavailable();

  const emailError = validateEmail(input.email);
  if (emailError) return { ok: false, error: emailError };

  const passwordError = validatePassword(input.password);
  if (passwordError) return { ok: false, error: passwordError };

  const usernameError = validateUsername(input.username);
  if (usernameError) return { ok: false, error: usernameError };

  const displayName = input.displayName?.trim();

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      // Read by the handle_new_user() trigger to seed public.profiles.
      data: {
        username: input.username.trim(),
        ...(displayName ? { display_name: displayName } : {}),
      },
    },
  });

  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  if (!data.user) return { ok: false, error: 'Could not create the account.' };

  // An account now exists, so the old local-only email hint has done its job.
  await clearLegacyEmailHint().catch(() => {});

  return {
    ok: true,
    data: { userId: data.user.id, needsEmailConfirmation: !data.session },
  };
}

export async function signIn(
  email: string,
  password: string,
): Promise<Result<string>> {
  if (!supabase) return unavailable();

  const emailError = validateEmail(email);
  if (emailError) return { ok: false, error: emailError };
  if (!password) return { ok: false, error: 'Enter your password.' };

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  if (!data.user) return { ok: false, error: 'Could not sign in.' };

  await clearLegacyEmailHint().catch(() => {});
  return { ok: true, data: data.user.id };
}

export async function signOut(): Promise<Result<null>> {
  if (!supabase) return unavailable();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  return { ok: true, data: null };
}

/**
 * Sends a reset link by email.
 *
 * Account enumeration is prevented server-side: Supabase returns success for
 * an unregistered address, so the success copy must stay neutral ("if an
 * account exists..."). The errors that DO come back — network failure, rate
 * limiting, server errors — reveal nothing about who is registered, so they
 * are surfaced. Reporting a failed request as "link on its way" would leave
 * an offline user waiting for an email that was never sent.
 */
export async function sendPasswordReset(email: string): Promise<Result<null>> {
  if (!supabase) return unavailable();

  const emailError = validateEmail(email);
  if (emailError) return { ok: false, error: emailError };

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

async function currentUserId(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

export async function getMyProfile(): Promise<Result<Profile>> {
  if (!supabase) return unavailable();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, created_at')
    .eq('id', userId)
    .single();

  if (error) return { ok: false, error: friendlyAuthError(error.message) };

  return {
    ok: true,
    data: {
      id: data.id,
      username: data.username,
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
      createdAt: data.created_at,
    },
  };
}

export async function updateMyProfile(updates: {
  displayName?: string;
  avatarUrl?: string;
}): Promise<Result<null>> {
  if (!supabase) return unavailable();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: 'Not signed in.' };

  const patch: Record<string, string> = {};
  if (updates.displayName !== undefined) {
    patch.display_name = updates.displayName.trim();
  }
  if (updates.avatarUrl !== undefined) patch.avatar_url = updates.avatarUrl;
  if (Object.keys(patch).length === 0) return { ok: true, data: null };

  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  return { ok: true, data: null };
}
