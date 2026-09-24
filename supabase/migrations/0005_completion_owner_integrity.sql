-- ---------------------------------------------------------------------------
-- HabitBrick — a completion must belong to the same user as its habit
--
-- Found by running the migrations on real Postgres: completions_own only
-- checks `user_id = auth.uid()`; it never checks who owns `habit_id`. So a
-- user could insert a row pointing at SOMEONE ELSE'S habit, tagged with their
-- own user_id. When the real owner later marked that day done, their row hit
-- the (habit_id, completed_on) unique index and the client's
-- `ON CONFLICT DO NOTHING` silently discarded it — their completion was lost,
-- and the planted row inflated the attacker's leaderboard count.
--
-- Exploiting it needs the victim's habit UUID, which RLS never exposes, so the
-- likelihood is low — but the failure is silent data loss, so it is closed at
-- the schema level rather than only in a policy. A composite foreign key makes
-- a mismatched owner impossible for every role, including service_role and
-- admin scripts that bypass RLS entirely.
-- ---------------------------------------------------------------------------

-- (id) is already the primary key, so (id, user_id) is trivially unique; the
-- constraint exists only so the composite foreign key below can reference it.
alter table public.habits
  add constraint habits_id_user_id_key unique (id, user_id);

-- Replace the single-column FK with one that also pins the owner.
alter table public.habit_completions
  drop constraint habit_completions_habit_id_fkey;

alter table public.habit_completions
  add constraint habit_completions_habit_owner_fkey
  foreign key (habit_id, user_id)
  references public.habits (id, user_id)
  on delete cascade;
