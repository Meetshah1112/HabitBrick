# Supabase

## Migrations

Apply in order:

| File | Contents |
|------|----------|
| `0001_schema.sql` | Tables, enums, indexes, signup trigger |
| `0002_rls.sql` | Row Level Security policies + `is_friend()` helper |
| `0003_functions.sql` | `search_profiles`, `friend_feed`, `friends_leaderboard` |
| `0004_username_available.sql` | Exact-match username check for the sign-up form |
| `0005_completion_owner_integrity.sql` | Composite FK: a completion's owner must match its habit's owner |
| `0006_two_way_sync.sql` | Last-writer-wins `sync_push` / `sync_pull`, completion tombstones, leaderboard fix |
| `0007_social_consent_and_blocking.sql` | Consent-checked friend requests, blocks, literal search, bounded milestone payloads |

Paste each into the Supabase dashboard SQL editor, or run them with the
Supabase CLI once a project is linked.

## Privacy model

The rule the schema is built around:

> A friend sees your **profile** and your **milestones**. A friend never sees
> your **habits** or **raw completions**.

Habit titles are frequently personal ("take meds", "therapy"), so `habits` and
`habit_completions` are own-rows-only under RLS with no friend exception.
Aggregate brick counts reach the leaderboard solely through
`friends_leaderboard()`, a `SECURITY DEFINER` function that emits counts and
profile identity — never a title, category, or per-day row.

These functions deliberately bypass RLS. Each is `SECURITY DEFINER` with a
pinned `search_path`, revoked from `public` and `anon`, and granted only to
`authenticated` unless noted:

- `is_friend(other)` — takes one argument and always compares against
  `auth.uid()`. A two-argument form would let any signed-in user probe whether
  two strangers are friends, and it cannot be revoked because policies need
  `EXECUTE`.
- `search_profiles(q)` — friend discovery. Literal prefix match (LIKE
  wildcards are escaped, so `'%%%'` cannot match everyone), minimum 3
  characters, hard limit of 10, identity columns only, and never across a
  block in either direction.
- `friends_leaderboard(since_date)` — counts only, as described above.
- `username_available(name)` — granted to `anon`, because someone on the
  sign-up form is not authenticated yet. Exact case-insensitive match on a
  single name, returns a boolean only.
- `send_friend_request(target)`, `respond_to_friend_request(id, accept)` —
  the ONLY way to create or accept a friendship (see below).
- `block_user(target)` — ends any friendship and records the block in one
  transaction.
- `my_friendships()`, `my_blocks()` — list the caller's own rows with the
  other person's identity, which `profiles_select` would otherwise hide for a
  pending request.
- `blocked_between(a, b)` — internal only: revoked from every client role,
  because a two-argument block check is an oracle.

`friend_feed()` and `sync_push()` / `sync_pull()` are deliberately
`SECURITY INVOKER`, so RLS stays the single enforcement point.

### Friendship consent (0007)

Clients cannot write friendship rows at all; there is no insert or update
policy. Before 0007 there were, and both could be abused: the insert policy
did not check the status, so a client could insert a friendship that was
already `'accepted'`; the update policy did not pin the ids, so the addressee
of any request could rewrite `requester_id` to a third person and accept.
Either way, someone became your friend without asking and could see your
profile, milestones and leaderboard counts.

Now `send_friend_request` creates a pending request (or accepts one the other
person already sent: asking back is consent from both sides), and only the
addressee can answer it through `respond_to_friend_request`. Deleting
(cancel, decline, unfriend) stays a plain policy, because removing a
friendship can never create one.

### Blocking

Blocks live in their own `blocks` table rather than on the friendship row,
which either party could delete, silently dropping the block. A block
removes the friendship, stops new requests (with the same generic error as a
nonexistent user, so a block is never revealed), and hides each person from
the other's search. Only the blocker can see or remove it. The old
`'blocked'` enum value is unused.

### What friends can see

A friend sees your profile, your milestones (streaks, brick counts, tiers,
and non-category badges) and your weekly brick count. Never your habits, and
never category badges such as "Healthy Living" or "Money Maker", which would
reveal what kind of habit you track. Milestone payloads are capped at 512
bytes and rendered by the reader's app from its own tables, never from
strings in the payload.

### Known limits

- Username search is still an enumeration surface: an attacker can walk
  prefixes three letters at a time. Rate limiting belongs at the API gateway.
- Nothing rate-limits friend requests yet.
- Usernames and display names are user-chosen text shown to other people,
  with no filtering and no "report" flow. App Store guideline 1.2 and Google
  Play's user-generated-content policy expect both before release.

## Two-way sync

The server is the conflict arbiter. Every synced value is a last-writer-wins
register keyed by the **client's** action time (`client_updated_at`):

| Value | Key | Rule |
|---|---|---|
| Habit definition | `(user_id, local_id)` | Newer client clock wins. A deleted habit stays deleted; no later edit resurrects it. |
| Completion | `(habit_id, completed_on)` | Newer clock wins. Un-completing stores `done = false` with its own clock, so a stale device cannot re-insert the day. |

Devices send changes first, then read. `sync_push` applies each value only
when its clock is newer, so all devices converge whatever order they sync
in; `sync_pull(since)` then returns resolved values keyed on the server's
`updated_at`. Clients re-read a 5-minute window before their cursor, because
`now()` is a transaction's *start* time and a slow write can commit with an
earlier `updated_at`. Merging is idempotent, so the overlap is harmless.

Bad input (impossible dates, non-ISO or `infinity` clocks, wrong-shaped
schedules) is skipped row by row instead of failing the batch, since a batch
that always fails would stop that device from ever syncing again.

Known limits: clocks come from devices, so a device whose clock runs far
ahead wins every conflict it is in. Reminders (alarm times) and badges do not
sync; badges are re-derived from the merged history on each device. The
first pull of a large account is not paginated.

## Testing the database

```bash
npm run db:test
```

Applies every file in `migrations/` (in name order) to real Postgres running
in-process via PGlite (Postgres compiled to WASM, so no Docker is needed),
then exercises the policies as Supabase's `authenticated` and `anon` roles:
the signup trigger, `username_available`, the exact upserts the Phase 3
backup sends, cross-user isolation, friend visibility, and the leaderboard.
`_local_test_stub.sql` stands in for the Supabase-managed `auth` schema and
is never deployed.

Add a check to `tests/rls.test.mjs` for any new policy. This suite has
already caught one real bug: before `0005`, a user could attach a completion
to someone else's habit, and the owner's own completion for that day was then
silently dropped by `ON CONFLICT DO NOTHING`.

`npm run db:test` also runs `tests/sync.integration.test.mjs`: the app's
**real** sync engine, merge and outbox code (TypeScript, run natively by Node
through `tests/ts-resolve.mjs`) syncing two simulated devices through the
real `sync_push` / `sync_pull` SQL. Every scenario asserts that both devices
end up identical: concurrent edits in both sync orders, deletion versus a
later offline edit, un-completion versus a stale device, offline changes,
restoring onto a fresh install, and account isolation. Deliberately breaking
last-writer-wins in the SQL, or the deletion rule in the merge, makes it fail.

`validate.sh` does the same migration check against a Postgres 16 Docker
container, if you prefer Docker.

### Running the real app against a local database

`tests/localSyncServer.mjs` serves the handful of endpoints sync uses from
PGlite with every migration applied, so the app can run end to end in a
browser with no Supabase project. Start `local-sync-test-server` from
`.claude/launch.json`, and put `EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321`
in `.env`.

**Test only.** It reads the user id from the token without verifying the
signature, and it listens on loopback only for that reason. Two browser
origins (`localhost:8081` and `127.0.0.1:8081`) have separate storage, so they
behave as two devices signed in to one account.

Not covered: the real Supabase `auth` schema and PostgREST. The stub mimics
`auth.uid()` and Supabase's default grants, so run the migrations against a
real (staging) project before shipping.
