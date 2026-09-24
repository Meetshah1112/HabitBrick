/**
 * Backup status for the UI — mirrors cloudBackupService, holds no truth of
 * its own. The persisted claim (AsyncStorage) is the source of truth; this
 * slice only reflects it so screens can render.
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { evaluateBackup, backUpThisDevice, type BackupRefusal } from '../api/cloudBackupService';
import { buildBackupPlan } from '../utils/backupPlan';
import type { BackupDecision } from '../utils/backupDecision';
import { authUserChanged, signOutUser } from './authSlice';
import type { Habit } from '../types';

export type BackupStatus =
  | 'idle'
  | 'needsConsent'
  | 'uploading'
  | 'upToDate'
  | 'failed'
  | 'otherOwner';

interface BackupState {
  /** Whose status this is. Token refreshes re-fire authUserChanged for the
   *  same user, so state resets only when the account actually changes. */
  forUserId: string | null;
  status: BackupStatus;
  /** What the consent screen will upload; recomputed on every evaluation. */
  pendingHabits: number;
  pendingCompletions: number;
  lastBackupAt: string | null;
  error: string | null;
}

const initialState: BackupState = {
  forUserId: null,
  status: 'idle',
  pendingHabits: 0,
  pendingCompletions: 0,
  lastBackupAt: null,
  error: null,
};

type ThunkState = {
  auth: { userId: string | null };
  habits: { habits: Habit[]; isLoaded: boolean };
};

/**
 * Re-read the claim and decide. `userId` may be passed explicitly because
 * right after sign-in the auth listener may not have updated the store yet.
 * Returns null (no change) until local habits have loaded — deciding against
 * an empty, not-yet-loaded list would silently claim the device with nothing.
 */
export const refreshBackupStatus = createAsyncThunk<
  {
    userId: string;
    decision: BackupDecision;
    lastBackupAt: string | null;
    habits: number;
    completions: number;
  } | null,
  string | undefined,
  { state: ThunkState }
>('backup/refresh', async (explicitUserId, { getState }) => {
  const { auth, habits } = getState();
  const userId = explicitUserId ?? auth.userId;
  if (!userId || !habits.isLoaded) return null;

  const { decision, claim } = await evaluateBackup(userId, habits.habits);
  const plan = buildBackupPlan(userId, habits.habits);
  return {
    userId,
    decision,
    lastBackupAt: claim?.lastUpload?.status === 'complete' ? claim.lastUpload.at : null,
    habits: plan.habitCount,
    completions: plan.completionCount,
  };
});

export const backUpNow = createAsyncThunk<
  { lastBackupAt: string },
  { consent: boolean },
  { state: ThunkState; rejectValue: { error: string; refusal?: BackupRefusal } }
>('backup/run', async ({ consent }, { getState, rejectWithValue }) => {
  const { auth, habits } = getState();
  if (!auth.userId) return rejectWithValue({ error: 'Sign in to back up.' });
  if (!habits.isLoaded) return rejectWithValue({ error: 'Your habits are still loading.' });

  const result = await backUpThisDevice({ userId: auth.userId, habits: habits.habits, consent });
  if (!result.ok) return rejectWithValue({ error: result.error, refusal: result.refusal });
  return { lastBackupAt: result.data.claim.lastUpload?.at ?? new Date().toISOString() };
});

const DECISION_TO_STATUS: Record<BackupDecision, BackupStatus> = {
  needsConsent: 'needsConsent',
  claimSilently: 'upToDate',
  otherOwner: 'otherOwner',
  // Shown as 'failed' until the automatic resume runs; RootNavigator starts it.
  resumeUpload: 'failed',
  upToDate: 'upToDate',
};

const backupSlice = createSlice({
  name: 'backup',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(refreshBackupStatus.fulfilled, (state, action) => {
        if (!action.payload) return;
        // Never clobber a running upload for this same account.
        if (state.status === 'uploading' && state.forUserId === action.payload.userId) return;
        state.forUserId = action.payload.userId;
        state.status = DECISION_TO_STATUS[action.payload.decision];
        state.lastBackupAt = action.payload.lastBackupAt;
        state.pendingHabits = action.payload.habits;
        state.pendingCompletions = action.payload.completions;
        if (state.status !== 'failed') state.error = null;
      })
      .addCase(backUpNow.pending, (state) => {
        state.status = 'uploading';
        state.error = null;
      })
      .addCase(backUpNow.fulfilled, (state, action) => {
        state.status = 'upToDate';
        state.lastBackupAt = action.payload.lastBackupAt;
      })
      .addCase(backUpNow.rejected, (state, action) => {
        const refusal = action.payload?.refusal;
        if (refusal === 'otherOwner') state.status = 'otherOwner';
        else if (refusal === 'needsConsent') state.status = 'needsConsent';
        else state.status = 'failed';
        state.error = action.payload?.error ?? 'Backup could not finish.';
      })
      // A different account (or none) means nothing here applies any more.
      .addCase(authUserChanged, (state, action) =>
        action.payload === state.forUserId ? state : initialState,
      )
      .addCase(signOutUser.fulfilled, () => initialState);
  },
});

export default backupSlice.reducer;
