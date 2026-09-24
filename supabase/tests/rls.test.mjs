// Database tests: applies every migration to real Postgres (PGlite, compiled
// to WASM — no Docker needed) and exercises RLS as Supabase's `authenticated`
// and `anon` roles.
//
//   npm run db:test
//
// Every file in supabase/migrations is applied in name order, so a new
// migration is covered automatically. Add a check here for any new policy.
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS = readdirSync(join(REPO, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => 'supabase/migrations/' + f);
const db = new PGlite({ extensions: { citext, pgcrypto } });

let passed = 0, failed = 0;
const pass = (l) => { passed++; console.log('  PASS ' + l); };
const fail = (l, why) => { failed++; console.log('  FAIL ' + l + ' -- ' + why); };
const check = (l, cond, why) => (cond ? pass(l) : fail(l, why));

async function as(uid, fn) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try { return await fn(); } finally { await db.exec('reset role'); }
}
async function expectError(label, fn, pattern) {
  try { await fn(); fail(label, 'expected an error, statement succeeded'); }
  catch (e) {
    if (pattern && !pattern.test(e.message)) fail(label, 'wrong error: ' + e.message);
    else pass(label + '  [' + e.message.split('\n')[0].slice(0, 70) + ']');
  }
}
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;

// ---------------------------------------------------------------- migrations
console.log('\n== Apply migrations ==');
for (const file of ['supabase/_local_test_stub.sql', ...MIGRATIONS]) {
  try { await db.exec(readFileSync(join(REPO, file), 'utf8')); pass(file); }
  catch (e) { fail(file, e.message); console.log('\nAborting: migrations must apply cleanly.'); process.exit(1); }
}
// Mimic Supabase defaults: API roles get table privileges; RLS does the restricting.
await db.exec(`
  grant usage on schema public, auth to anon, authenticated;
  grant all on all tables in schema public to anon, authenticated;
  grant all on all sequences in schema public to anon, authenticated;
`);

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
await as(A, () => db.query("insert into public.friendships (requester_id, addressee_id) values ($1, $2)", [A, B]));
await expectError('reciprocal duplicate request is rejected', () => as(B, () => db.query("insert into public.friendships (requester_id, addressee_id) values ($1, $2)", [B, A])), /duplicate key|unique/i);
check('requester cannot accept their own request',
  (await as(A, () => db.query("update public.friendships set status = 'accepted' where requester_id = $1", [A]))).affectedRows === 0, 'accepted by requester');
check('pending: bob cannot see alice\'s profile yet', (await as(B, () => rows('select * from public.profiles where id = $1', [A]))).length === 0, 'visible while pending');
await as(B, () => db.query("update public.friendships set status = 'accepted', responded_at = now() where addressee_id = $1", [B]));
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
