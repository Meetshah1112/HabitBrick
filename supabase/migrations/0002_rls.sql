-- ---------------------------------------------------------------------------
-- HabitBrick — Row Level Security
--
-- Privacy posture:
--   * A friend can see your PROFILE and your MILESTONES.
--   * A friend can NEVER see your habits or raw completions. Habit titles are
--     often deeply personal ("take meds", "therapy"). Aggregate brick counts
--     reach the leaderboard only through a SECURITY DEFINER function that
--     emits counts and never titles (see 0003_functions.sql).
-- ---------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.habits            enable row level security;
alter table public.habit_completions enable row level security;
alter table public.friendships       enable row level security;
alter table public.activity_events   enable row level security;
alter table public.claps             enable row level security;

-- ── friendship helper ──────────────────────────────────────────────────────
-- SECURITY DEFINER because policies on other tables call this; without it the
-- lookup would recurse into friendships' own RLS. search_path is pinned to
-- defeat search_path hijacking.
-- Takes ONE argument and always compares against auth.uid(). A two-argument
-- version would let any signed-in user probe whether two strangers are
-- friends: policies require EXECUTE to be granted to authenticated, so the
-- function cannot simply be revoked. Binding one side to the caller removes
-- that oracle entirely.
create or replace function public.is_friend(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = other)
        or (f.requester_id = other and f.addressee_id = auth.uid()))
  );
$fn$;

revoke execute on function public.is_friend(uuid) from public, anon;
grant  execute on function public.is_friend(uuid) to authenticated;

-- ── profiles ───────────────────────────────────────────────────────────────
-- Direct SELECT is limited to self + accepted friends. Discovery by username
-- goes through search_profiles() instead, which caps and narrows the exposure.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_friend(id));

create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ── habits / completions — strictly own rows ───────────────────────────────
create policy habits_own on public.habits for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy completions_own on public.habit_completions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── friendships ────────────────────────────────────────────────────────────
create policy friendships_select on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- You may only ever send a request AS yourself.
create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester_id = auth.uid());

-- Only the addressee accepts/blocks. The USING clause pins who may act; the
-- WITH CHECK clause stops them rewriting the row to a different pair.
create policy friendships_update on public.friendships for update to authenticated
  using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid());

-- Either party may cancel a request or unfriend.
create policy friendships_delete on public.friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ── activity_events ────────────────────────────────────────────────────────
create policy activity_select on public.activity_events for select to authenticated
  using (user_id = auth.uid() or public.is_friend(user_id));

create policy activity_insert on public.activity_events for insert to authenticated
  with check (user_id = auth.uid());

create policy activity_delete on public.activity_events for delete to authenticated
  using (user_id = auth.uid());

-- ── claps ──────────────────────────────────────────────────────────────────
-- Visible exactly when the underlying event is visible.
create policy claps_select on public.claps for select to authenticated
  using (exists (
    select 1 from public.activity_events e
    where e.id = event_id
      and (e.user_id = auth.uid() or public.is_friend(e.user_id))
  ));

-- You clap as yourself, and only on an event you are allowed to see.
create policy claps_insert on public.claps for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.activity_events e
      where e.id = event_id
        and (e.user_id = auth.uid() or public.is_friend(e.user_id))
    )
  );

create policy claps_delete on public.claps for delete to authenticated
  using (user_id = auth.uid());
