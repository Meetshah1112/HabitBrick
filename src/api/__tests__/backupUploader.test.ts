import { runUpload, type BackupGateway, type CompletionRow } from '../backupUploader';
import type { BackupPlan, HabitRow } from '../../utils/backupPlan';

const USER = 'user-1';

function habitRow(localId: string): HabitRow {
  return {
    user_id: USER,
    local_id: localId,
    title: localId,
    description: null,
    category: 'reading',
    frequency: [true, true, true, true, true, true, true],
    target_days_per_week: 7,
    created_at: '2026-05-01',
  };
}

function plan(localIds: string[], completionsEach = 0): BackupPlan {
  const completionsByLocalId: BackupPlan['completionsByLocalId'] = {};
  for (const id of localIds) {
    completionsByLocalId[id] = Array.from({ length: completionsEach }, (_, i) => ({
      completed_on: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      completed_at: null,
    }));
  }
  return {
    habitRows: localIds.map(habitRow),
    completionsByLocalId,
    habitCount: localIds.length,
    completionCount: localIds.length * completionsEach,
    skippedHabits: [],
    skippedCompletionEntries: 0,
  };
}

/** Records every call; returns server ids as `srv-<local_id>`. */
function fakeGateway(options: { failHabitChunk?: number; omitLocalIds?: string[] } = {}) {
  const habitCalls: HabitRow[][] = [];
  const completionCalls: CompletionRow[][] = [];
  const gateway: BackupGateway = {
    async upsertHabits(rows) {
      habitCalls.push(rows);
      if (options.failHabitChunk === habitCalls.length) {
        return { ok: false, error: 'No connection. Your habits still work offline.' };
      }
      return {
        ok: true,
        data: rows
          .filter((r) => !options.omitLocalIds?.includes(r.local_id))
          .map((r) => ({ id: `srv-${r.local_id}`, local_id: r.local_id })),
      };
    },
    async insertCompletions(rows) {
      completionCalls.push(rows);
      return { ok: true, data: null };
    },
  };
  return { gateway, habitCalls, completionCalls };
}

describe('runUpload', () => {
  test('uploads habits, then attaches completions to the server ids', async () => {
    const { gateway, completionCalls } = fakeGateway();

    const result = await runUpload(gateway, plan(['a', 'b'], 2), USER);

    expect(result).toEqual({
      ok: true,
      data: { habitsUploaded: 2, completionsUploaded: 4, unmappedHabits: [] },
    });
    const sent = completionCalls.flat();
    expect(sent.filter((c) => c.habit_id === 'srv-a')).toHaveLength(2);
    expect(sent.every((c) => c.user_id === USER)).toBe(true);
  });

  test('splits large uploads into bounded chunks', async () => {
    const { gateway, habitCalls, completionCalls } = fakeGateway();
    const ids = Array.from({ length: 250 }, (_, i) => `h${i}`);

    await runUpload(gateway, plan(ids, 4), USER, { habitChunkSize: 100, completionChunkSize: 500 });

    expect(habitCalls.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(completionCalls.map((c) => c.length)).toEqual([500, 500]);
  });

  test('stops at the first failed chunk and surfaces the error', async () => {
    // Stopping is safe: every write is an idempotent upsert, so the next
    // attempt simply resumes.
    const { gateway, habitCalls, completionCalls } = fakeGateway({ failHabitChunk: 2 });
    const ids = Array.from({ length: 250 }, (_, i) => `h${i}`);

    const result = await runUpload(gateway, plan(ids, 1), USER, { habitChunkSize: 100 });

    expect(result).toEqual({ ok: false, error: 'No connection. Your habits still work offline.' });
    expect(habitCalls).toHaveLength(2);
    expect(completionCalls).toHaveLength(0);
  });

  test('reports habits the server did not return and skips their completions', async () => {
    const { gateway, completionCalls } = fakeGateway({ omitLocalIds: ['b'] });

    const result = await runUpload(gateway, plan(['a', 'b'], 3), USER);

    expect(result).toEqual({
      ok: true,
      data: { habitsUploaded: 1, completionsUploaded: 3, unmappedHabits: ['b'] },
    });
    expect(completionCalls.flat().some((c) => c.habit_id === 'srv-b')).toBe(false);
  });

  test('succeeds without any request for an empty plan', async () => {
    const { gateway, habitCalls, completionCalls } = fakeGateway();

    const result = await runUpload(gateway, plan([]), USER);

    expect(result).toEqual({
      ok: true,
      data: { habitsUploaded: 0, completionsUploaded: 0, unmappedHabits: [] },
    });
    expect(habitCalls).toHaveLength(0);
    expect(completionCalls).toHaveLength(0);
  });
});
