/**
 * Supabase client — single shared instance for the whole app.
 *
 * LOCAL-FIRST CONTRACT: accounts are optional. A user who never signs in must
 * get a fully working app and generate zero network traffic. Two consequences:
 *
 *   1. Missing config must NOT crash the app. If the env vars are absent (e.g.
 *      an EAS build without them), `supabase` is null and cloud features report
 *      themselves unavailable. Throwing at import time would take the whole app
 *      down for local-only users who never asked for an account.
 *   2. With no stored session, supabase-js makes no requests: there is nothing
 *      to refresh. Network activity starts only once the user signs in.
 *
 * Storage adapter: AsyncStorage rather than Expo's newer
 * `expo-sqlite/localStorage`. AsyncStorage is already a native dependency of
 * this app, so the auth layer stays pure-JS and needs no EAS rebuild.
 *
 * Both env values are public by design. They are safe to ship: Row Level
 * Security (see supabase/migrations/0002_rls.sql) is what actually keeps
 * user data private, not the secrecy of these keys.
 */

import 'react-native-url-polyfill/auto';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

// Supabase is renaming "anon key" to "publishable key"; accept either so the
// app keeps working across the rename.
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True when this build has cloud config. False means local-only mode. */
export const isCloudEnabled = Boolean(supabaseUrl && supabaseKey);

if (!isCloudEnabled && __DEV__) {
  console.warn(
    '[supabase] Cloud features disabled: set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env (see .env.example). ' +
      'The app still runs in local-only mode.',
  );
}

export const supabase: SupabaseClient | null = isCloudEnabled
  ? createClient(supabaseUrl as string, supabaseKey as string, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // No URL-based session on mobile — there is no redirect to parse.
        detectSessionInUrl: false,
      },
    })
  : null;

// ---------------------------------------------------------------------------
// Token auto-refresh follows app foreground state.
//
// Supabase refreshes on a timer. Left running in the background it burns
// wakeups and can fire against a dead socket, so we stop it on background and
// restart on foreground.
// ---------------------------------------------------------------------------

let appStateSubscription: { remove: () => void } | null = null;

export function startAuthAutoRefresh(): () => void {
  const client = supabase;
  // No client, or already registered (Fast Refresh re-runs effects).
  if (!client || appStateSubscription) return () => {};

  const handleChange = (state: AppStateStatus) => {
    if (state === 'active') {
      client.auth.startAutoRefresh();
    } else {
      client.auth.stopAutoRefresh();
    }
  };

  if (AppState.currentState === 'active') {
    client.auth.startAutoRefresh();
  }

  const sub = AppState.addEventListener('change', handleChange);
  appStateSubscription = sub;

  return () => {
    sub.remove();
    appStateSubscription = null;
    client.auth.stopAutoRefresh();
  };
}
