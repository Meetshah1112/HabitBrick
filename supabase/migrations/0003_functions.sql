-- ---------------------------------------------------------------------------
-- HabitBrick — RPCs for discovery, feed, and leaderboard
-- ---------------------------------------------------------------------------

-- ── friend discovery ───────────────────────────────────────────────────────
-- profiles_select deliberately hides non-friends, so discovery needs a
-- controlled bypass. Username search is inherently an enumeration surface;
-- this narrows it as far as is practical while still being usable:
--   * prefix match only (no '%foo%' fishing)
--   * minimum 3 characters, so '' cannot dump the table
--   * hard limit of 10 rows
--   * returns identity columns only — never habits, counts, or email
create or replace function public.search_profiles(q text)
returns table (id uuid, username citext, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $fn$
  select p.id, p.username, p.display_name, p.avatar_url
    from public.profiles p
   where auth.uid() is not null
     and length(trim(q)) >= 3
     and p.username ilike trim(q) || '%'
     and p.id <> auth.uid()
   order by length(p.username), p.username
   limit 10;
$fn$;

revoke execute on function public.search_profiles(text) from public, anon;
grant  execute on function public.search_profiles(text) to authenticated;

-- ── activity feed ──────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose: RLS on activity_events already restricts rows
-- to self + accepted friends, so the policy stays the single enforcement
-- point rather than being duplicated in function logic.
create or replace function public.friend_feed(
  limit_n   int default 50,
  before_ts timestamptz default null
)
returns table (
  id           uuid,
  user_id      uuid,
  username     citext,
  display_name text,
  avatar_url   text,
  type         activity_type,
  payload      jsonb,
  created_at   timestamptz,
  clap_count   bigint,
  i_clapped    boolean
)
language sql
stable
set search_path = public
as $fn$
  select
    e.id, e.user_id, p.username, p.display_name, p.avatar_url,
    e.type, e.payload, e.created_at,
    (select count(*) from public.claps c where c.event_id = e.id)::bigint,
    exists (
      select 1 from public.claps c2
      where c2.event_id = e.id and c2.user_id = auth.uid()
    )
  from public.activity_events e
  join public.profiles p on p.id = e.user_id
  where (before_ts is null or e.created_at < before_ts)
  order by e.created_at desc
  limit least(coalesce(limit_n, 50), 100);
$fn$;

revoke execute on function public.friend_feed(int, timestamptz) from public, anon;
grant  execute on function public.friend_feed(int, timestamptz) to authenticated;

-- ── weekly leaderboard ─────────────────────────────────────────────────────
-- SECURITY DEFINER is required: habit_completions is own-rows-only under RLS,
-- so counting a friend's bricks is impossible as the calling user. This is a
-- deliberate, audited bypass — the function emits ONLY aggregate counts and
-- profile identity. No habit title, category, or per-day row ever leaves it.
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
         count(hc.id)::bigint
    from circle c
    join public.profiles p on p.id = c.uid
    left join public.habit_completions hc
           on hc.user_id = c.uid
          and hc.completed_on >= since_date
   group by p.id, p.username, p.display_name, p.avatar_url
   order by count(hc.id) desc, p.username asc;
$fn$;

revoke execute on function public.friends_leaderboard(date) from public, anon;
grant  execute on function public.friends_leaderboard(date) to authenticated;
