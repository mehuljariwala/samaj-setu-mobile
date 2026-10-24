-- ---------------------------------------------------------------------------
-- Support mode: the superadmin opens a family's account, sees and changes
-- what the family could, and every change names the superadmin.
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

-- Signed in on one particular login, as the access token's session_id says.
create or replace function pg_temp.as_login(p_id uuid, p_session text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated', 'session_id', p_session)::text, true);
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
  when insufficient_privilege or raise_exception or no_data_found then
    return true;
end
$$;

do $$
declare
  v_super uuid := '00000000-0000-4000-8000-000000000001';
  v_admin uuid := '00000000-0000-4000-8000-000000000002';
  v_kavya uuid := '00000000-0000-4000-8000-000000000012';
  v_riya  uuid := '00000000-0000-4000-8000-000000000013';
  c_riya  uuid;
  c_kavya uuid;
  c_new   uuid;
  v_ctx   jsonb;
  v_rev   uuid;
  v_out   jsonb;
  v_rows  integer;
begin
  c_riya  := (select candidate_id from public.candidate_memberships where account_id = v_riya and revoked_at is null);
  c_kavya := (select candidate_id from public.candidate_memberships where account_id = v_kavya and revoked_at is null);

  -- ------------------------------------------------- who may open one ---
  perform pg_temp.ok(pg_temp.denied(v_admin, format('select public.admin_start_support(%L)', v_riya)),
    'an admin who is not the superadmin cannot open a family');
  perform pg_temp.ok(pg_temp.denied(v_kavya, format('select public.admin_start_support(%L)', v_riya)),
    'a family cannot open another family');
  perform pg_temp.ok(pg_temp.denied(v_super, format('select public.admin_start_support(%L)', v_admin)),
    'a staff account cannot be opened');
  perform pg_temp.ok(pg_temp.denied(v_super, format('select public.admin_start_support(%L)', v_super)),
    'the superadmin cannot open their own account');
  perform pg_temp.ok(pg_temp.denied(v_riya, 'select public.record_activity(''account.support_started'')'),
    'a family cannot write a support event onto its own timeline');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.admin_start_support(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.admin_end_support()', 'execute'),
    'nobody signed out may call the support functions');

  perform pg_temp.as_user(v_super);
  perform pg_temp.ok(app.acting_account_id() = v_super and not app.in_support_mode(),
    'without a session the superadmin is themselves');
  perform pg_temp.ok(not app.operates_candidate(c_riya), 'and does not act for Riya');

  -- ---------------------------------------------------- inside Riya's ---
  perform public.admin_start_support(v_riya);
  perform pg_temp.ok(app.acting_account_id() = v_riya and app.in_support_mode(),
    'with a session open the superadmin acts as Riya''s family');
  perform pg_temp.ok(app.operates_candidate(c_riya), 'and acts for her candidate');
  perform pg_temp.ok(app.has_member_access() and app.access_state() = 'approved',
    'with her member access');

  v_ctx := public.my_context();
  perform pg_temp.ok((v_ctx -> 'account' ->> 'id')::uuid = v_riya, 'my_context shows her account');
  perform pg_temp.ok(jsonb_array_length(v_ctx -> 'candidates') = 1
      and (v_ctx -> 'candidates' -> 0 ->> 'id')::uuid = c_riya,
    'and her candidate');
  perform pg_temp.ok(jsonb_array_length(v_ctx -> 'roles') = 0,
    'and her roles, not the superadmin''s');
  perform pg_temp.ok((v_ctx -> 'support' ->> 'account_id')::uuid = v_riya,
    'and says a support session is open');
  perform pg_temp.ok(exists (
      select 1 from public.account_activity
       where account_id = v_riya and kind = 'account.support_started' and actor_account_id = v_super),
    'her timeline says the superadmin opened her account');

  -- ------------------------------------------------ live straight away ---
  v_rev := (public.save_biodata_draft(c_riya, '{"native":"Support Test"}'::jsonb) ->> 'revision_id')::uuid;
  v_out := public.submit_biodata(v_rev);
  perform pg_temp.ok(v_out ->> 'status' = 'approved', 'a biodata the superadmin sends is approved at once');
  perform pg_temp.ok((select published_revision_id from public.candidates where id = c_riya) = v_rev,
    'and published');
  perform pg_temp.ok((select decided_by_account_id from public.biodata_revisions where id = v_rev) = v_super,
    'the approval names the superadmin');
  perform pg_temp.ok((select discoverable from public.candidates where id = c_riya),
    'her profile stays in the directory');

  -- ------------------------------------------------- on her timeline ---
  perform public.record_activity('page.view', p_path => '/support-test');
  perform pg_temp.ok(exists (
      select 1 from public.account_activity
       where account_id = v_riya and kind = 'page.view' and path = '/support-test'
         and actor_account_id = v_super),
    'what the superadmin does lands on her timeline, with the superadmin as actor');

  -- --------------------------------------------- registers for her ---
  c_new := (public.start_registration('brother', 'Support Test Brother', date '1995-01-01', 'male')
            ->> 'candidate_id')::uuid;
  perform pg_temp.ok(exists (
      select 1 from public.candidate_memberships
       where candidate_id = c_new and account_id = v_riya and linked_by_account_id = v_super),
    'a candidate registered in support mode joins her account, linked by the superadmin');
  perform pg_temp.ok(not exists (
      select 1 from public.candidate_memberships where candidate_id = c_new and account_id = v_super),
    'and not the superadmin''s');

  -- --------------------------------------- her shortlist, her bell ---
  set local role authenticated;
  perform pg_temp.as_user(v_super);
  insert into public.saved_profiles (account_id, candidate_id) values (v_riya, c_kavya);
  perform pg_temp.ok((select count(*) from public.saved_profiles where candidate_id = c_kavya) = 1,
    'the superadmin saves to her shortlist');
  perform pg_temp.ok(pg_temp.denied(v_super,
      format('insert into public.saved_profiles (account_id, candidate_id) values (%L, %L)', v_super, c_kavya)),
    'and not to their own while acting for her');

  perform pg_temp.as_user(v_super);
  perform pg_temp.ok((select count(*) from public.notifications) > 0
      and not exists (select 1 from public.notifications where account_id <> v_riya),
    'the superadmin reads her notifications and only hers');
  update public.notifications set read_at = now() where account_id = v_riya and read_at is null;
  get diagnostics v_rows = row_count;
  perform pg_temp.ok(v_rows = 0, 'but cannot mark them read for her');
  reset role;

  -- --------------------------------------------------------- closing ---
  perform pg_temp.as_user(v_super);
  perform public.admin_end_support();
  perform pg_temp.ok(app.acting_account_id() = v_super and not app.operates_candidate(c_riya),
    'closing the session ends it');
  perform pg_temp.ok(jsonb_typeof(public.my_context() -> 'support') = 'null',
    'and my_context no longer shows one');
  perform pg_temp.ok(exists (
      select 1 from public.account_activity
       where account_id = v_riya and kind = 'account.support_ended' and actor_account_id = v_super),
    'her timeline says it was closed');

  perform public.admin_start_support(v_riya);
  update public.support_sessions set expires_at = now() - interval '1 second'
   where staff_account_id = v_super and ended_at is null;
  perform pg_temp.ok(app.acting_account_id() = v_super, 'a lapsed session acts for nobody');

  perform public.admin_start_support(v_kavya);
  perform pg_temp.ok((select count(*) from public.support_sessions
                       where staff_account_id = v_super and ended_at is null) = 1,
    'opening another family closes the last session');
  perform pg_temp.ok(app.acting_account_id() = v_kavya, 'and acts for the new one');
  perform public.admin_end_support();

  -- ------------------------------------------- one login, not every one ---
  perform pg_temp.as_login(v_super, 'laptop');
  perform public.admin_start_support(v_riya);
  perform pg_temp.ok(app.acting_account_id() = v_riya, 'the login that opened it acts for her');
  perform pg_temp.as_login(v_super, 'phone');
  perform pg_temp.ok(app.acting_account_id() = v_super
      and jsonb_typeof(public.my_context() -> 'support') = 'null',
    'the superadmin''s other logins stay the superadmin');

  -- --------------------------------------------- role taken away, at once ---
  perform pg_temp.as_login(v_super, 'laptop');
  delete from public.account_roles where account_id = v_super and role = 'superadmin';
  perform pg_temp.ok(app.acting_account_id() = v_super, 'without the role the session acts for nobody');
  insert into public.account_roles (account_id, role) values (v_super, 'superadmin');
  perform public.admin_end_support();

  -- ------------------------------------------- a switched-off family ---
  perform pg_temp.as_user(v_admin);
  perform public.admin_set_account_status(v_riya, 'disabled');
  perform pg_temp.as_user(v_super);
  perform public.admin_start_support(v_riya);
  perform pg_temp.ok(app.access_state() = 'suspended' and not app.has_member_access(),
    'acting for a switched-off family, the superadmin is held to what that family may do');
  v_rev := (public.save_biodata_draft(c_riya, '{"native":"Support Test Off"}'::jsonb) ->> 'revision_id')::uuid;
  v_out := public.submit_biodata(v_rev);
  perform pg_temp.ok(v_out ->> 'status' = 'submitted'
      and (select status from public.accounts where id = v_riya) = 'disabled',
    'her biodata waits for the queue instead of switching her back on unseen');
  perform public.admin_end_support();
  perform pg_temp.as_user(v_admin);
  perform public.admin_decide_biodata(v_rev, 'approve', 'submitted');

  -- ------------------------------------------------- families as ever ---
  perform pg_temp.as_user(v_riya);
  perform pg_temp.ok(app.acting_account_id() = v_riya and not app.in_support_mode(),
    'a family is always itself');
  perform pg_temp.ok(jsonb_typeof(public.my_context() -> 'support') = 'null',
    'and never sees a support session');

  perform set_config('request.jwt.claims', null, false);
  raise notice 'support mode assertions passed';
end
$$;
