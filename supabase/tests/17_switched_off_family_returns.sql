-- ---------------------------------------------------------------------------
-- A family an admin switched off signs in on the same number, updates its
-- biodata and sends it back; approving it switches the family back on.
-- Blocked accounts, and staff switched off, stay locked out.
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

do $$
declare
  v_super uuid := '00000000-0000-4000-8000-000000000001';
  v_admin uuid := '00000000-0000-4000-8000-000000000002';
  v_riya  uuid := '00000000-0000-4000-8000-000000000013';
  c_riya  uuid;
  v_rev   uuid;
begin
  c_riya := (select candidate_id from public.candidate_memberships where account_id = v_riya and revoked_at is null);
  perform pg_temp.ok((select discoverable from public.candidates where id = c_riya), 'she starts out live');

  -- ------------------------------------------------------- switched off --
  perform pg_temp.as_user(v_admin);
  perform public.admin_set_account_status(v_riya, 'disabled');
  perform pg_temp.ok((select banned_until from auth.users where id = v_riya) is null,
    'a switched-off family may still sign in');
  perform pg_temp.ok(not (select discoverable from public.candidates where id = c_riya),
    'her profile leaves the directory');

  perform pg_temp.as_user(v_riya);
  perform pg_temp.ok(app.access_state() = 'suspended', 'signed in, she is still suspended');
  perform pg_temp.ok(not app.has_member_access(), 'so she cannot browse');

  -- -------------------------------------------- updates and sends it back --
  v_rev := (public.save_biodata_draft(c_riya, '{"native":"Rander"}'::jsonb) ->> 'revision_id')::uuid;
  perform pg_temp.ok(v_rev is not null, 'she can open a new version of her biodata');
  perform public.submit_biodata(v_rev);
  perform pg_temp.ok((select status from public.accounts where id = v_riya) = 'disabled',
    'sending it does not switch her back on by itself');

  perform pg_temp.as_user(v_admin);
  perform public.admin_decide_biodata(v_rev, 'approve', 'submitted');
  perform pg_temp.ok((select status from public.accounts where id = v_riya) = 'active',
    'approving her biodata switches the family back on');
  perform pg_temp.ok((select discoverable from public.candidates where id = c_riya),
    'and her profile is back in the directory');
  perform pg_temp.ok(exists (
      select 1 from public.account_activity
       where account_id = v_riya and kind = 'account.status_changed'
         and detail ->> 'to' = 'active' and detail ->> 'reason' = 'biodata_approved'),
    'her timeline says the approval switched her back on');

  -- ------------------------------------------------- still locked out --
  perform public.admin_set_account_status(v_riya, 'blocked', 'Test: blocked stays out');
  perform pg_temp.ok((select banned_until from auth.users where id = v_riya) > now() + interval '50 years',
    'a blocked account is still banned from signing in');
  perform public.admin_set_account_status(v_riya, 'active');

  perform pg_temp.as_user(v_super);
  perform public.admin_set_account_status(v_admin, 'disabled');
  perform pg_temp.ok((select banned_until from auth.users where id = v_admin) > now() + interval '50 years',
    'a switched-off admin is still banned from signing in');
  perform public.admin_set_account_status(v_admin, 'active');

  perform set_config('request.jwt.claims', null, false);
  raise notice 'switched-off family assertions passed';
end
$$;
