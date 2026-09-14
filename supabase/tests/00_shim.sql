-- ---------------------------------------------------------------------------
-- Local Supabase stand-in. NOT a migration — never applied to a real project.
--
-- A hosted Supabase database already provides the `auth` and `storage` schemas,
-- the `anon` / `authenticated` / `service_role` roles, and `auth.uid()`. This
-- file recreates just enough of that surface that `supabase/migrations/*.sql`
-- can be compiled and exercised against a plain PostgreSQL 17 server, so the
-- migrations are verified rather than merely written.
--
-- Anything the migrations rely on must exist here, and nothing here may be
-- something the migrations are responsible for creating.
-- ---------------------------------------------------------------------------

-- Supabase's PostgREST roles. `authenticator` switches into one of them per
-- request; `service_role` bypasses RLS the same way it does in production.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

grant usage on schema extensions to anon, authenticated, service_role;

-- --------------------------------------------------------------- auth ------
-- Only the columns the application actually reads. GoTrue's real table has
-- many more; adding them here would invite the migrations to depend on
-- columns this shim does not faithfully reproduce.
create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  phone               text unique,
  email               text unique,
  encrypted_password  text,
  phone_confirmed_at  timestamptz,
  email_confirmed_at  timestamptz,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  raw_app_meta_data   jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Mirrors supabase/auth's definitions: the request's JWT arrives as a GUC that
-- PostgREST sets per transaction.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
  ), '')::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.role', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
  ), '')::text
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt(), auth.role() to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- ------------------------------------------------------------- storage -----
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  owner              uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id           uuid primary key default gen_random_uuid(),
  bucket_id    text references storage.buckets(id),
  name         text,
  owner        uuid,
  owner_id     text,
  metadata     jsonb,
  path_tokens  text[] generated always as (string_to_array(name, '/')) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1 : array_length(parts, 1) - 1];
end
$$;

create or replace function storage.filename(name text)
returns text
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[array_length(parts, 1)];
end
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant all on storage.objects to service_role;
grant select, insert, update, delete on storage.objects to authenticated;

-- ---------------------------------------------------------------------------
-- Test helpers: impersonate a signed-in user the way PostgREST would.
-- ---------------------------------------------------------------------------
create schema if not exists shim;

create or replace function shim.login(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end
$$;

create or replace function shim.logout()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end
$$;

create or replace function shim.as_service()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
end
$$;
