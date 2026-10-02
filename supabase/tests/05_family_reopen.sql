-- ---------------------------------------------------------------------------
-- A family can reopen its own rejected application, fix it and send it again.
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
  v_app    public.registration_applications;
  v_after  public.registration_applications;
  v_count  integer;
begin
  -- 04 left SS-1029 submitted.
  select a.* into v_app from public.registration_applications a
    join public.candidates c on c.id = a.candidate_id
   where c.public_code = 'SS-1029';
  perform pg_temp.ok(v_app.status = 'submitted', 'SS-1029 is waiting for a decision');

  perform pg_temp.ok(
    pg_temp.denied(v_app.account_id, format('select public.reopen_my_registration(%L)', v_app.id)),
    'an application that was never rejected cannot be reopened');

  perform pg_temp.as_user(v_admin);
  perform public.admin_decide_registration(v_app.id, 'reject', 'submitted', 'Pic clear nathi.');

  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format('select public.reopen_my_registration(%L)', v_app.id)),
    'someone who does not act for the candidate cannot reopen it');
  perform pg_temp.ok(
    pg_temp.denied(v_admin, format('select public.reopen_my_registration(%L)', v_app.id)),
    'an admin overturns a rejection through a decision, not as the family');

  perform pg_temp.as_user(v_app.account_id);
  perform public.reopen_my_registration(v_app.id);

  select * into v_after from public.registration_applications where id = v_app.id;
  perform pg_temp.ok(v_after.status = 'correction_requested', 'the family can reopen a rejected application');
  perform pg_temp.ok(v_after.decision_reason = 'Pic clear nathi.', 'the admin''s reason stays for the family to read');
  perform pg_temp.ok(cardinality(v_after.correction_fields) = 0, 'reopening names no fields');
  perform pg_temp.ok(
    (select identity_status from public.candidates where id = v_app.candidate_id) = 'correction_requested',
    'the candidate follows the application back to correction_requested');
  perform pg_temp.ok(
    (select count(*) from public.review_decisions
      where subject_id = v_app.id and action = 'reopen' and actor_account_id = v_app.account_id
        and from_status = 'rejected' and to_status = 'correction_requested') = 1,
    'the reopening is kept in the decision history under the family''s account');

  perform pg_temp.ok(
    pg_temp.denied(v_app.account_id, format('select public.reopen_my_registration(%L)', v_app.id)),
    'an application already reopened cannot be reopened again');

  -- From here it is the ordinary correction path.
  perform public.update_registration(v_app.id, p_city => 'Navsari');
  select resubmit_count into v_count from public.registration_applications where id = v_app.id;
  perform public.submit_registration(v_app.id);

  select * into v_after from public.registration_applications where id = v_app.id;
  perform pg_temp.ok(v_after.status = 'submitted', 'the family can send the reopened application again');
  perform pg_temp.ok(v_after.resubmit_count = v_count + 1, 'the queue can see it has been sent before');
  perform pg_temp.ok(v_after.decision_reason is null, 'a resubmission clears the old reason');

  raise notice 'family reopen assertions passed';
end
$$;
