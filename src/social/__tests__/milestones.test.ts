import { detectMilestones, describeActivity } from '../milestones';
import type { Badge, Habit } from '../../types';

const TODAY = '2026-09-24';

function habit(id: string, currentStreak: number, completedDays = 0): Habit {
  const completionLog: Habit['completionLog'] = {};
  for (let i = 0; i < completedDays; i++) completionLog[`2026-01-${String(i + 1).padStart(2, '0')}`] = true;
  return {
    id,
    title: `secret title ${id}`,
    category: 'reading',
    frequency: [true, true, true, true, true, true, true],
    targetDaysPerWeek: 7,
    currentStreak,
    longestStreak: currentStreak,
    completedToday: false,
    completionLog,
    createdAt: '2026-01-01',
  };
}

function badge(id: string, unlocked: boolean): Badge {
  return { id, title: id, description: '', icon: 'Star', unlocked, requirement: '', streakRequired: 0 };
}

const state = (habits: Habit[], badges: Badge[] = []) => ({ habits, badges });

describe('detectMilestones', () => {
  test('posts a streak milestone when a habit reaches it', () => {
    const events = detectMilestones(state([habit('h1', 6)]), state([habit('h1', 7)]), TODAY);
    expect(events).toEqual([
      { type: 'streak_milestone', dedupeKey: 'streak:h1:7:2026-09-24', payload: { streak: 7 } },
    ]);
  });

  test('never puts the habit title in a milestone', () => {
    const events = detectMilestones(state([habit('h1', 29)]), state([habit('h1', 30)]), TODAY);
    expect(JSON.stringify(events)).not.toContain('secret title');
  });

  test('posts only the highest milestone when several are crossed at once', () => {
    const events = detectMilestones(state([habit('h1', 0)]), state([habit('h1', 31)]), TODAY);
    expect(events.map((e) => e.payload)).toEqual([{ streak: 30 }]);
  });

  test('posts nothing between milestones or when a streak drops', () => {
    expect(detectMilestones(state([habit('h1', 8)]), state([habit('h1', 9)]), TODAY)).toEqual([]);
    expect(detectMilestones(state([habit('h1', 30)]), state([habit('h1', 0)]), TODAY)).toEqual([]);
  });

  test('keys a streak by day, so reaching it again on a later run is a new milestone', () => {
    const [first] = detectMilestones(state([habit('h1', 6)]), state([habit('h1', 7)]), '2026-09-24');
    const [later] = detectMilestones(state([habit('h1', 6)]), state([habit('h1', 7)]), '2026-11-02');
    expect(first.dedupeKey).not.toBe(later.dedupeKey);
  });

  test('posts a tier-up when total bricks cross into a new tier', () => {
    const events = detectMilestones(state([habit('h1', 1, 9)]), state([habit('h1', 1, 10)]), TODAY);
    expect(events).toEqual([
      { type: 'tier_up', dedupeKey: 'tier:wall', payload: { tierKey: 'wall', bricks: 10 } },
    ]);
  });

  test('posts a brick milestone every hundred bricks, except where a tier already marks it', () => {
    const at200 = detectMilestones(state([habit('h1', 1, 199)]), state([habit('h1', 1, 200)]), TODAY);
    expect(at200).toEqual([
      { type: 'brick_milestone', dedupeKey: 'bricks:200', payload: { bricks: 200 } },
    ]);
    const at100 = detectMilestones(state([habit('h1', 1, 99)]), state([habit('h1', 1, 100)]), TODAY);
    expect(at100.map((e) => e.type)).toEqual(['tier_up']);
  });

  test('posts a badge unlock once, when it happens', () => {
    const events = detectMilestones(
      state([], [badge('b06', false), badge('b01', true)]),
      state([], [badge('b06', true), badge('b01', true)]),
      TODAY,
    );
    expect(events).toEqual([
      { type: 'badge_unlock', dedupeKey: 'badge:b06', payload: { badgeId: 'b06' } },
    ]);
  });

  test('keeps category badges private, because they reveal what kind of habit someone tracks', () => {
    // "Healthy Living" would tell friends you track a health habit; "Money
    // Maker", a finance one. Streak, total and consistency badges say nothing
    // about what the habits are.
    const events = detectMilestones(
      state([], [badge('b18', false), badge('b22', false), badge('b06', false)]),
      state([], [badge('b18', true), badge('b22', true), badge('b06', true)]),
      TODAY,
    );
    expect(events.map((e) => e.payload.badgeId)).toEqual(['b06']);
  });

  test('posts nothing when nothing sync-relevant changed', () => {
    const s = state([habit('h1', 3, 3)], [badge('b01', true)]);
    expect(detectMilestones(s, s, TODAY)).toEqual([]);
  });
});

describe('describeActivity', () => {
  test('renders each milestone from its own ids and numbers', () => {
    expect(describeActivity('streak_milestone', { streak: 30 })).toEqual({ emoji: '🔥', text: 'hit a 30-day streak' });
    expect(describeActivity('tier_up', { tierKey: 'house' })).toEqual({ emoji: '🏠', text: 'built Your House' });
    expect(describeActivity('brick_milestone', { bricks: 300 })).toEqual({ emoji: '🧱', text: 'laid 300 bricks' });
    expect(describeActivity('badge_unlock', { badgeId: 'b06' })).toEqual({
      emoji: '🏅',
      text: 'unlocked the "Week Warrior" badge',
    });
  });

  test('ignores text a malicious client put in the payload', () => {
    // A friend's client controls the payload; only ids and numbers are used.
    const described = describeActivity('badge_unlock', { badgeId: 'b06', badgeTitle: 'something offensive' });
    expect(described?.text).toBe('unlocked the "Week Warrior" badge');
  });

  test('never renders a category badge, even if another client posts one', () => {
    expect(describeActivity('badge_unlock', { badgeId: 'b22' })).toBeNull();
  });

  test('renders nothing for unknown ids or malformed numbers', () => {
    expect(describeActivity('badge_unlock', { badgeId: 'b999' })).toBeNull();
    expect(describeActivity('tier_up', { tierKey: 'castle' })).toBeNull();
    expect(describeActivity('streak_milestone', { streak: -3 })).toBeNull();
    expect(describeActivity('streak_milestone', { streak: 7.5 })).toBeNull();
    expect(describeActivity('brick_milestone', {})).toBeNull();
  });
});
