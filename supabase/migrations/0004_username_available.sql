-- ---------------------------------------------------------------------------
-- HabitBrick — username availability check for the sign-up form
--
-- Why this exists: someone filling in the sign-up form is not authenticated
-- yet, and search_profiles() is revoked from anon. Without this, the form has
-- no way to tell a user their name is taken before they submit.
--
-- It also cannot be left to the unique index alone: when handle_new_user()
-- hits the index, Supabase Auth surfaces a generic "Database error saving new
-- user", not a message that names the username. The user would just see
-- "Something went wrong".
--
-- Exposure is deliberately narrower than search_profiles():
--   * exact, case-insensitive match on ONE name — no prefix, no listing
--   * returns a single boolean — no id, no display name, no avatar
--   * invalid formats return false, so it cannot be used to probe odd inputs
-- Revealing that one specific username exists is inherent to any sign-up form,
-- and usernames are meant to be shared so friends can find each other.
-- ---------------------------------------------------------------------------

create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select trim(name) ~ '^[A-Za-z0-9_]{3,20}$'
     and not exists (
       select 1 from public.profiles p
       where p.username = trim(name)::citext
     );
$fn$;

revoke execute on function public.username_available(text) from public;
grant  execute on function public.username_available(text) to anon, authenticated;
