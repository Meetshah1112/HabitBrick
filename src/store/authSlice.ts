/**
 * Auth state — who (if anyone) is signed in to the optional cloud account.
 *
 * Accounts are opt-in. `signedOut` is a normal, fully working state, not an
 * error: the app runs local-only until the user chooses to sign in.
 *
 * Signing out does NOT clear local habits. Local data belongs to the device,
 * not the account. Phase 3 note: that means migration must record which
 * account first claimed this device's data, and must not auto-upload it to a
 * DIFFERENT account that later signs in on the same (e.g. shared) device.
 */

import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { isCloudEnabled } from '../lib/supabase';
import { getCurrentUserId, getMyProfile, signOut } from '../api/authService';
import type { Profile } from '../types/social';

export type AuthStatus = 'unknown' | 'signedOut' | 'signedIn';

interface AuthState {
  /** 'unknown' only until the stored session has been read on boot. */
  status: AuthStatus;
  userId: string | null;
  profile: Profile | null;
  /** False in builds without cloud config: hide every account entry point. */
  isCloudEnabled: boolean;
}

const initialState: AuthState = {
  status: isCloudEnabled ? 'unknown' : 'signedOut',
  userId: null,
  profile: null,
  isCloudEnabled,
};

/** Read the persisted session once at boot. Makes no request when signed out. */
export const initAuth = createAsyncThunk('auth/init', async () => {
  return getCurrentUserId();
});

export const fetchProfile = createAsyncThunk(
  'auth/fetchProfile',
  async (_, { rejectWithValue }) => {
    const result = await getMyProfile();
    if (!result.ok) return rejectWithValue(result.error);
    return result.data;
  },
);

export const signOutUser = createAsyncThunk(
  'auth/signOut',
  async (_, { rejectWithValue }) => {
    const result = await signOut();
    if (!result.ok) return rejectWithValue(result.error);
    return null;
  },
);

function applyUser(state: AuthState, userId: string | null): void {
  // A different user (or none) means any cached profile is stale.
  if (state.userId !== userId) state.profile = null;
  state.userId = userId;
  state.status = userId ? 'signedIn' : 'signedOut';
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Dispatched by the Supabase onAuthStateChange listener. */
    authUserChanged(state, action: PayloadAction<string | null>) {
      applyUser(state, action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initAuth.fulfilled, (state, action) => {
        applyUser(state, action.payload);
      })
      .addCase(initAuth.rejected, (state) => {
        // Unreadable session: treat as signed out rather than hang on boot.
        applyUser(state, null);
      })
      .addCase(fetchProfile.fulfilled, (state, action) => {
        // Ignore a late response for a user who has since signed out.
        if (action.payload.id === state.userId) state.profile = action.payload;
      })
      .addCase(signOutUser.fulfilled, (state) => {
        applyUser(state, null);
      });
  },
});

export const { authUserChanged } = authSlice.actions;
export default authSlice.reducer;
