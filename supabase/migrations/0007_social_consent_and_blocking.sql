-- ---------------------------------------------------------------------------
-- HabitBrick — friendship consent, blocking, safer search (Phase 5)
--
-- Found by testing the Phase 1 policies before exposing social features:
--
--   1. friendships_insert checked only `requester_id = auth.uid()`, not the
--      status, so a client could INSERT a friendship that was already
--      'accepted' — becoming anyone's friend without asking.
--   2. friendships_update checked only `addressee_id = auth.uid()`, so the
--      addressee of any request could rewrite requester_id to a THIRD person
--      and accept: a friendship that person never asked for.
--
-- Either one exposed the victim's profile, milestones and leaderboard counts.
-- Fix: clients can no longer write friendship rows at all. Requests go
-- through send_friend_request() and answers through
-- respond_to_friend_request(), which check consent explicitly. Deleting
-- (cancel / decline / unfriend) stays a plain policy: removing a friendship
-- can never create one.
--
--   3. search_profiles matched `ilike q || '%'`. '%' and '_' are LIKE
--      wildcards, so the query '%%%' passed the 3-character minimum and
--      matched every user — the whole user base was enumerable. Wildcards are
--      now escaped so the prefix is literal.
--
-- Also adds real blocking. It cannot live on the friendship row (Phase 1's
-- 'blocked' status): either party can delete that row, which silently
-- dropped the block. The 'blocked' enum value is left in place, unused.
-- ---------------------------------------------------------------------------

drop policy friendships_insert on public.friendships;
drop policy friendships_update on public.friendships;

-- ── blocks ──────────────────────────────────────────────────────────────────

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

-- You see and remove only your own blocks. A blocked user can never read the
-- blocker's list. New blocks go through block_user(), which also ends the
-- friendship in the same transaction.
create policy blocks_select on public.blocks for select to authenticated
  using (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- Internal: two-argument, so it must NOT be callable by clients (it would be
-- an oracle for "has X blocked Y"). Used only inside SECURITY DEFINER
-- functions below, which run as the owner.
create or replace function public.blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$fn$;

revoke execute on function public.blocked_between(uuid, uuid) from public, anon, authenticated;

-- ── requests ────────────────────────────────────────────────────────────────

create or replace function public.send_friend_request(target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid      uuid := auth.uid();
  existing public.friendships%rowtype;
  new_id   uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if target = uid then
    raise exception 'You cannot befriend yourself' using errcode = '22023';
  end if;
  -- One message for "no such user" and "blocked": never reveal a block.
  if not exists (select 1 from public.profiles where id = target)
     or public.blocked_between(uid, target) then
    raise exception 'Could not send the request' using errcode = 'P0001';
  end if;

  select * into existing
    from public.friendships
   where (requester_id = uid and addressee_id = target)
      or (requester_id = target and addressee_id = uid)
   for update;

  if found then
    -- They already asked us: asking back is consent from both sides.
    if existing.status = 'pending' and existing.addressee_id = uid then
      update public.friendships
         set status = 'accepted', responded_at = now()
       where id = existing.id;
    end if;
    return existing.id;
  end if;

  begin
    insert into public.friendships (requester_id, addressee_id, status)
    values (uid, target, 'pending')
    returning id into new_id;
  exception when unique_violation then
    -- Both people asked at the same instant; the other request won the race.
    select id into new_id
      from public.friendships
     where (requester_id = uid and addressee_id = target)
        or (requester_id = target and addressee_id = uid);
  end;
  return new_id;
end;
$fn$;

create or replace function public.respond_to_friend_request(request_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  -- Only the ADDRESSEE may answer, only a PENDING request, and nothing but
  -- the status changes — the ids are never client-supplied.
  if accept then
    update public.friendships
       set status = 'accepted', responded_at = now()
     where id = request_id and addressee_id = uid and status = 'pending';
  else
    delete from public.friendships
     where id = request_id and addressee_id = uid and status = 'pending';
  end if;

  if not found then
    raise exception 'Friend request not found' using errcode = 'P0002';
  end if;
end;
$fn$;

-- ── blocking ────────────────────────────────────────────────────────────────

create or replace function public.block_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if target = uid then
    raise exception 'You cannot block yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  delete from public.friendships
   where (requester_id = uid and addressee_id = target)
      or (requester_id = target and addressee_id = uid);
  insert into public.blocks (blocker_id, blocked_id) values (uid, target)
  on conflict do nothing;
end;
$fn$;

-- ── listing ─────────────────────────────────────────────────────────────────
-- profiles_select hides non-friends, so a pending request could not show who
-- sent it. These reveal the other party's identity only for rows that
-- already involve the caller.

create or replace function public.my_friendships()
returns table (
  friendship_id uuid,
  other_id      uuid,
  username      citext,
  display_name  text,
  avatar_url    text,
  status        friendship_status,
  direction     text,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select f.id,
         p.id,
         p.username,
         p.display_name,
         p.avatar_url,
         f.status,
         case when f.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
         f.created_at
    from public.friendships f
    join public.profiles p
      on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
   where auth.uid() is not null
     and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
     and not public.blocked_between(f.requester_id, f.addressee_id)
   order by f.status, f.created_at desc;
$fn$;

create or replace function public.my_blocks()
returns table (blocked_id uuid, username citext, display_name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $fn$
  select b.blocked_id, p.username, p.display_name, b.created_at
    from public.blocks b
    join public.profiles p on p.id = b.blocked_id
   where b.blocker_id = auth.uid()
   order by b.created_at desc;
$fn$;

-- ── search: literal prefix, and never across a block ────────────────────────

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
     -- Escape LIKE metacharacters so the prefix is literal ('%%%' must not
     -- match everyone). Usernames may contain '_', which needs escaping too.
     and p.username ilike
         replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
     and p.id <> auth.uid()
     and not public.blocked_between(auth.uid(), p.id)
   order by length(p.username), p.username
   limit 10;
$fn$;

-- ── milestones: bounded shape ───────────────────────────────────────────────
-- The payload is rendered in friends' feeds, so it must never become a
-- channel for arbitrary text: a small object only. Clients also render labels
-- from their own ids and numbers, never from payload strings.

alter table public.activity_events
  add constraint activity_payload_shape
    check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 512),
  add constraint activity_dedupe_key_length
    check (length(dedupe_key) between 1 and 128);

-- ── grants ──────────────────────────────────────────────────────────────────

revoke execute on function public.send_friend_request(uuid) from public, anon;
revoke execute on function public.respond_to_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.block_user(uuid) from public, anon;
revoke execute on function public.my_friendships() from public, anon;
revoke execute on function public.my_blocks() from public, anon;
grant  execute on function public.send_friend_request(uuid) to authenticated;
grant  execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant  execute on function public.block_user(uuid) to authenticated;
grant  execute on function public.my_friendships() to authenticated;
grant  execute on function public.my_blocks() to authenticated;
