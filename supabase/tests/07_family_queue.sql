-- ---------------------------------------------------------------------------
-- The admin's one list: every family once, in the stage it is really at.
--
-- Same conventions as 01_assertions.sql: raise on failure, silent on success.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_condition boolean, p_what text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_what;
  end if;
end
$$;

create or replace function pg_temp.denied(p_user uuid, p_sql text)
returns boolean
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  execute p_sql;
  return false;
exception
  when insufficient_privilege or raise_exception or no_data_found or check_violation then
    return true;
end
$$;

create or replace function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end
$$;

do $$
declare
  v_admin  uuid := '00000000-0000-4000-8000-000000000002';
  v_rajesh uuid := '00000000-0000-4000-8000-000000000010';
  v_counts jsonb;
  v_total  bigint;
  v_stage  text;
  v_rev    uuid;
begin
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, 'select public.admin_family_counts()'),
    'a member cannot read the admin''s counts');
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, 'select * from public.admin_family_queue(''all'')'),
    'a member cannot read the admin''s list');

  perform pg_temp.as_user(v_admin);
  v_counts := public.admin_family_counts();
  select count(*) into v_total from public.candidates where deleted_at is null;

  perform pg_temp.ok((v_counts ->> 'all')::bigint = v_total, 'All counts every family');
  perform pg_temp.ok(
    (select count(*) from public.admin_family_queue('all', null, 500)) = v_total,
    'the list can show every family, not just the first 25');
  perform pg_temp.ok(
    (select count(distinct candidate_id) from public.admin_family_queue('all', null, 500)) = v_total,
    'each family appears exactly once');

  perform pg_temp.ok(
    (select count(*) from public.admin_family_queue('review', null, 500)) = (v_counts ->> 'review')::bigint
    and (select count(*) from public.admin_family_queue('family', null, 500)) = (v_counts ->> 'family')::bigint
    and (select count(*) from public.admin_family_queue('live', null, 500)) = (v_counts ->> 'live')::bigint,
    'each filter lists as many families as its count says');

  -- 06 left SS-1029 waiting for its identity check.
  select stage into v_stage from public.admin_family_queue('all', 'SS-1029');
  perform pg_temp.ok(v_stage = 'identity_review', 'a sent registration is an identity check to do');

  -- A live profile whose family sends an edited biodata is biodata work for
  -- the admin, and still live meanwhile.
  select f.candidate_id into v_rev from public.admin_family_queue('live', null, 1) f;
  if v_rev is not null then
    perform pg_temp.ok(
      (select discoverable from public.candidates where id = v_rev),
      'a family in Live is in the directory');
  end if;

  perform pg_temp.ok(
    (select bool_and(stage in ('identity_review', 'biodata_review'))
       from public.admin_family_queue('review', null, 500)) is not false,
    'To review holds only work waiting on an admin');
  perform pg_temp.ok(
    (select bool_and(overdue) from public.admin_family_queue('overdue', null, 500)) is not false,
    'Overdue holds only overdue identity checks');

  -- Approval publishes without consent.
  perform pg_temp.ok(
    not exists (
      select 1 from public.candidates c
       where c.identity_status = 'verified' and c.publication_status = 'published'
         and c.published_revision_id is not null and not c.paused and c.match_found_at is null
         and c.deleted_at is null and not c.discoverable
         and exists (select 1 from public.candidate_memberships m
                       join public.accounts a on a.id = m.account_id
                      where m.candidate_id = c.id and m.revoked_at is null and a.status = 'active')),
    'every approved, unpaused profile is in the directory, consent or not');

  raise notice 'family queue assertions passed';
end
$$;
