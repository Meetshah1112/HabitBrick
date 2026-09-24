/**
 * Sync state (Phase 4) — replaces Phase 3's backupSlice.
 *
 * Two kinds of state live here:
 *   - DEVICE state, which survives sign-out: the claim owner, the outbox and
 *     the pull cursor. Changes made while signed out stay queued and go up the
 *     next time the owner signs in.
 *   - UI state, per account: status, counts for the consent screen, last error.
 *
 * The outbox is recorded by store/syncListener.ts and persisted together with
 * the habits by store/store.ts.
 */

import { createAsyncThunk, createSlice, current, isDraft, type PayloadAction } from '@reduxjs/toolkit';
import { supabase } from '../lib/supabase';
import {
  checkSyncAccess,
  claimDevice,
  evaluateBackup,
  readClaim,
  recordSyncResult,
  refusalMessage,
  type BackupRefusal,
} from '../api/cloudBackupService';
import { cancelAllReminders, syncTodayReminders } from '../api/reminderSync';
import { buildBackupPlan } from '../utils/backupPlan';
import type { BackupDecision } from '../utils/backupDecision';
import { EMPTY_OUTBOX, ackOutbox, mergeOutboxes, outboxSize, type Outbox } from '../sync/outbox';
import { mergeRemote } from '../sync/mergeRemote';
import { performSync, type SyncPort, type SyncReport } from '../sync/syncEngine';
import { supabaseSyncGateway } from '../sync/supabaseSyncGateway';
import { loadSyncStateFromStorage } from '../sync/syncStorage';
import { postMilestones } from '../api/socialService';
import type { MilestoneEvent } from '../social/milestones';
import { applyRemoteChanges, editHabit } from './habitSlice';
import { authUserChanged, signOutUser } from './authSlice';
import type { Habit } from '../types';

export type SyncStatus = 'idle' | 'needsConsent' | 'syncing' | 'synced' | 'failed' | 'otherOwner';

interface SyncState {
  /** False until the persisted outbox/cursor/claim have been read at boot. */
  loaded: boolean;
  claimOwner: string | null;
  outbox: Outbox;
  cursor: string | null;
  /** Milestones waiting to be posted to friends' feeds; posted after each sync round. */
  milestones: MilestoneEvent[];
  /** Whose UI status this is (token refreshes re-fire authUserChanged). */
  forUserId: string | null;
  status: SyncStatus;
  /**
   * A sync round is running. Separate from `status`, which is display-only:
   * enableSync shows 'syncing' before its round starts, and guarding on the
   * status would make that very round skip itself.
   */
  inFlight: boolean;
  pendingHabits: number;
  pendingCompletions: number;
  lastSyncedAt: string | null;
  error: string | null;
}

const initialState: SyncState = {
  loaded: false,
  claimOwner: null,
  outbox: EMPTY_OUTBOX,
  cursor: null,
  milestones: [],
  forUserId: null,
  status: 'idle',
  inFlight: false,
  pendingHabits: 0,
  pendingCompletions: 0,
  lastSyncedAt: null,
  error: null,
};

/** Bound on queued milestones: a long offline stretch must not grow storage forever. */
const MAX_QUEUED_MILESTONES = 50;

/** Immer's current() throws on a non-draft; the outbox may be either. */
function plain<T>(value: T): T {
  return isDraft(value) ? current(value) : value;
}

type ThunkState = {
  auth: { userId: string | null };
  habits: { habits: Habit[]; isLoaded: boolean };
  sync: SyncState;
};

type Refused = { error: string; refusal?: BackupRefusal };

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

/** Read the persisted sync state once at boot, before any change is recorded. */
export const loadSyncState = createAsyncThunk('sync/load', async () => {
  const [claim, persisted] = await Promise.all([readClaim(), loadSyncStateFromStorage()]);
  return {
    claimOwner: claim?.ownerUserId ?? null,
    lastSyncedAt: claim?.lastUpload?.status === 'complete' ? claim.lastUpload.at : null,
    outbox: persisted.outbox,
    cursor: persisted.cursor,
    milestones: persisted.milestones,
  };
});

/**
 * Where does this device stand for the signed-in account? Returns null until
 * local habits have loaded — deciding against the not-yet-loaded empty list
 * would silently claim the device with nothing in it.
 */
export const refreshSyncStatus = createAsyncThunk<
  { userId: string; decision: BackupDecision; claimOwner: string | null; habits: number; completions: number } | null,
  string | undefined,
  { state: ThunkState }
>('sync/refresh', async (explicitUserId, { getState }) => {
  const { auth, habits } = getState();
  const userId = explicitUserId ?? auth.userId;
  if (!userId || !habits.isLoaded) return null;

  const { decision, claim } = await evaluateBackup(userId, habits.habits);
  const plan = buildBackupPlan(userId, habits.habits);
  return {
    userId,
    decision,
    claimOwner: claim?.ownerUserId ?? null,
    habits: plan.habitCount,
    completions: plan.completionCount,
  };
});

/** The Redux side of the engine's SyncPort. */
function reduxSyncPort(
  dispatch: (action: unknown) => unknown,
  getState: () => ThunkState,
): SyncPort {
  return {
    getHabits: () => getState().habits.habits,
    getOutbox: () => getState().sync.outbox,
    getCursor: () => getState().sync.cursor,
    acknowledge: (sent) => {
      dispatch(syncSlice.actions.outboxAcknowledged(sent));
    },
    applyPull: (pull) => {
      // Read and dispatch synchronously: nothing can record a new outbox
      // entry between computing the merge and installing it.
      const state = getState();
      const result = mergeRemote(state.habits.habits, pull, state.sync.outbox);
      if (result.changed) dispatch(applyRemoteChanges({ habits: result.habits }));
      dispatch(syncSlice.actions.cursorAdvanced(pull.serverTime));
      void applyReminderSideEffects(dispatch, getState, result.removed, result.todayChanged);
    },
  };
}

/** Reminders are device-local: keep them consistent with merged changes. Never fails a sync. */
async function applyReminderSideEffects(
  dispatch: (action: unknown) => unknown,
  getState: () => ThunkState,
  removed: Habit[],
  todayChanged: { habitId: string; done: boolean }[],
): Promise<void> {
  await Promise.allSettled(removed.map((habit) => cancelAllReminders(habit)));
  for (const { habitId, done } of todayChanged) {
    const habit = getState().habits.habits.find((h) => h.id === habitId);
    if (!habit) continue;
    try {
      const ids = await syncTodayReminders(habit, done);
      dispatch(editHabit({ id: habitId, updates: ids }));
    } catch {
      // Reminder scheduling is unavailable (e.g. web). The data merge stands.
    }
  }
}

export const syncNow = createAsyncThunk<
  { report: SyncReport; lastSyncedAt: string },
  void,
  { state: ThunkState; rejectValue: Refused }
>(
  'sync/run',
  async (_, { dispatch, getState, rejectWithValue }) => {
    const userId = getState().auth.userId;
    if (!userId) return rejectWithValue({ error: 'Sign in to sync.' });
    if (!supabase) return rejectWithValue({ error: refusalMessage('unavailable'), refusal: 'unavailable' });

    const refusal = await checkSyncAccess(userId);
    if (refusal) return rejectWithValue({ error: refusalMessage(refusal), refusal });

    const result = await performSync(supabaseSyncGateway(supabase), reduxSyncPort(dispatch, getState));
    if (!result.ok) {
      await recordSyncResult(userId, { ok: false });
      return rejectWithValue({ error: result.error });
    }
    const claim = await recordSyncResult(userId, {
      ok: true,
      habits: result.data.pushedHabits,
      completions: result.data.pushedCompletions,
    });

    // Milestones ride on the sync round. A failed post keeps them queued for
    // the next round; it never fails the sync itself.
    const queued = getState().sync.milestones;
    if (queued.length > 0) {
      const posted = await postMilestones(userId, queued);
      if (posted.ok) dispatch(syncSlice.actions.milestonesPosted(queued.map((m) => m.dedupeKey)));
    }
    return { report: result.data, lastSyncedAt: claim?.lastUpload?.at ?? new Date().toISOString() };
  },
  // One round at a time; a trigger that fires mid-round is simply skipped.
  { condition: (_, { getState }) => !getState().sync.inFlight },
);

/** After consent: claim the device, queue everything on it, and sync. */
export const enableSync = createAsyncThunk<
  void,
  { consent: boolean },
  { state: ThunkState; rejectValue: Refused }
>('sync/enable', async ({ consent }, { dispatch, getState, rejectWithValue }) => {
  const { auth, habits } = getState();
  if (!auth.userId) return rejectWithValue({ error: 'Sign in to back up.' });
  if (!habits.isLoaded) return rejectWithValue({ error: 'Your habits are still loading.' });

  const claimed = await claimDevice({ userId: auth.userId, habits: habits.habits, consent });
  if (!claimed.ok) return rejectWithValue({ error: claimed.error, refusal: claimed.refusal });

  dispatch(syncSlice.actions.claimRecorded(claimed.claim.ownerUserId));
  dispatch(syncSlice.actions.outboxMerged(claimed.fullOutbox));
  await dispatch(syncNow());
});

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const DECISION_TO_STATUS: Record<BackupDecision, SyncStatus | null> = {
  needsConsent: 'needsConsent',
  otherOwner: 'otherOwner',
  // Owner cases: the sync round that follows sets the real status.
  claimSilently: null,
  resumeUpload: null,
  upToDate: null,
};

function resetUi(state: SyncState): void {
  state.forUserId = null;
  state.status = 'idle';
  state.pendingHabits = 0;
  state.pendingCompletions = 0;
  state.error = null;
}

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    outboxRecorded(state, action: PayloadAction<Outbox>) {
      state.outbox = action.payload;
    },
    outboxAcknowledged(state, action: PayloadAction<Outbox>) {
      state.outbox = ackOutbox(plain(state.outbox), action.payload);
    },
    outboxMerged(state, action: PayloadAction<Outbox>) {
      state.outbox = mergeOutboxes(plain(state.outbox), action.payload);
    },
    cursorAdvanced(state, action: PayloadAction<string>) {
      state.cursor = action.payload;
    },
    claimRecorded(state, action: PayloadAction<string>) {
      state.claimOwner = action.payload;
    },
    milestonesRecorded(state, action: PayloadAction<MilestoneEvent[]>) {
      const known = new Set(state.milestones.map((m) => m.dedupeKey));
      const fresh = action.payload.filter((m) => !known.has(m.dedupeKey));
      // Keep the newest if the cap is hit: they are the ones friends will care about.
      state.milestones = [...state.milestones, ...fresh].slice(-MAX_QUEUED_MILESTONES);
    },
    milestonesPosted(state, action: PayloadAction<string[]>) {
      const posted = new Set(action.payload);
      state.milestones = state.milestones.filter((m) => !posted.has(m.dedupeKey));
    },
    /** Forget this device's sync state entirely (reset while signed out). */
    syncCleared(state) {
      state.claimOwner = null;
      state.outbox = EMPTY_OUTBOX;
      state.cursor = null;
      state.milestones = [];
      state.lastSyncedAt = null;
      resetUi(state);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSyncState.fulfilled, (state, action) => {
        state.loaded = true;
        state.claimOwner = action.payload.claimOwner;
        state.lastSyncedAt = action.payload.lastSyncedAt;
        // Keep anything recorded before the load finished (should be nothing).
        state.outbox = mergeOutboxes(action.payload.outbox, plain(state.outbox));
        state.cursor = action.payload.cursor;
        state.milestones = [...action.payload.milestones, ...plain(state.milestones)].slice(-MAX_QUEUED_MILESTONES);
      })
      .addCase(loadSyncState.rejected, (state) => {
        // Unreadable storage: start clean rather than never recording changes.
        state.loaded = true;
      })
      .addCase(refreshSyncStatus.fulfilled, (state, action) => {
        const payload = action.payload;
        if (!payload) return;
        state.forUserId = payload.userId;
        state.claimOwner = payload.claimOwner;
        state.pendingHabits = payload.habits;
        state.pendingCompletions = payload.completions;
        const status = DECISION_TO_STATUS[payload.decision];
        if (status && !state.inFlight) {
          state.status = status;
          state.error = null;
        }
      })
      .addCase(syncNow.pending, (state) => {
        state.inFlight = true;
        state.status = 'syncing';
        state.error = null;
      })
      .addCase(syncNow.fulfilled, (state, action) => {
        state.inFlight = false;
        state.status = 'synced';
        state.lastSyncedAt = action.payload.lastSyncedAt;
      })
      .addCase(syncNow.rejected, (state, action) => {
        if (action.meta.condition) return; // skipped: a round was already running
        state.inFlight = false;
        const refusal = action.payload?.refusal;
        state.status =
          refusal === 'otherOwner' ? 'otherOwner' : refusal === 'needsConsent' ? 'needsConsent' : 'failed';
        state.error = action.payload?.error ?? 'Sync could not finish.';
      })
      .addCase(enableSync.pending, (state) => {
        state.status = 'syncing';
        state.error = null;
      })
      .addCase(enableSync.rejected, (state, action) => {
        const refusal = action.payload?.refusal;
        state.status =
          refusal === 'otherOwner' ? 'otherOwner' : refusal === 'needsConsent' ? 'needsConsent' : 'failed';
        state.error = action.payload?.error ?? 'Backup could not finish.';
      })
      .addCase(authUserChanged, (state, action) => {
        if (action.payload !== state.forUserId) resetUi(state);
      })
      .addCase(signOutUser.fulfilled, (state) => {
        resetUi(state);
      });
  },
});

export const { outboxRecorded, syncCleared, milestonesRecorded } = syncSlice.actions;

export const selectOutboxSize = (state: { sync: SyncState }): number => outboxSize(state.sync.outbox);

export default syncSlice.reducer;
