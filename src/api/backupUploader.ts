/**
 * Backup uploader — sends a BackupPlan to the server in bounded chunks.
 *
 * Talks to a narrow BackupGateway rather than the Supabase client directly, so
 * the ordering, chunking and failure handling are unit-tested against a fake
 * (see __tests__/backupUploader.test.ts).
 *
 * Every write is idempotent — habits upsert on (user_id, local_id), and
 * completions insert with ON CONFLICT DO NOTHING on (habit_id, completed_on),
 * both verified against real Postgres in supabase/tests/rls.test.mjs. So on
 * any failure we simply stop: the next attempt resends everything and the
 * rows that already landed are no-ops.
 */

import type { Result } from '../types/social';
import type { BackupPlan, CompletionDraft, HabitRow } from '../utils/backupPlan';

export interface CompletionRow extends CompletionDraft {
  user_id: string;
  habit_id: string;
}

export interface BackupGateway {
  /** Upsert habits; returns the server id for each local_id written. */
  upsertHabits(rows: HabitRow[]): Promise<Result<{ id: string; local_id: string }[]>>;
  /** Insert completions, ignoring any that already exist. */
  insertCompletions(rows: CompletionRow[]): Promise<Result<null>>;
}

export interface UploadReport {
  habitsUploaded: number;
  completionsUploaded: number;
  /** Habits the server did not return an id for; their completions were not sent. */
  unmappedHabits: string[];
}

const DEFAULT_HABIT_CHUNK = 100;
const DEFAULT_COMPLETION_CHUNK = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function runUpload(
  gateway: BackupGateway,
  plan: BackupPlan,
  userId: string,
  options: { habitChunkSize?: number; completionChunkSize?: number } = {},
): Promise<Result<UploadReport>> {
  const habitChunkSize = options.habitChunkSize ?? DEFAULT_HABIT_CHUNK;
  const completionChunkSize = options.completionChunkSize ?? DEFAULT_COMPLETION_CHUNK;

  // 1. Habits first: completions need the server-assigned habit ids.
  const serverIdByLocalId = new Map<string, string>();
  for (const rows of chunk(plan.habitRows, habitChunkSize)) {
    const result = await gateway.upsertHabits(rows);
    if (!result.ok) return result;
    for (const { id, local_id } of result.data) serverIdByLocalId.set(local_id, id);
  }

  // 2. Completions, attached to the ids the server actually returned.
  const unmappedHabits: string[] = [];
  const completionRows: CompletionRow[] = [];
  for (const { local_id } of plan.habitRows) {
    const habitId = serverIdByLocalId.get(local_id);
    if (!habitId) {
      unmappedHabits.push(local_id);
      continue;
    }
    for (const draft of plan.completionsByLocalId[local_id] ?? []) {
      completionRows.push({ ...draft, user_id: userId, habit_id: habitId });
    }
  }

  for (const rows of chunk(completionRows, completionChunkSize)) {
    const result = await gateway.insertCompletions(rows);
    if (!result.ok) return result;
  }

  return {
    ok: true,
    data: {
      habitsUploaded: serverIdByLocalId.size,
      completionsUploaded: completionRows.length,
      unmappedHabits,
    },
  };
}
