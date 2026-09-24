// Database tests: applies every migration to real Postgres (PGlite, compiled
// to WASM — no Docker needed) and exercises RLS as Supabase's `authenticated`
// and `anon` roles.
//
//   npm run db:test
//
// Every file in supabase/migrations is applied in name order, so a new
// migration is covered automatically. Add a check here for any new policy.
import { createDatabase, as as asUser, createReporter } from './pgHarness.mjs';

const { pass, fail, check, finish } = createReporter();

console.log('\n== Apply migrations ==');
let db;
try {
  db = await createDatabase({ onApplied: pass, onFailed: (file, e) => fail(file, e.message) });
} catch {
  console.log('\nAborting: migrations must apply cleanly.');
  process.exit(1);
}

const as = (uid, fn) => asUser(db, uid, fn);
async function expectError(label, fn, pattern) {
  try { await fn(); fail(label, 'expected an error, statement succeeded'); }
  catch (e) {
    if (pattern && !pattern.test(e.message)) fail(label, 'wrong error: ' + e.message);
    else pass(label + '  [' + e.message.split('\n')[0].slice(0, 70) + ']');
  }
}
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;

// ------------------------------------------------------------------- signup
console.log('\n== Signup trigger ==');
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
for (const [id, u] of [[A, 'alice'], [B, 'bob'], [C, 'carol']]) {
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
    [id, u + '@example.com', JSON.stringify({ username: u, display_name: u.toUpperCase() })]);
}
const profiles = await rows('select username, display_name from public.profiles order by username');
check('trigger creates profiles with username + display_name',
  profiles.length === 3 && profiles[0].username === 'alice' && profiles[0].display_name === 'ALICE',
  JSON.stringify(profiles));
await expectError('duplicate username (case-insensitive) rejects the signup',
  () => db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
    ['44444444-4444-4444-4444-444444444444', 'x@example.com', JSON.stringify({ username: 'ALICE' })]),
  /duplicate key|unique/i);

// --------------------------------------------------------- username check
console.log('\n== username_available (anon, i.e. the sign-up form) ==');
await as(null, async () => {
  check('free name -> true', (await rows("select public.username_available('brand_new') v"))[0].v === true, 'not true');
  check('taken name, other case -> false', (await rows("select public.username_available('Alice') v"))[0].v === false, 'not false');
  check('invalid format -> false', (await rows("select public.username_available('a b!') v"))[0].v === false, 'not false');
});
await expectError('anon cannot call search_profiles', () => as(null, () => db.query("select * from public.search_profiles('ali')")), /permission denied/i);

// --------------------------------------------------- Phase 3 upload shape
// These mirror what supabase-js/PostgREST sends for:
//   upsert(rows, { onConflict: 'user_id,local_id' }).select('id, local_id')
//   upsert(rows, { onConflict: 'habit_id,completed_on', ignoreDuplicates: true })
console.log('\n== Phase 3 upload (as alice) ==');
const upsertHabit = (uid, localId, title) => db.query(`
  insert into public.habits (user_id, local_id, title, description, category, frequency, target_days_per_week, created_at)
  values ($1, $2, $3, null, 'reading', '{t,t,t,t,t,t,t}', 7, '2026-05-01')
  on conflict (user_id, local_id) do update set
    title = excluded.title, description = excluded.description, category = excluded.category,
    frequency = excluded.frequency, target_days_per_week = excluded.target_days_per_week,
    created_at = excluded.created_at
  returning id, local_id`, [uid, localId, title]);
const upsertCompletion = (uid, habitId, day) => db.query(`
  insert into public.habit_completions (user_id, habit_id, completed_on, completed_at)
  values ($1, $2, $3, now())
  on conflict (habit_id, completed_on) do nothing`, [uid, habitId, day]);

const first = await as(A, () => upsertHabit(A, 'loc1', 'Read'));
const aliceHabitId = first.rows[0].id;
check('upsert returns server id + local_id mapping', first.rows[0].local_id === 'loc1' && !!aliceHabitId, JSON.stringify(first.rows));
const again = await as(A, () => upsertHabit(A, 'loc1', 'Read 10 pages'));
check('re-running upsert is idempotent (same id, updated title)', again.rows[0].id === aliceHabitId, 'id changed');
const aliceCount = await as(A, () => rows('select count(*)::int n, max(title) t from public.habits'));
check('still exactly one habit after retry', aliceCount[0].n === 1 && aliceCount[0].t === 'Read 10 pages', JSON.stringify(aliceCount));
await as(A, async () => { await upsertCompletion(A, aliceHabitId, '2026-05-02'); await upsertCompletion(A, aliceHabitId, '2026-05-02'); await upsertCompletion(A, aliceHabitId, '2026-05-03'); });
const compCount = await as(A, () => rows('select count(*)::int n from public.habit_completions'));
check('duplicate completion ignored, not an error', compCount[0].n === 2, 'count ' + compCount[0].n);
await expectError('invalid calendar date is rejected by Postgres', () => as(A, () => upsertCompletion(A, aliceHabitId, '2026-02-30')), /date|out of range/i);

// ------------------------------------------------------------- RLS: isolation
console.log('\n== RLS isolation ==');
await expectError('alice cannot write a habit as bob', () => as(A, () => upsertHabit(B, 'evil', 'x')), /row-level security/i);
check('bob sees none of alice\'s habits', (await as(B, () => rows('select * from public.habits'))).length === 0, 'leak');
check('bob sees none of alice\'s completions', (await as(B, () => rows('select * from public.habit_completions'))).length === 0, 'leak');

// Bob creates his own habit; can alice attach a completion row to BOB's habit?
const bobHabit = await as(B, () => upsertHabit(B, 'bobloc', 'Bob habit'));
const bobHabitId = bobHabit.rows[0].id;
let griefed = false;
try { await as(A, () => upsertCompletion(A, bobHabitId, '2026-06-01')); griefed = true; } catch { /* blocked */ }
await as(B, () => upsertCompletion(B, bobHabitId, '2026-06-01'));
const bobDay = await as(B, () => rows("select count(*)::int n from public.habit_completions where completed_on = '2026-06-01'"));
check('alice cannot insert a completion against bob\'s habit', !griefed,
  'alice inserted a row for bob\'s habit_id; bob\'s own completion for that day was then ' +
  (bobDay[0].n === 0 ? 'SILENTLY DROPPED by ON CONFLICT DO NOTHING' : 'kept'));

// ------------------------------------------------------- RLS: friends
console.log('\n== Friends ==');
// As of 0007 friendships are only created through send_friend_request and
// accepted through respond_to_friend_request; direct writes are refused.
const abRequest = (await as(A, () => rows('select public.send_friend_request($1) as id', [B])))[0].id;
await expectError('the unique pair index still blocks a reciprocal duplicate row (as table owner, below RLS)',
  () => db.query('insert into public.friendships (requester_id, addressee_id) values ($1, $2)', [B, A]), /duplicate key|unique/i);
await expectError('the requester cannot accept their own request',
  () => as(A, () => db.query('select public.respond_to_friend_request($1, true)', [abRequest])), /not found/i);
check('pending: bob cannot see alice\'s profile yet', (await as(B, () => rows('select * from public.profiles where id = $1', [A]))).length === 0, 'visible while pending');
await as(B, () => db.query('select public.respond_to_friend_request($1, true)', [abRequest]));
check('accepted: bob can see alice\'s profile', (await as(B, () => rows('select * from public.profiles where id = $1', [A]))).length === 1, 'not visible');
check('accepted: bob STILL cannot see alice\'s habits', (await as(B, () => rows('select * from public.habits where user_id = $1', [A]))).length === 0, 'habit titles leaked to a friend');
check('carol (stranger) cannot see alice\'s profile', (await as(C, () => rows('select * from public.profiles where id = $1', [A]))).length === 0, 'leak');
const board = await as(B, () => rows("select username, bricks from public.friends_leaderboard('2026-01-01')"));
check('leaderboard shows friend counts only', board.length === 2 && board.find(r => r.username === 'alice')?.bricks == 2,
  JSON.stringify(board));
check('carol\'s leaderboard contains only carol', (await as(C, () => rows("select username from public.friends_leaderboard('2026-01-01')"))).map(r => r.username).join() === 'carol', 'leak');
const found = await as(C, () => rows("select username from public.search_profiles('ali')"));
check('search_profiles prefix match works for signed-in users', found.length === 1 && found[0].username === 'alice', JSON.stringify(found));
check('search_profiles refuses <3 chars', (await as(C, () => rows("select * from public.search_profiles('al')"))).length === 0, 'returned rows');

// ---------------------------------------------------- two-way sync (0006)
console.log('\n== Two-way sync: sync_push / sync_pull ==');
const D = '55555555-5555-5555-5555-555555555555';
await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
  [D, 'dave@example.com', JSON.stringify({ username: 'dave' })]);

const T = (minute) => `2026-09-20T10:${String(minute).padStart(2, '0')}:00.000Z`;
const syncHabit = (local_id, title, clock, extra = {}) => ({
  local_id, title, description: null, category: 'reading',
  frequency: [true, true, true, true, true, false, false], target_days_per_week: 5,
  created_at: '2026-09-01', client_updated_at: clock, ...extra,
});
const syncDay = (local_id, day, done, clock) => ({
  local_id, completed_on: day, done, completed_at: done ? clock : null, client_updated_at: clock,
});
const push = async (uid, habits, completions) => (await as(uid, () => db.query(
  'select public.sync_push($1::jsonb, $2::jsonb) as r', [JSON.stringify(habits), JSON.stringify(completions)]))).rows[0].r;
const pull = async (uid, since) => (await as(uid, () => db.query(
  'select public.sync_pull($1::timestamptz) as r', [since]))).rows[0].r;
const day = (p, id, d) => p.completions.find((c) => c.local_id === id && c.completed_on === d);

let r = await push(D, [syncHabit('d1', 'Run', T(1))], [syncDay('d1', '2026-09-19', true, T(1)), syncDay('d1', '2026-09-20', true, T(1))]);
check('push writes a habit and its completions', r.habits_written === 1 && r.completions_written === 2, JSON.stringify(r));
let p = await pull(D, null);
check('full pull returns them', p.habits.length === 1 && p.completions.length === 2 && !!p.server_time, JSON.stringify(p));

await push(D, [syncHabit('d1', 'Run 5k', T(5))], []);
await push(D, [syncHabit('d1', 'Stale title', T(3))], []);
p = await pull(D, null);
check('an older edit loses to a newer one (last writer wins)', p.habits[0].title === 'Run 5k', p.habits[0].title);

await push(D, [], [syncDay('d1', '2026-09-20', false, T(6))]);
await push(D, [], [syncDay('d1', '2026-09-20', true, T(4))]);
p = await pull(D, null);
check('an un-completion survives a stale completion arriving later',
  day(p, 'd1', '2026-09-20')?.done === false && day(p, 'd1', '2026-09-20')?.completed_at === null,
  JSON.stringify(day(p, 'd1', '2026-09-20')));

await push(D, [{ local_id: 'd1', deleted: true, client_updated_at: T(7) }], []);
await push(D, [syncHabit('d1', 'Resurrected?', T(9))], []);
p = await pull(D, null);
check('a deleted habit stays deleted even after a newer edit',
  p.habits[0].deleted_at !== null && p.habits[0].title === 'Run 5k', JSON.stringify(p.habits[0]));
check('completions of a deleted habit are no longer pulled', p.completions.length === 0, JSON.stringify(p.completions));
r = await push(D, [{ local_id: 'never-synced', deleted: true, client_updated_at: T(8) }], []);
check('deleting a habit the server never saw is a harmless no-op', r.habits_deleted === 0, JSON.stringify(r));

r = await push(D, [
  syncHabit('d2', 'Good habit', T(10)),
  syncHabit('d3', 'Bad frequency', T(10), { frequency: [true] }),
  syncHabit('d4', 'Infinite clock', 'infinity'),
  syncHabit('d4b', 'Word clock', 'now'),
], [
  syncDay('d2', '2026-02-30', true, T(10)),
  syncDay('d2', '2026-09-18', true, 'not-a-time'),
  syncDay('d2', '2026-09-17', true, T(10)),
  syncDay('ghost', '2026-09-17', true, T(10)),
]);
check('bad rows are skipped one by one; the rest of the batch still lands',
  r.habits_written === 1 && r.completions_written === 1, JSON.stringify(r));

r = await push(D, [syncHabit('d5', 'Dup', T(11)), syncHabit('d5', 'Dup newer', T(12))],
  [syncDay('d2', '2026-09-16', true, T(11)), syncDay('d2', '2026-09-16', false, T(12))]);
p = await pull(D, null);
check('duplicate keys in one batch keep the newest and do not error',
  r.habits_written === 1 && r.completions_written === 1 &&
  p.habits.find((h) => h.local_id === 'd5')?.title === 'Dup newer' && day(p, 'd2', '2026-09-16')?.done === false,
  JSON.stringify(r));

const cursor = (await pull(D, null)).server_time;
await push(D, [syncHabit('d6', 'Later', T(20))], []);
p = await pull(D, cursor);
check('incremental pull returns only what changed since the cursor',
  p.habits.map((h) => h.local_id).join() === 'd6' && p.completions.length === 0, JSON.stringify(p));

await push(A, [syncHabit('d2', 'Alice overwrite attempt', T(59), { user_id: D })], [syncDay('d2', '2026-09-17', false, T(59))]);
p = await pull(D, null);
check("another user pushing the same local_id cannot touch dave's data",
  p.habits.find((h) => h.local_id === 'd2')?.title === 'Good habit' && day(p, 'd2', '2026-09-17')?.done === true,
  JSON.stringify(p.habits.find((h) => h.local_id === 'd2')));
check("dave's rows never appear in alice's pull",
  !(await pull(A, null)).habits.some((h) => h.title === 'Good habit'), 'leak');
await expectError('anon cannot call sync_push',
  () => as(null, () => db.query("select public.sync_push('[]'::jsonb, '[]'::jsonb)")), /permission denied/i);
await expectError('anon cannot call sync_pull',
  () => as(null, () => db.query('select public.sync_pull(null)')), /permission denied/i);

const daveBoard = await as(D, () => rows("select bricks from public.friends_leaderboard('2026-01-01')"));
check('leaderboard counts only done completions of habits that still exist',
  daveBoard.length === 1 && Number(daveBoard[0].bricks) === 1, JSON.stringify(daveBoard));
// ------------------------------------------------------------ social (0007)
console.log('\n== Social: friendship consent ==');
const M = '0000000a-0000-4000-8000-00000000000a'; // mallory
const V = '0000000b-0000-4000-8000-00000000000b'; // victim
const X = '0000000c-0000-4000-8000-00000000000c'; // bystander
for (const [id, name] of [[M, 'mallory'], [V, 'victim'], [X, 'bystander']]) {
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
    [id, name + '@example.com', JSON.stringify({ username: name })]);
}
const sees = async (viewer, target) =>
  (await as(viewer, () => rows('select 1 from public.profiles where id = $1', [target]))).length === 1;
const friendshipsBetween = (a, b) => db.query(
  'select * from public.friendships where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)', [a, b]);

await expectError('a client cannot insert a pre-accepted friendship',
  () => as(M, () => db.query("insert into public.friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')", [M, V])),
  /row-level security|permission denied/i);
check('...so mallory still cannot see the victim', !(await sees(M, V)), 'visible');

await as(X, () => db.query('select public.send_friend_request($1)', [M]));
const hijack = await as(M, () => db.query(
  "update public.friendships set requester_id = $1, status = 'accepted' where addressee_id = $2", [V, M]))
  .then((r) => r.affectedRows, () => 0);
check('an addressee cannot rewrite a request into a friendship with someone else', hijack === 0 && !(await sees(M, V)),
  `updated ${hijack} row(s)`);

console.log('\n== Social: requests ==');
await db.query('delete from public.friendships where requester_id = any($1) or addressee_id = any($1)', [[M, V, X]]);
const req = (await as(M, () => rows('select public.send_friend_request($1) as id', [V])))[0].id;
check('send_friend_request creates a pending request', (await friendshipsBetween(M, V)).rows[0]?.status === 'pending', 'no row');
check('a pending request reveals nothing yet', !(await sees(M, V)) && !(await sees(V, M)), 'visible while pending');
await expectError('only the addressee can respond',
  () => as(M, () => db.query('select public.respond_to_friend_request($1, true)', [req])), /not found/i);
await as(V, () => db.query('select public.respond_to_friend_request($1, true)', [req]));
check('accepting makes both profiles visible', (await sees(M, V)) && (await sees(V, M)), 'not visible');
await expectError('you cannot befriend yourself',
  () => as(M, () => db.query('select public.send_friend_request($1)', [M])), /yourself/i);
const resent = (await as(M, () => rows('select public.send_friend_request($1) as id', [V])))[0].id;
check('re-sending to an existing friend is a harmless no-op', resent === req && (await friendshipsBetween(M, V)).rows.length === 1, resent);

await db.query('delete from public.friendships where requester_id = any($1) or addressee_id = any($1)', [[M, V, X]]);
await as(X, () => db.query('select public.send_friend_request($1)', [V]));
await as(V, () => db.query('select public.send_friend_request($1)', [X]));
check('two people asking each other become friends', (await friendshipsBetween(X, V)).rows[0]?.status === 'accepted', 'not accepted');

const dec = (await as(M, () => rows('select public.send_friend_request($1) as id', [X])))[0].id;
await as(X, () => db.query('select public.respond_to_friend_request($1, false)', [dec]));
check('declining removes the request', (await friendshipsBetween(M, X)).rows.length === 0, 'still there');

const mine = await as(V, () => rows('select * from public.my_friendships()'));
check('my_friendships lists friends with their identity',
  mine.length === 1 && mine[0].username === 'bystander' && mine[0].status === 'accepted', JSON.stringify(mine));
const pendingReq = (await as(M, () => rows('select public.send_friend_request($1) as id', [V])))[0].id;
const incoming = (await as(V, () => rows('select * from public.my_friendships()'))).find((f) => f.friendship_id === pendingReq);
check('...and an incoming request shows who sent it', incoming?.direction === 'incoming' && incoming?.username === 'mallory',
  JSON.stringify(incoming));

console.log('\n== Social: blocking ==');
await as(V, () => db.query('select public.block_user($1)', [M]));
check('blocking removes any friendship or request', (await friendshipsBetween(M, V)).rows.length === 0, 'row survived');
await expectError('a blocked user cannot send a new request (generic error, block not revealed)',
  () => as(M, () => db.query('select public.send_friend_request($1)', [V])), /could not send/i);
check('a blocked user cannot find the blocker by search',
  (await as(M, () => rows("select username from public.search_profiles('vic')"))).length === 0, 'found');
check('search treats % and _ literally, so the user base cannot be enumerated',
  (await as(X, () => rows("select * from public.search_profiles('%%%')"))).length === 0 &&
  (await as(X, () => rows("select * from public.search_profiles('___')"))).length === 0, 'wildcards matched users');
check('the blocker cannot find them either',
  (await as(V, () => rows("select username from public.search_profiles('mal')"))).length === 0, 'found');
check('my_blocks lists who I blocked', (await as(V, () => rows('select username from public.my_blocks()'))).map((b) => b.username).join() === 'mallory', 'missing');
check("the blocked user cannot read the blocker's block list",
  (await as(M, () => rows('select * from public.blocks'))).length === 0, 'visible');
await as(V, () => db.query('delete from public.blocks where blocked_id = $1', [M]));
const afterUnblock = await as(M, () => rows('select public.send_friend_request($1) as id', [V]));
check('after unblocking, requests work again', !!afterUnblock[0]?.id, 'still refused');

console.log('\n== Social: milestones, feed, claps ==');
const postEvent = (uid, key, payload = { streak: 7 }) => as(uid, () => db.query(
  "insert into public.activity_events (user_id, type, payload, dedupe_key) values ($1, 'streak_milestone', $2, $3) on conflict (user_id, dedupe_key) do nothing",
  [uid, JSON.stringify(payload), key]));
await postEvent(X, 'streak:h1:7:2026-09-24');
await postEvent(X, 'streak:h1:7:2026-09-24');
check('a milestone is posted once, however many times it is sent',
  (await rows("select count(*)::int n from public.activity_events where user_id = $1", [X]))[0].n === 1, 'duplicated');
await expectError('an oversized payload is rejected',
  () => postEvent(X, 'big', { junk: 'x'.repeat(2000) }), /check constraint|violates/i);
await expectError('a non-object payload is rejected',
  () => as(X, () => db.query("insert into public.activity_events (user_id, type, payload, dedupe_key) values ($1, 'streak_milestone', '\"text\"', 'k2')", [X])),
  /check constraint|violates/i);
await postEvent(M, 'streak:m1:7:2026-09-24');
const vFeed = await as(V, () => rows('select username from public.friend_feed(50, null)'));
check("the feed shows friends' milestones and not strangers'",
  vFeed.some((e) => e.username === 'bystander') && !vFeed.some((e) => e.username === 'mallory'), JSON.stringify(vFeed));
const xEvent = (await rows('select id from public.activity_events where user_id = $1', [X]))[0].id;
await as(V, () => db.query('insert into public.claps (event_id, user_id) values ($1, $2)', [xEvent, V]));
const clapped = await as(V, () => rows('select clap_count, i_clapped from public.friend_feed(50, null) where id = $1', [xEvent]));
check('a friend can clap, and the feed counts it', Number(clapped[0]?.clap_count) === 1 && clapped[0]?.i_clapped === true, JSON.stringify(clapped));
const mEvent = (await rows('select id from public.activity_events where user_id = $1', [M]))[0].id;
await expectError("a stranger cannot clap on someone's milestone",
  () => as(V, () => db.query('insert into public.claps (event_id, user_id) values ($1, $2)', [mEvent, V])),
  /row-level security/i);
finish();
