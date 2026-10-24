-- ---------------------------------------------------------------------------
-- An admin moves a profile between the Khatri samaj and Sanatan, and the
-- biodata's label, questions and the mosal rule follow.
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

create or replace function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end
$$;

create or replace function pg_temp.denied(p_user uuid, p_sql text)
returns boolean
language plpgsql
as $$
begin
  perform pg_temp.as_user(p_user);
  execute p_sql;
  return false;
exception
  when insufficient_privilege or raise_exception then
    return true;
end
$$;

do $$
declare
  v_admin  uuid := '00000000-0000-4000-8000-000000000002';
  v_rajesh uuid := '00000000-0000-4000-8000-000000000010';
  v_nidhi  uuid := '00000000-0000-4000-8000-000000000014';
  c_aarav  uuid;
  c_nidhi  uuid;
  v_live   uuid;
  v_old    uuid;
begin
  c_aarav := (select id from public.candidates where public_code = 'SS-1024');
  c_nidhi := (select candidate_id from public.candidate_memberships where account_id = v_nidhi and revoked_at is null);
  v_live  := (select published_revision_id from public.candidates where id = c_nidhi);

  perform pg_temp.ok(not (select is_sanatan from public.candidates where id = c_nidhi)
      and app.eligibility(c_aarav, c_nidhi) = 'excluded_shared_mosal',
    'Nidhi starts in the Khatri samaj, kept from Aarav by a shared mosal');

  -- A superseded version, to show history keeps its label.
  insert into public.biodata_revisions (candidate_id, version, status, data, source, submitted_at, approved_at, superseded_at)
  select c_nidhi, (select max(version) + 1 from public.biodata_revisions where candidate_id = c_nidhi),
         'superseded', data, source, now(), now(), now()
    from public.biodata_revisions where id = v_live
  returning id into v_old;

  -- --------------------------------------------------- who may move one ---
  perform pg_temp.ok(pg_temp.denied(v_nidhi, format('select public.admin_set_sanatan(%L, true)', c_nidhi)),
    'a family cannot move its own profile');
  perform pg_temp.ok(pg_temp.denied(v_rajesh, format('select public.admin_set_sanatan(%L, true)', c_nidhi)),
    'nor can another family');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.admin_set_sanatan(uuid, boolean)', 'execute'),
    'nobody signed out may call it');

  -- ------------------------------------------------------ to Sanatan ---
  perform pg_temp.as_user(v_admin);
  perform pg_temp.ok((public.admin_set_sanatan(c_nidhi, true) ->> 'is_sanatan')::boolean,
    'an admin moves her to Sanatan');
  perform pg_temp.ok((select is_sanatan from public.candidates where id = c_nidhi), 'the candidate is Sanatan');
  perform pg_temp.ok((select data ->> 'origin' from public.biodata_revisions where id = v_live) = 'sanatan',
    'her published biodata is stamped Sanatan, so its label and questions follow');
  perform pg_temp.ok((select data ->> 'origin' from public.biodata_revisions where id = v_old) = 'samaj',
    'a superseded version keeps the label it had');
  perform pg_temp.ok(app.eligibility(c_aarav, c_nidhi) <> 'excluded_shared_mosal',
    'the mosal rule no longer applies to her');
  perform pg_temp.ok((select discoverable from public.candidates where id = c_nidhi),
    'she stays in the directory');
  perform pg_temp.ok((public.admin_set_sanatan(c_nidhi, true) ->> 'is_sanatan')::boolean,
    'moving her where she already is changes nothing');

  -- ------------------------------------------------- back to the samaj ---
  perform public.admin_set_sanatan(c_nidhi, false);
  perform pg_temp.ok(not (select is_sanatan from public.candidates where id = c_nidhi)
      and (select data ->> 'origin' from public.biodata_revisions where id = v_live) = 'samaj',
    'moved back, she and her biodata are Khatri samaj again');
  perform pg_temp.ok(app.eligibility(c_aarav, c_nidhi) = 'excluded_shared_mosal',
    'and the shared mosal keeps her from Aarav again');

  delete from public.biodata_revisions where id = v_old;
  perform set_config('request.jwt.claims', null, false);
  raise notice 'admin moves sanatan assertions passed';
end
$$;
