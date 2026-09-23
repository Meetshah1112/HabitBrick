/**
 * Supabase client — single shared instance for the whole app.
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
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

// Supabase is renaming "anon key" to "publishable key"; accept either so the
// app keeps working across the rename.
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in your .env file. ' +
      'See .env.example.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based session on mobile — there is no redirect to parse.
    detectSessionInUrl: false,
  },
});

// ---------------------------------------------------------------------------
// Token auto-refresh follows app foreground state.
//
// Supabase refreshes on a timer. Left running in the background it burns
// wakeups and can fire against a dead socket, so we stop it on background and
// restart on foreground.
// ---------------------------------------------------------------------------

let appStateSubscription: { remove: () => void } | null = null;

export function startAuthAutoRefresh(): () => void {
  // Guard against double-registration under Fast Refresh.
  if (appStateSubscription) return () => {};

  const handleChange = (state: AppStateStatus) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  };

  if (AppState.currentState === 'active') {
    supabase.auth.startAutoRefresh();
  }

  const sub = AppState.addEventListener('change', handleChange);
  appStateSubscription = sub;

  return () => {
    sub.remove();
    appStateSubscription = null;
    supabase.auth.stopAutoRefresh();
  };
}
