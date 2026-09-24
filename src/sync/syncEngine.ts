/**
 * One sync round: push the outbox, then pull and merge.
 *
 * Push-then-pull is deliberate. The server arbitrates last-writer-wins inside
 * sync_push, so once our changes are accepted the pull returns already
 * resolved values and the merge can simply trust the server — except for
 * whatever changed locally while the round was in flight.
 *
 * The engine only sequences the round. It talks to a SyncGateway (the server)
 * and a SyncPort (this device's state), so the same code runs in the app over
 * Redux and in supabase/tests/sync.integration.test.mjs against real Postgres.
 *
 * Pure orchestration: no React Native imports.
 */

import type { Habit } from '../types';
import type { Result } from '../types/social';
import { buildPushPayload, outboxSize, type Outbox, type PushPayload } from './outbox';
import type { RemoteCompletion, RemoteHabit } from './mergeRemote';

export interface PullResult {
  habits: RemoteHabit[];
  completions: RemoteCompletion[];
  /** Server clock at read time: the next cursor. */
  serverTime: string;
}

export interface SyncGateway {
  push(payload: Pick<PushPayload, 'habits' | 'completions'>): Promise<Result<null>>;
  pull(since: string | null): Promise<Result<PullResult>>;
}

export interface SyncPort {
  getHabits(): readonly Habit[];
  getOutbox(): Outbox;
  getCursor(): string | null;
  /** The server accepted `sent`: drop those entries (not newer ones). */
  acknowledge(sent: Outbox): void;
  /**
   * Merge a pull. Must use the outbox as it is AT THIS MOMENT as the pending
   * set, and store `pull.serverTime` as the new cursor.
   */
  applyPull(pull: PullResult): void;
}

export interface SyncReport {
  pushedHabits: number;
  pushedCompletions: number;
  pulledHabits: number;
  pulledCompletions: number;
  /** Outbox entries dropped because they can never be sent. */
  dropped: number;
}

/**
 * sync_pull's cursor is the server's transaction START time, so a write that
 * started before our read but committed after it has an earlier updated_at
 * than the cursor. Re-reading a short window closes that gap; merging is
 * idempotent, so the overlap only costs a few duplicate rows.
 */
export const PULL_OVERLAP_MS = 5 * 60 * 1000;

export function pullSince(cursor: string | null): string | null {
  if (!cursor) return null;
  const at = Date.parse(cursor);
  return Number.isNaN(at) ? null : new Date(at - PULL_OVERLAP_MS).toISOString();
}

export async function performSync(gateway: SyncGateway, port: SyncPort): Promise<Result<SyncReport>> {
  // 1. Push a snapshot of the outbox. Anything recorded after this point
  //    stays queued for the next round.
  const snapshot = port.getOutbox();
  const payload = buildPushPayload(snapshot, port.getHabits());
  const hasWork = payload.habits.length > 0 || payload.completions.length > 0;

  if (hasWork) {
    const pushed = await gateway.push({ habits: payload.habits, completions: payload.completions });
    if (!pushed.ok) return pushed;
  }
  // Sent entries are accepted; unsendable ones are dropped rather than retried
  // forever. Either way the whole snapshot is done with.
  if (outboxSize(snapshot) > 0) port.acknowledge(snapshot);

  // 2. Pull and merge.
  const pulled = await gateway.pull(pullSince(port.getCursor()));
  if (!pulled.ok) return pulled;
  port.applyPull(pulled.data);

  return {
    ok: true,
    data: {
      pushedHabits: payload.habits.length,
      pushedCompletions: payload.completions.length,
      pulledHabits: pulled.data.habits.length,
      pulledCompletions: pulled.data.completions.length,
      dropped: payload.unsendable.length,
    },
  };
}
