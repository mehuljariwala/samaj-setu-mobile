-- ---------------------------------------------------------------------------
-- A rejected application can be sent back for a fix, by an admin, and by no
-- other decision.
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
  v_super uuid := '00000000-0000-4000-8000-000000000001';
  v_admin uuid := '00000000-0000-4000-8000-000000000002';
  v_riya  uuid := '00000000-0000-4000-8000-000000000013';
  v_app   public.registration_applications;
begin
  -- The seeded family asked for a correction resends first, so there is a
  -- submitted application to reject.
  select a.* into v_app from public.registration_applications a
    join public.candidates c on c.id = a.candidate_id
   where c.public_code = 'SS-1029';
  perform pg_temp.ok(v_app.status = 'correction_requested', 'the seeded correction is still open');
  perform pg_temp.as_user(v_app.account_id);
  perform public.submit_registration(v_app.id);

  perform pg_temp.as_user(v_admin);
  perform public.admin_decide_registration(v_app.id, 'reject', 'submitted', 'Pic clear nathi.');

  perform pg_temp.ok(
    pg_temp.denied(v_admin, format(
      'select public.admin_decide_registration(%L, ''approve'', ''rejected'', ''ok'')', v_app.id)),
    'a rejected application cannot be approved without being resubmitted');
  perform pg_temp.ok(
    pg_temp.denied(v_admin, format(
      'select public.admin_decide_registration(%L, ''reject'', ''rejected'', ''again'')', v_app.id)),
    'a rejected application cannot be rejected twice');
  perform pg_temp.ok(
    pg_temp.denied(v_admin, format(
      'select public.admin_decide_registration(%L, ''request_correction'', ''rejected'', ''Fix it.'')', v_app.id)),
    'sending a rejection back still names the fields to fix');

  perform pg_temp.as_user(v_super);
  perform public.grant_role(v_riya, 'moderator');
  perform pg_temp.ok(
    pg_temp.denied(v_riya, format(
      'select public.admin_decide_registration(%L, ''request_correction'', ''rejected'', ''Fix it.'', array[''identity_document''])',
      v_app.id)),
    'a moderator cannot overturn a rejection');
  perform pg_temp.as_user(v_super);
  perform public.revoke_role(v_riya, 'moderator');

  perform pg_temp.as_user(v_admin);
  perform public.admin_decide_registration(
    v_app.id, 'request_correction', 'rejected', 'The photo is not clear. Please upload it again.',
    array['identity_document']);

  perform pg_temp.ok(
    (select status from public.registration_applications where id = v_app.id) = 'correction_requested',
    'an admin can send a rejected application back for a fix');
  perform pg_temp.ok(
    (select identity_status from public.candidates where id = v_app.candidate_id) = 'correction_requested',
    'the candidate follows the application back to correction_requested');
  perform pg_temp.ok(
    (select count(*) from public.review_decisions
      where subject_id = v_app.id and from_status = 'rejected' and to_status = 'correction_requested') = 1,
    'overturning a rejection is kept in the decision history');

  -- The family can now resend through the ordinary path.
  perform pg_temp.as_user(v_app.account_id);
  perform public.submit_registration(v_app.id);
  perform pg_temp.ok(
    (select status from public.registration_applications where id = v_app.id) = 'submitted',
    'the family can resubmit once the rejection is sent back');

  raise notice 'reopen rejection assertions passed';
end
$$;
