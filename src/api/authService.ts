/**
 * Auth — email + password via Supabase.
 *
 * Every function returns a Result<T> rather than throwing, so screens are
 * forced to handle the failure path instead of relying on an error boundary.
 * Raw Supabase error strings are mapped to user-facing copy here and are
 * never shown to the user directly.
 */

import { supabase } from '../lib/supabase';
import type { Profile, ProfileSummary, Result } from '../types/social';

// ---------------------------------------------------------------------------
// Validation — enforced at the boundary, and again by the DB constraint
// ---------------------------------------------------------------------------

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

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
  if (message.includes('duplicate key') && message.includes('username')) {
    return 'That username is taken. Try another.';
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

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

export function onAuthStateChange(
  callback: (userId: string | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user?.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}

// ---------------------------------------------------------------------------
// Sign up / in / out
// ---------------------------------------------------------------------------

/**
 * Check a username before signup so the user gets an immediate answer rather
 * than a failed signup caused by the profile trigger hitting its unique index.
 *
 * Not authoritative — the unique index is. Two people racing for the same name
 * will still collide, and signUp() maps that collision to a friendly message.
 */
export async function isUsernameAvailable(
  username: string,
): Promise<Result<boolean>> {
  const invalid = validateUsername(username);
  if (invalid) return { ok: false, error: invalid };

  const { data, error } = await supabase.rpc('search_profiles', {
    q: username.trim(),
  });

  if (error) return { ok: false, error: friendlyAuthError(error.message) };

  const taken = (data as ProfileSummary[] | null)?.some(
    (p) => p.username.toLowerCase() === username.trim().toLowerCase(),
  );
  return { ok: true, data: !taken };
}

export async function signUp(
  email: string,
  password: string,
  username: string,
): Promise<Result<string>> {
  const emailError = validateEmail(email);
  if (emailError) return { ok: false, error: emailError };

  const passwordError = validatePassword(password);
  if (passwordError) return { ok: false, error: passwordError };

  const usernameError = validateUsername(username);
  if (usernameError) return { ok: false, error: usernameError };

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      // Read by the handle_new_user() trigger to seed public.profiles.
      data: { username: username.trim() },
    },
  });

  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  if (!data.user) return { ok: false, error: 'Could not create the account.' };

  return { ok: true, data: data.user.id };
}

export async function signIn(
  email: string,
  password: string,
): Promise<Result<string>> {
  const emailError = validateEmail(email);
  if (emailError) return { ok: false, error: emailError };
  if (!password) return { ok: false, error: 'Enter your password.' };

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  if (!data.user) return { ok: false, error: 'Could not sign in.' };

  return { ok: true, data: data.user.id };
}

export async function signOut(): Promise<Result<null>> {
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  return { ok: true, data: null };
}

export async function sendPasswordReset(email: string): Promise<Result<null>> {
  const emailError = validateEmail(email);
  if (emailError) return { ok: false, error: emailError };

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getMyProfile(): Promise<Result<Profile>> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
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
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
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
