-- ---------------------------------------------------------------------------
-- HabitBrick — core schema
--
-- Design notes:
--   * `local_id` on habits maps to the device-generated Habit.id. All sync is
--     keyed on (user_id, local_id) so re-running a sync is idempotent.
--   * completionLog is normalised into habit_completions rows. A JSONB blob
--     would force full-table scans for the weekly leaderboard; rows let us
--     index (user_id, completed_on).
--   * activity_events.dedupe_key stops the client re-emitting the same
--     milestone ("30-day streak") on every sync.
-- ---------------------------------------------------------------------------

create extension if not exists "citext";
create extension if not exists "pgcrypto";

-- ── profiles ───────────────────────────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     citext not null unique,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,20}$')
);

-- ── habits ─────────────────────────────────────────────────────────────────
create table public.habits (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  local_id             text not null,
  title                text not null,
  description          text,
  category             text not null,
  frequency            boolean[] not null,
  target_days_per_week smallint not null default 0,
  created_at           date not null,
  deleted_at           timestamptz,
  updated_at           timestamptz not null default now(),
  unique (user_id, local_id)
);
create index habits_user_idx on public.habits (user_id) where deleted_at is null;

-- ── habit_completions ──────────────────────────────────────────────────────
create table public.habit_completions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  habit_id     uuid not null references public.habits(id) on delete cascade,
  completed_on date not null,
  completed_at timestamptz,
  unique (habit_id, completed_on)
);
create index habit_completions_user_date_idx
  on public.habit_completions (user_id, completed_on desc);

-- ── friendships ────────────────────────────────────────────────────────────
create type friendship_status as enum ('pending', 'accepted', 'blocked');

create table public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       friendship_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_friend check (requester_id <> addressee_id)
);

-- One row per unordered pair: blocks a duplicate reciprocal request.
create unique index friendships_unique_pair on public.friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);
create index friendships_addressee_idx on public.friendships (addressee_id, status);

-- ── activity_events ────────────────────────────────────────────────────────
create type activity_type as enum (
  'brick_milestone', 'streak_milestone', 'badge_unlock', 'tier_up'
);

create table public.activity_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       activity_type not null,
  payload    jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index activity_events_user_time_idx
  on public.activity_events (user_id, created_at desc);

-- ── claps ──────────────────────────────────────────────────────────────────
create table public.claps (
  event_id   uuid not null references public.activity_events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ── auto-create a profile on signup ────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'username', ''),
      'user_' || substr(replace(new.id::text, '-', ''), 1, 8)
    ),
    nullif(new.raw_user_meta_data->>'display_name', '')
  );
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── updated_at maintenance ─────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger habits_touch before update on public.habits
  for each row execute function public.touch_updated_at();
