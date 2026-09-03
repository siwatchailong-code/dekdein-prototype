-- =========================================================================
-- dekdein. — Supabase schema
--
-- Run this once in your Supabase project's SQL Editor (or via the CLI:
-- `supabase db push` / `psql < supabase/schema.sql`).
--
-- Covers:
--   1. public.profiles table (1:1 with auth.users)
--   2. updated_at auto-touch trigger
--   3. auto-create a profiles row right after a new auth.users signup
--   4. Row Level Security policies
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1) profiles table
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'customer'
              check (role in ('customer', 'provider')),
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth.users id. Created automatically by the on_auth_user_created trigger below.';

-- ---------------------------------------------------------------------
-- 2) keep updated_at current on every UPDATE
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3) auto-create a profile row right after signup
--    full_name / role come from the metadata the client passes into
--    supabase.auth.signUp({ options: { data: { full_name, role } } })
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'customer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4) Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Signed-in users can read profiles (needed to show a provider's name /
-- role / avatar when browsing or matching). No anonymous access.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- Users may only update their own row.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Fallback insert policy for the user's own row. In normal operation the
-- on_auth_user_created trigger (security definer) creates the row, so the
-- client never needs to insert directly — this just prevents the app from
-- being blocked if a profile is ever missing.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- No delete policy is defined on purpose — profiles are removed only via
-- the `on delete cascade` when the underlying auth.users row is deleted.
