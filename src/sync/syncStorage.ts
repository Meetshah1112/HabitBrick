/**
 * Persisted sync state: the outbox and the pull cursor.
 *
 * Written by the store's debounced persister in the SAME write as the habits
 * (see store/store.ts), so a change and its outbox entry land together — if
 * the app is killed right after a tap, the change is still queued on restart.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_OUTBOX, type CompletionOutboxEntry, type HabitOutboxEntry, type Outbox } from './outbox';

export const SYNC_STATE_KEY = '@atomicstep/syncState';

export interface PersistedSyncState {
  outbox: Outbox;
  cursor: string | null;
}

function isHabitEntry(value: unknown): value is HabitOutboxEntry {
  const v = value as HabitOutboxEntry;
  return !!v && typeof v.at === 'string' && typeof v.deleted === 'boolean';
}

function isCompletionEntry(value: unknown): value is CompletionOutboxEntry {
  const v = value as CompletionOutboxEntry;
  return (
    !!v &&
    typeof v.at === 'string' &&
    typeof v.done === 'boolean' &&
    (v.completedAt === null || typeof v.completedAt === 'string')
  );
}

/** Keeps every well-formed entry; drops anything malformed rather than failing. */
export function parseSyncState(json: string | null): PersistedSyncState {
  const empty: PersistedSyncState = { outbox: EMPTY_OUTBOX, cursor: null };
  if (!json) return empty;
  try {
    const value = JSON.parse(json);
    const habits: Outbox['habits'] = {};
    for (const [id, entry] of Object.entries(value?.outbox?.habits ?? {})) {
      if (isHabitEntry(entry)) habits[id] = entry;
    }
    const completions: Outbox['completions'] = {};
    for (const [id, days] of Object.entries(value?.outbox?.completions ?? {})) {
      const kept: Record<string, CompletionOutboxEntry> = {};
      for (const [day, entry] of Object.entries((days as object) ?? {})) {
        if (isCompletionEntry(entry)) kept[day] = entry;
      }
      if (Object.keys(kept).length > 0) completions[id] = kept;
    }
    const cursor = typeof value?.cursor === 'string' ? value.cursor : null;
    return { outbox: { habits, completions }, cursor };
  } catch {
    return empty;
  }
}

export async function loadSyncStateFromStorage(): Promise<PersistedSyncState> {
  return parseSyncState(await AsyncStorage.getItem(SYNC_STATE_KEY));
}

export function serialiseSyncState(state: PersistedSyncState): string {
  return JSON.stringify(state);
}
