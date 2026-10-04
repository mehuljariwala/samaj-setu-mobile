-- ---------------------------------------------------------------------------
-- A family can take back an application that is waiting for review, change
-- it, and send it again.
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
begin
  -- 05 left SS-1029 submitted.
  select a.* into v_app from public.registration_applications a
    join public.candidates c on c.id = a.candidate_id
   where c.public_code = 'SS-1029';
  perform pg_temp.ok(v_app.status = 'submitted', 'SS-1029 is waiting for a decision');

  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format('select public.edit_my_registration(%L)', v_app.id)),
    'someone who does not act for the candidate cannot take it back');
  perform pg_temp.ok(
    pg_temp.denied(v_admin, format('select public.edit_my_registration(%L)', v_app.id)),
    'an admin cannot take it back on the family''s behalf');

  -- An admin opens it, then the family takes it back.
  perform pg_temp.as_user(v_admin);
  perform public.admin_claim_review('registration', v_app.id);

  perform pg_temp.as_user(v_app.account_id);
  perform public.edit_my_registration(v_app.id);

  select * into v_after from public.registration_applications where id = v_app.id;
  perform pg_temp.ok(v_after.status = 'draft', 'the family can take back a waiting application');
  perform pg_temp.ok(v_after.submitted_at is null and v_after.review_due_at is null,
    'it leaves the review queue and its 24-hour target');
  perform pg_temp.ok(
    (select identity_status from public.candidates where id = v_app.candidate_id) = 'unverified',
    'the candidate goes back to unverified with it');
  perform pg_temp.ok(
    not exists (select 1 from public.review_claims where subject_id = v_app.id),
    'the reviewer''s claim is released');
  perform pg_temp.ok(
    (select count(*) from public.review_decisions
      where subject_id = v_app.id and action = 'reopen' and actor_account_id = v_app.account_id
        and from_status = 'submitted' and to_status = 'draft') = 1,
    'taking it back is kept in the decision history under the family''s account');

  perform pg_temp.ok(
    pg_temp.denied(v_admin, format(
      'select public.admin_decide_registration(%L, ''approve'', ''submitted'', ''ok'')', v_app.id)),
    'a reviewer who still had it open cannot approve the version being edited');
  perform pg_temp.ok(
    pg_temp.denied(v_app.account_id, format('select public.edit_my_registration(%L)', v_app.id)),
    'a draft cannot be taken back again');

  -- The family swaps in the leaving certificate and sends it again.
  perform pg_temp.as_user(v_app.account_id);
  perform public.attach_certificate(
    v_app.id, v_app.candidate_id::text || '/leaving-2.jpg', 'image/jpeg', 90000, null, 'leaving');
  perform public.submit_registration(v_app.id);

  select * into v_after from public.registration_applications where id = v_app.id;
  perform pg_temp.ok(v_after.status = 'submitted', 'the family can send the edited application again');
  perform pg_temp.ok(v_after.review_due_at > now() + interval '23 hours',
    'the resent application gets a fresh 24-hour target');

  raise notice 'family edits waiting application assertions passed';
end
$$;
