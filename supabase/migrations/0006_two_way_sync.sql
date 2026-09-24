-- ---------------------------------------------------------------------------
-- HabitBrick — two-way sync (Phase 4)
--
-- The server is the conflict arbiter. Every synced value is a last-writer-wins
-- register keyed by the CLIENT's action time (client_updated_at):
--
--   * habit definition  — per (user_id, local_id); a deleted habit stays
--                         deleted: no later edit can resurrect it
--   * completion        — per (habit_id, completed_on), with `done` so that an
--                         un-completion is a timestamped state, not a missing
--                         row that a stale device would re-insert
--
-- Writes go through sync_push(), which applies each register only when the
-- incoming clock is newer, so every device converges on the same state no
-- matter what order they sync in. Reads go through sync_pull(since), keyed on
-- the SERVER's updated_at.
--
-- Bad client input (impossible dates, malformed timestamps, wrong-shaped
-- frequency) is skipped row by row rather than failing the statement. A batch
-- that always fails would be a poison pill: the client would retry the same
-- payload forever and never sync again.
-- ---------------------------------------------------------------------------

-- ── lenient parsers: NULL instead of an error ───────────────────────────────

create or replace function public.try_date(value text)
returns date
language plpgsql
stable
as $fn$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return value::date;               -- raises on e.g. 2026-02-30
exception when others then
  return null;
end;
$fn$;

-- ISO-8601 only. Plain casts would also accept 'now', 'epoch' and 'infinity';
-- an 'infinity' clock would win every future write for that row.
create or replace function public.try_timestamptz(value text)
returns timestamptz
language plpgsql
stable
as $fn$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then
    return null;
  end if;
  return value::timestamptz;
exception when others then
  return null;
end;
$fn$;

create or replace function public.try_frequency(value jsonb)
returns boolean[]
language sql
immutable
as $fn$
  select case
    when jsonb_typeof(value) = 'array'
     and jsonb_array_length(value) = 7
     and not exists (
       select 1 from jsonb_array_elements(value) e where jsonb_typeof(e) <> 'boolean'
     )
    then array(
      select e::text::boolean
      from jsonb_array_elements(value) with ordinality as t(e, ord)
      order by ord
    )
  end;
$fn$;

revoke execute on function public.try_date(text) from public;
revoke execute on function public.try_timestamptz(text) from public;
revoke execute on function public.try_frequency(jsonb) from public;
grant execute on function public.try_date(text) to authenticated;
grant execute on function public.try_timestamptz(text) to authenticated;
grant execute on function public.try_frequency(jsonb) to authenticated;

-- ── columns ─────────────────────────────────────────────────────────────────
-- Existing rows (from the Phase 3 backup) get the migration time as their
-- clock, so any later real change on a device still wins over them.

alter table public.habits
  add column client_updated_at timestamptz not null default now();

alter table public.habit_completions
  add column done              boolean     not null default true,
  add column client_updated_at timestamptz not null default now(),
  add column updated_at        timestamptz not null default now();

create trigger habit_completions_touch before update on public.habit_completions
  for each row execute function public.touch_updated_at();

create index habits_user_updated_idx on public.habits (user_id, updated_at);
create index habit_completions_user_updated_idx
  on public.habit_completions (user_id, updated_at);

-- ── sync_push ───────────────────────────────────────────────────────────────
-- SECURITY INVOKER: RLS stays the enforcement point. user_id is always taken
-- from auth.uid(), never from the payload.

create or replace function public.sync_push(p_habits jsonb, p_completions jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  uid                 uuid := auth.uid();
  habits_written      int  := 0;
  habits_deleted      int  := 0;
  completions_written int  := 0;
begin
  if uid is null then
    raise exception 'sync_push requires an authenticated user' using errcode = '28000';
  end if;

  -- 1. Habit definitions (newer client clock wins; deleted habits are final).
  with raw as (
    select h
    from jsonb_array_elements(coalesce(p_habits, '[]'::jsonb)) as h
    where jsonb_typeof(h) = 'object' and coalesce(h->>'deleted', 'false') <> 'true'
  ),
  parsed as (
    select distinct on (h->>'local_id')
      h->>'local_id'                                   as local_id,
      h->>'title'                                      as title,
      h->>'description'                                as description,
      h->>'category'                                   as category,
      public.try_frequency(h->'frequency')             as frequency,
      case when h->>'target_days_per_week' ~ '^[0-7]$'
           then (h->>'target_days_per_week')::smallint end as target,
      public.try_date(h->>'created_at')                as created_at,
      public.try_timestamptz(h->>'client_updated_at')  as clock
    from raw
    order by h->>'local_id', public.try_timestamptz(h->>'client_updated_at') desc nulls last
  )
  insert into public.habits as t
    (user_id, local_id, title, description, category, frequency,
     target_days_per_week, created_at, client_updated_at)
  select uid, local_id, title, description, category, frequency, target, created_at, clock
  from parsed
  where length(local_id) between 1 and 64
    and title is not null and category is not null and frequency is not null
    and target is not null and created_at is not null and clock is not null
  on conflict (user_id, local_id) do update set
    title                = excluded.title,
    description          = excluded.description,
    category             = excluded.category,
    frequency            = excluded.frequency,
    target_days_per_week = excluded.target_days_per_week,
    created_at           = excluded.created_at,
    client_updated_at    = excluded.client_updated_at
  where t.deleted_at is null
    and t.client_updated_at < excluded.client_updated_at;
  get diagnostics habits_written = row_count;

  -- 2. Deletions: sticky tombstones. A deletion for a habit the server never
  --    saw (created and deleted offline) simply matches nothing.
  with doomed as (
    select distinct on (h->>'local_id')
      h->>'local_id' as local_id,
      coalesce(public.try_timestamptz(h->>'client_updated_at'), now()) as clock
    from jsonb_array_elements(coalesce(p_habits, '[]'::jsonb)) as h
    where jsonb_typeof(h) = 'object' and h->>'deleted' = 'true'
    order by h->>'local_id'
  )
  update public.habits t
     set deleted_at        = d.clock,
         client_updated_at = greatest(t.client_updated_at, d.clock)
    from doomed d
   where t.user_id = uid and t.local_id = d.local_id and t.deleted_at is null;
  get diagnostics habits_deleted = row_count;

  -- 3. Completions, attached through the caller's own habits only. Rows for a
  --    habit the caller does not have on the server are dropped.
  with parsed as (
    select distinct on (c->>'local_id', public.try_date(c->>'completed_on'))
      c->>'local_id'                                   as local_id,
      public.try_date(c->>'completed_on')              as completed_on,
      case c->>'done' when 'true' then true when 'false' then false end as done,
      public.try_timestamptz(c->>'completed_at')       as completed_at,
      public.try_timestamptz(c->>'client_updated_at')  as clock
    from jsonb_array_elements(coalesce(p_completions, '[]'::jsonb)) as c
    where jsonb_typeof(c) = 'object'
    order by c->>'local_id', public.try_date(c->>'completed_on'),
             public.try_timestamptz(c->>'client_updated_at') desc nulls last
  )
  insert into public.habit_completions as t
    (user_id, habit_id, completed_on, done, completed_at, client_updated_at)
  select uid, h.id, p.completed_on, p.done,
         case when p.done then p.completed_at end, p.clock
  from parsed p
  join public.habits h on h.user_id = uid and h.local_id = p.local_id
  where p.completed_on is not null and p.done is not null and p.clock is not null
  on conflict (habit_id, completed_on) do update set
    done              = excluded.done,
    completed_at      = excluded.completed_at,
    client_updated_at = excluded.client_updated_at
  where t.client_updated_at < excluded.client_updated_at;
  get diagnostics completions_written = row_count;

  return jsonb_build_object(
    'habits_written',      habits_written,
    'habits_deleted',      habits_deleted,
    'completions_written', completions_written,
    'server_time',         now()
  );
end;
$fn$;

revoke execute on function public.sync_push(jsonb, jsonb) from public, anon;
grant  execute on function public.sync_push(jsonb, jsonb) to authenticated;

-- ── sync_pull ───────────────────────────────────────────────────────────────
-- Everything of the caller's that changed at or after p_since (NULL = all).
-- server_time is the next cursor. Callers should overlap the cursor by a few
-- minutes: now() is the transaction START, so a write that commits after this
-- read but started before it carries an earlier updated_at. Merging is
-- idempotent, so re-reading a few rows is harmless.

create or replace function public.sync_pull(p_since timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
  select jsonb_build_object(
    'server_time', now(),
    'habits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'local_id',             h.local_id,
        'title',                h.title,
        'description',          h.description,
        'category',             h.category,
        'frequency',            to_jsonb(h.frequency),
        'target_days_per_week', h.target_days_per_week,
        'created_at',           h.created_at,
        'client_updated_at',    h.client_updated_at,
        'deleted_at',           h.deleted_at
      ) order by h.local_id)
      from public.habits h
      where h.user_id = auth.uid()
        and (p_since is null or h.updated_at >= p_since)
    ), '[]'::jsonb),
    'completions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'local_id',          h.local_id,
        'completed_on',      c.completed_on,
        'done',              c.done,
        'completed_at',      c.completed_at,
        'client_updated_at', c.client_updated_at
      ) order by h.local_id, c.completed_on)
      from public.habit_completions c
      join public.habits h on h.id = c.habit_id and h.deleted_at is null
      where c.user_id = auth.uid()
        and (p_since is null or c.updated_at >= p_since)
    ), '[]'::jsonb)
  );
$fn$;

revoke execute on function public.sync_pull(timestamptz) from public, anon;
grant  execute on function public.sync_pull(timestamptz) to authenticated;

-- ── leaderboard: count what the app counts ──────────────────────────────────
-- Locally, deleting a habit removes its bricks and un-completing a day removes
-- that brick. The leaderboard now matches: only done completions of habits
-- that still exist.

create or replace function public.friends_leaderboard(since_date date)
returns table (
  user_id      uuid,
  username     citext,
  display_name text,
  avatar_url   text,
  bricks       bigint
)
language sql
stable
security definer
set search_path = public
as $fn$
  with circle as (
    select auth.uid() as uid
    where auth.uid() is not null
    union
    select case
             when f.requester_id = auth.uid() then f.addressee_id
             else f.requester_id
           end
      from public.friendships f
     where f.status = 'accepted'
       and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  )
  select p.id, p.username, p.display_name, p.avatar_url,
         (select count(*)
            from public.habit_completions hc
            join public.habits hh on hh.id = hc.habit_id and hh.deleted_at is null
           where hc.user_id = c.uid
             and hc.done
             and hc.completed_on >= since_date)::bigint as bricks
    from circle c
    join public.profiles p on p.id = c.uid
   order by bricks desc, p.username asc;
$fn$;
