-- ---------------------------------------------------------------------------
-- The certificate slot takes a school or college leaving certificate as well
-- as a birth certificate, and says which one it holds.
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
  v_admin  uuid := '00000000-0000-4000-8000-000000000002';
  v_app    public.registration_applications;
  v_detail jsonb;
  v_mine   jsonb;
  v_failed boolean;
begin
  -- 03 left SS-1029 submitted; ask for a new certificate so it is editable.
  select a.* into v_app from public.registration_applications a
    join public.candidates c on c.id = a.candidate_id
   where c.public_code = 'SS-1029';
  perform pg_temp.ok(v_app.status = 'submitted', 'SS-1029 is waiting for a decision');

  -- Seeded certificates were attached without a type: they are birth certificates.
  perform pg_temp.as_user(v_admin);
  v_detail := public.admin_registration_detail(v_app.id);
  perform pg_temp.ok(v_detail -> 'certificate' ->> 'type' = 'birth',
    'a certificate attached without a type reads as a birth certificate');

  perform public.admin_decide_registration(
    v_app.id, 'request_correction', 'submitted', 'Upload the leaving certificate instead.',
    array['birth_certificate']);

  perform pg_temp.as_user(v_app.account_id);

  v_failed := false;
  begin
    perform public.attach_certificate(
      v_app.id, v_app.candidate_id::text || '/marksheet.jpg', 'image/jpeg', 90000, null, 'marksheet');
  exception when raise_exception then
    v_failed := true;
  end;
  perform pg_temp.ok(v_failed, 'only a birth or leaving certificate can be attached');

  perform public.attach_certificate(
    v_app.id, v_app.candidate_id::text || '/leaving.jpg', 'image/jpeg', 90000, null, 'leaving');

  v_mine := public.my_application_documents(v_app.id);
  perform pg_temp.ok((v_mine ->> 'certificate')::boolean and v_mine ->> 'certificate_type' = 'leaving',
    'the family sees the leaving certificate as the one on file');
  perform pg_temp.ok(
    (select count(*) from public.application_documents
      where application_id = v_app.id and kind = 'birth_certificate' and deleted_at is null) = 1,
    'the leaving certificate replaces the birth certificate rather than sitting beside it');

  perform public.submit_registration(v_app.id);
  perform pg_temp.ok(
    (select status from public.registration_applications where id = v_app.id) = 'submitted',
    'a leaving certificate is enough to send the application');

  perform pg_temp.as_user(v_admin);
  v_detail := public.admin_registration_detail(v_app.id);
  perform pg_temp.ok(v_detail -> 'certificate' ->> 'type' = 'leaving',
    'the admin is told the certificate is a leaving certificate');

  v_failed := false;
  begin
    update public.application_documents set certificate_type = 'birth'
     where application_id = v_app.id and kind = 'identity_front';
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.ok(v_failed, 'only the certificate carries a certificate type');

  raise notice 'leaving certificate assertions passed';
end
$$;
