-- Migrate auth from Supabase Auth to Clerk.
-- Run once in the Supabase SQL editor. Non-destructive: existing rows keep
-- their user_id; Clerk users are linked to them by email on first sign-in
-- (see src/lib/api/provision.ts). users.id stays a uuid.

-- Decouple users.id from Supabase's auth.users.
alter table "users" drop constraint if exists "users_id_users_id_fk";

-- users.id now generates its own uuid (it used to be the auth.users id).
alter table "users" alter column "id" set default gen_random_uuid();

-- Link column: Clerk user id -> this internal user.
alter table "users" add column if not exists "clerk_id" text;
create unique index if not exists "users_clerk_id_key" on "users" ("clerk_id");

-- The Supabase invite-only signup trigger no longer applies — Clerk's
-- allowlist (Dashboard → Restrictions) enforces invite-only now.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- (RLS policies referencing auth.uid() are left in place; they're inert on the
--  app's pooled connection, and the API scopes every query by user id.)
