/**
 * Records local habit changes into the sync outbox, and detects the
 * milestones (streaks, bricks, tiers, badges) to post to friends' feeds.
 *
 * Watches EVERY action that changes the habit list and diffs before/after
 * (sync/outbox.ts recordLocalChanges), rather than listing specific actions:
 * a new code path that edits habits is then synced automatically instead of
 * silently diverging. Device-only edits (reminder ids, streaks) produce no
 * entry because the diff only looks at synced fields.
 *
 * Three habit-changing actions are NOT user edits and are skipped:
 *   - loadData.fulfilled   the boot load (would queue every habit as "new")
 *   - rehydrateDay         the midnight recompute of derived fields
 *   - applyRemoteChanges   a merge FROM the server (would echo it back up)
 */

import { createListenerMiddleware } from '@reduxjs/toolkit';
import { recordLocalChanges, type Outbox } from '../sync/outbox';
import { detectMilestones } from '../social/milestones';
import { getLocalDateStr } from '../utils/streaks';
import { applyRemoteChanges, loadData, rehydrateDay } from './habitSlice';
import { milestonesRecorded, outboxRecorded } from './syncSlice';
import type { Badge, Habit } from '../types';

interface ListenerState {
  habits: { habits: Habit[]; badges: Badge[] };
  sync: { loaded: boolean; claimOwner: string | null; outbox: Outbox };
}

export const syncListener = createListenerMiddleware();

syncListener.startListening({
  predicate: (_action, currentState, previousState) =>
    (currentState as ListenerState).habits.habits !== (previousState as ListenerState).habits.habits,
  effect: (action, api) => {
    if (loadData.fulfilled.match(action) || rehydrateDay.match(action) || applyRemoteChanges.match(action)) {
      return;
    }

    const state = api.getState() as ListenerState;
    // Only a claimed device keeps an outbox. An unclaimed device's first sync
    // queues everything at once (buildFullOutbox), and a local-only user must
    // not accumulate an outbox that grows forever and is never sent.
    if (!state.sync.loaded || !state.sync.claimOwner) return;

    const previous = api.getOriginalState() as ListenerState;
    const next = recordLocalChanges(
      state.sync.outbox,
      previous.habits.habits,
      state.habits.habits,
      new Date().toISOString(),
    );
    if (next !== state.sync.outbox) api.dispatch(outboxRecorded(next));

    // Same skip rules apply: the boot load would back-fill every historical
    // milestone into friends' feeds, and a merge's milestones were already
    // posted by the device that earned them.
    const milestones = detectMilestones(
      { habits: previous.habits.habits, badges: previous.habits.badges },
      { habits: state.habits.habits, badges: state.habits.badges },
      getLocalDateStr(),
    );
    if (milestones.length > 0) api.dispatch(milestonesRecorded(milestones));
  },
});
