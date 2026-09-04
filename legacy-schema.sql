-- =========================================================================
-- ⚠️  LEGACY ONLY — DO NOT RUN AGAINST CURRENT PRODUCTION  ⚠️
--
-- This file is the ORIGINAL prototype schema from before the production
-- database was migrated to the dual-role (Customer + Freelancer) model.
-- It is kept ONLY as a historical reference for what the very first
-- version of this schema looked like.
--
-- It does NOT match the current production public.profiles table.
-- Confirmed real differences (from live production, not guessed):
--   - production's name column is `name`, this file declares `full_name`
--   - production also has is_customer, is_freelancer, availability_status,
--     phone_verified, identity_verified — not declared here at all
--   - production's handle_new_user() trigger and other functions
--     (enable_freelancer(), disable_freelancer(), enable_availability())
--     are NOT the versions below — their real current bodies were never
--     exported into this repo, so this file cannot be trusted as a source
--     for them either
--
-- Running any statement below against the live project risks recreating
-- public.profiles / the trigger / the policies in a shape that conflicts
-- with what's actually deployed (e.g. re-declaring a `full_name` column
-- and `handle_new_user()` version that no longer matches reality).
--
-- If you need a real, trustworthy schema file for this project (e.g. to
-- set up a fresh environment or write a proper migration), it must be
-- generated FROM production, not reconstructed from this file:
--   supabase db dump --schema public   (or the equivalent SQL Editor
--   "export schema" step in the Supabase dashboard)
-- Only once that export exists should a new, accurate schema/migration
-- file be written — see schema.sql for the current documentation-only
-- placeholder.
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1) profiles table (ORIGINAL / pre-migration shape)
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
-- 3) auto-create a profile row right after signup (ORIGINAL version —
--    reads 'full_name' from metadata; production's real trigger reads
--    'name' instead, per the confirmed column difference noted above)
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
