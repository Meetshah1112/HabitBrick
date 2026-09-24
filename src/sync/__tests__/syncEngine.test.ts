import { performSync, pullSince, PULL_OVERLAP_MS, type SyncGateway, type PullResult } from '../syncEngine';
import { outboxSize } from '../outbox';
import { createMemoryDevice, addHabit, complete, renameHabit } from './memoryDevice';

const T1 = '2026-09-24T10:00:00.000Z';
const T2 = '2026-09-24T10:05:00.000Z';
const SERVER_TIME = '2026-09-24T10:06:00.000Z';
const NOW = () => new Date(2026, 8, 24, 12);

function fakeGateway(options: { pushFails?: boolean; pullFails?: boolean; onPush?: () => void } = {}) {
  const pushes: Parameters<SyncGateway['push']>[0][] = [];
  const pulls: (string | null)[] = [];
  const pull: PullResult = { habits: [], completions: [], serverTime: SERVER_TIME };
  const gateway: SyncGateway = {
    async push(payload) {
      pushes.push(payload);
      options.onPush?.();
      return options.pushFails ? { ok: false, error: 'No connection.' } : { ok: true, data: null };
    },
    async pull(since) {
      pulls.push(since);
      return options.pullFails ? { ok: false, error: 'No connection.' } : { ok: true, data: pull };
    },
  };
  return { gateway, pushes, pulls, pull };
}

describe('performSync', () => {
  test('pushes queued changes, clears them, pulls, and advances the cursor', async () => {
    const device = createMemoryDevice([], NOW);
    device.act(addHabit('h1', 'Read'), T1);
    device.act(complete('h1', '2026-09-24', T1), T1);
    const { gateway, pushes, pulls } = fakeGateway();

    const result = await performSync(gateway, device.port);

    expect(result).toMatchObject({ ok: true, data: { pushedHabits: 1, pushedCompletions: 1 } });
    expect(pushes[0].habits[0]).toMatchObject({ local_id: 'h1', title: 'Read', client_updated_at: T1 });
    expect(outboxSize(device.outbox())).toBe(0);
    expect(pulls).toEqual([null]); // first sync pulls everything
    expect(device.cursor()).toBe(SERVER_TIME);
  });

  test('skips the push when there is nothing queued, but still pulls', async () => {
    const device = createMemoryDevice([], NOW);
    const { gateway, pushes, pulls } = fakeGateway();

    await performSync(gateway, device.port);

    expect(pushes).toHaveLength(0);
    expect(pulls).toHaveLength(1);
  });

  test('keeps everything queued and does not pull when the push fails', async () => {
    const device = createMemoryDevice([], NOW);
    device.act(addHabit('h1', 'Read'), T1);
    const { gateway, pulls } = fakeGateway({ pushFails: true });

    const result = await performSync(gateway, device.port);

    expect(result).toEqual({ ok: false, error: 'No connection.' });
    expect(outboxSize(device.outbox())).toBe(1);
    expect(pulls).toHaveLength(0);
    expect(device.cursor()).toBeNull();
  });

  test('keeps the push but not the cursor when only the pull fails', async () => {
    const device = createMemoryDevice([], NOW);
    device.act(addHabit('h1', 'Read'), T1);
    const { gateway } = fakeGateway({ pullFails: true });

    const result = await performSync(gateway, device.port);

    expect(result.ok).toBe(false);
    expect(outboxSize(device.outbox())).toBe(0); // the server has it
    expect(device.cursor()).toBeNull(); // so the next round re-pulls
  });

  test('keeps a change made while the push was in flight', async () => {
    const device = createMemoryDevice([], NOW);
    device.act(addHabit('h1', 'Read'), T1);
    const { gateway } = fakeGateway({
      onPush: () => device.act(renameHabit('h1', 'Read more'), T2),
    });

    await performSync(gateway, device.port);

    expect(device.outbox().habits.h1).toEqual({ at: T2, deleted: false });
    expect(device.habits()[0].title).toBe('Read more');
  });

  test('drops an entry that can never be sent instead of retrying it forever', async () => {
    const device = createMemoryDevice([], NOW);
    device.act(addHabit('h1', 'Read'), T1);
    device.act((habits) => habits.map((h) => ({ ...h, frequency: [] })), T2);
    const { gateway, pushes } = fakeGateway();

    const result = await performSync(gateway, device.port);

    expect(result).toMatchObject({ ok: true, data: { dropped: 1 } });
    expect(pushes).toHaveLength(0);
    expect(outboxSize(device.outbox())).toBe(0);
  });
});

describe('pullSince', () => {
  test('re-reads a window before the cursor to cover late commits', () => {
    expect(pullSince(SERVER_TIME)).toBe(new Date(Date.parse(SERVER_TIME) - PULL_OVERLAP_MS).toISOString());
  });

  test('pulls everything without a cursor', () => {
    expect(pullSince(null)).toBeNull();
  });
});
