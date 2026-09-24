/**
 * When sync runs. Mounted once, in RootNavigator.
 *
 *   1. On sign-in (and at launch with a stored session): decide, then sync if
 *      this account owns the device. For a fresh install that is the restore.
 *   2. A few seconds after local changes stop, so a burst of taps is one round.
 *   3. When the app returns to the foreground, to pick up other devices' edits.
 *
 * Never the FIRST upload: that only starts from the consent screen.
 *
 * Offline, a failed round is retried after a minute rather than every few
 * seconds — cheap, but not a retry storm while there is no connection.
 */

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import { refreshSyncStatus, syncNow } from '../store/syncSlice';
import { outboxSize } from './outbox';

const CHANGE_DEBOUNCE_MS = 3_000;
const RETRY_AFTER_FAILURE_MS = 60_000;

export function useSyncTriggers(): void {
  const dispatch = useDispatch<AppDispatch>();
  const authStatus = useSelector((s: RootState) => s.auth.status);
  const userId = useSelector((s: RootState) => s.auth.userId);
  const habitsLoaded = useSelector((s: RootState) => s.habits.isLoaded);
  const syncLoaded = useSelector((s: RootState) => s.sync.loaded);
  const claimOwner = useSelector((s: RootState) => s.sync.claimOwner);
  const outbox = useSelector((s: RootState) => s.sync.outbox);
  const inFlight = useSelector((s: RootState) => s.sync.inFlight);
  const status = useSelector((s: RootState) => s.sync.status);

  const isOwner = authStatus === 'signedIn' && !!userId && claimOwner === userId;

  // 1. Sign-in / launch.
  useEffect(() => {
    if (authStatus !== 'signedIn' || !userId || !habitsLoaded || !syncLoaded) return;
    dispatch(refreshSyncStatus(userId)).then((action) => {
      const decision = refreshSyncStatus.fulfilled.match(action) ? action.payload?.decision : null;
      if (decision === 'resumeUpload' || decision === 'upToDate') dispatch(syncNow());
    });
  }, [authStatus, userId, habitsLoaded, syncLoaded, dispatch]);

  // 2. Local changes (re-armed when a round ends with entries still queued).
  useEffect(() => {
    if (!isOwner || inFlight || outboxSize(outbox) === 0) return;
    const delay = status === 'failed' ? RETRY_AFTER_FAILURE_MS : CHANGE_DEBOUNCE_MS;
    const timer = setTimeout(() => dispatch(syncNow()), delay);
    return () => clearTimeout(timer);
  }, [isOwner, inFlight, outbox, status, dispatch]);

  // 3. Foreground.
  useEffect(() => {
    if (!isOwner) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') dispatch(syncNow());
    });
    return () => sub.remove();
  }, [isOwner, dispatch]);
}
