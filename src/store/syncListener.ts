/**
 * Records local habit changes into the sync outbox.
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
import { applyRemoteChanges, loadData, rehydrateDay } from './habitSlice';
import { outboxRecorded } from './syncSlice';
import type { Habit } from '../types';

interface ListenerState {
  habits: { habits: Habit[] };
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
  },
});
