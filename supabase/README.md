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

Four functions deliberately bypass RLS. Each is `SECURITY DEFINER` with a
pinned `search_path`, revoked from `public`, and (except `username_available`) granted only
to `authenticated`:

- `is_friend(other)` — takes one argument and always compares against
  `auth.uid()`. A two-argument form would let any signed-in user probe whether
  two strangers are friends, and it cannot be revoked because policies need
  `EXECUTE`.
- `search_profiles(q)` — friend discovery. Prefix match only, minimum 3
  characters so `''` cannot dump the table, hard limit of 10, identity columns
  only.
- `friends_leaderboard(since_date)` — counts only, as described above.
- `username_available(name)` — the one function granted to `anon`, because
  someone on the sign-up form is not authenticated yet. Exact
  case-insensitive match on a single name, returns a boolean only, and
  invalid formats return `false`. Revealing that one specific name exists is
  inherent to any sign-up form.

`friend_feed()` is deliberately `SECURITY INVOKER` so RLS on `activity_events`
stays the single enforcement point rather than being duplicated in function
logic.

### Known gap: blocking is not yet enforced

`friendship_status` includes `'blocked'`, but a blocked user can currently
delete the friendship row (the delete policy allows either party) and send a
fresh request, which clears the block.

Blocking should not live on the friendship row for exactly this reason. It
needs its own `blocks` table that survives the friendship being deleted, plus
a policy denying `friendships` insert when a block exists in either direction.
Tracked for the social phase — do not ship user-facing "Block" UI until then.

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

`validate.sh` does the same migration check against a Postgres 16 Docker
container, if you prefer Docker.

Not covered: the real Supabase `auth` schema and PostgREST. The stub mimics
`auth.uid()` and Supabase's default grants, so run the migrations against a
real (staging) project before shipping.
