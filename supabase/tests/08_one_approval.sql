-- ---------------------------------------------------------------------------
-- One approval: documents and biodata go together, one admin decision covers
-- both, and the profile is live straight after.
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

create or replace function pg_temp.fails(p_user uuid, p_sql text, p_like text)
returns boolean
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  execute p_sql;
  return false;
exception
  when others then
    return sqlerrm like p_like;
end
$$;

create or replace function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end
$$;

-- A registration with its documents on file, not sent.
create or replace function pg_temp.registered(p_operator uuid, p_name text, p_dob date)
returns public.registration_applications
language plpgsql
as $$
declare
  v_start jsonb;
  v_app   public.registration_applications;
begin
  perform pg_temp.as_user(p_operator);
  v_start := public.start_registration('son', p_name, p_dob, 'male', 'Test Father', null, 'Surat', 'Surat');
  select * into v_app from public.registration_applications where id = (v_start ->> 'application_id')::uuid;
  perform public.attach_certificate(v_app.id, v_app.candidate_id::text || '/lc.jpg', 'image/jpeg', 90000, null, 'leaving');
  perform public.attach_identity_document(v_app.id, 'front', 'aadhaar', v_app.candidate_id::text || '/f.jpg', 'image/jpeg', 60000);
  perform public.attach_identity_document(v_app.id, 'back', 'aadhaar', v_app.candidate_id::text || '/b.jpg', 'image/jpeg', 60000);
  perform public.register_media(v_app.candidate_id, 'photo', v_app.candidate_id::text || '/photo.jpg', 'image/jpeg', 50000, true);
  return v_app;
end
$$;

create or replace function pg_temp.full_bio() returns jsonb language sql as $$
  select jsonb_build_object(
    'gender', 'male', 'height', '172', 'marital', 'never',
    'community', 'surti', 'sect', 'bhagat', 'surname', 'Testwala', 'mosal', 'Mosalwala',
    'education', 'bachelor', 'work', 'employed', 'contactKind', 'father', 'phone', '9876501234')
$$;

do $$
declare
  v_admin  uuid := '00000000-0000-4000-8000-000000000002';
  v_rajesh uuid := '00000000-0000-4000-8000-000000000010';
  v_app    public.registration_applications;
  v_rev    public.biodata_revisions;
begin
  -- ------------------------------------------------------- send, fix, approve
  v_app := pg_temp.registered(v_rajesh, 'Zubin Onceapproved', date '1990-02-02');

  perform pg_temp.ok(
    pg_temp.fails(v_rajesh, format('select public.submit_registration(%L)', v_app.id), 'incomplete: biodata%'),
    'a registration cannot be sent without a biodata');

  perform public.save_biodata_draft(v_app.candidate_id, '{"height":"172"}'::jsonb);
  perform pg_temp.ok(
    pg_temp.fails(v_rajesh, format('select public.submit_registration(%L)', v_app.id), 'incomplete: biodata,%'),
    'nor with an unfinished one, and the missing fields are named');

  perform pg_temp.as_user(v_rajesh);
  perform public.save_biodata_draft(v_app.candidate_id, pg_temp.full_bio());
  select * into v_rev from public.biodata_revisions where candidate_id = v_app.candidate_id;
  perform pg_temp.ok(
    pg_temp.fails(v_rajesh, format('select public.submit_biodata(%L)', v_rev.id), 'conflict: send the biodata with the registration%'),
    'before verification the biodata is sent only with the registration');

  perform pg_temp.as_user(v_rajesh);
  perform public.submit_registration(v_app.id);
  perform pg_temp.ok(
    (select status from public.biodata_revisions where id = v_rev.id) = 'submitted',
    'sending the registration sends the biodata with it');
  perform pg_temp.ok(
    pg_temp.fails(v_admin, format(
      'select public.admin_decide_biodata(%L, ''request_correction'', ''submitted'', ''x'', ''[{"field":"mosal","gu":"x","en":"x"}]''::jsonb)', v_rev.id),
      'conflict: this biodata is decided with its registration%'),
    'a biodata sent with a registration cannot be decided on its own');
  perform pg_temp.ok(
    pg_temp.fails(v_rajesh, format('select public.save_biodata_draft(%L, ''{"height":"180"}''::jsonb)', v_app.candidate_id), 'forbidden:%'),
    'the biodata cannot change while an admin is checking it');

  perform pg_temp.as_user(v_admin);
  perform public.admin_decide_registration(
    v_app.id, 'request_correction', 'submitted', 'Mosal spelling is wrong.', array['date_of_birth', 'mosal']);
  select * into v_rev from public.biodata_revisions where id = v_rev.id;
  perform pg_temp.ok(v_rev.status = 'correction_requested', 'a fix sends the biodata back too');
  perform pg_temp.ok(v_rev.correction_fields = array['mosal'], 'the biodata keeps the biodata fields the admin named');
  perform pg_temp.ok(
    exists (select 1 from public.revision_field_issues where revision_id = v_rev.id and field_key = 'mosal'),
    'and the form is told which field to highlight');

  perform pg_temp.as_user(v_rajesh);
  perform public.save_biodata_draft(v_app.candidate_id, '{"mosal":"Mosaliya"}'::jsonb);
  perform public.submit_registration(v_app.id);
  perform pg_temp.ok(
    (select status from public.biodata_revisions where id = v_rev.id) = 'submitted',
    'the family fixes and sends both again, once');

  perform pg_temp.as_user(v_admin);
  perform public.admin_decide_registration(v_app.id, 'approve', 'submitted', 'All good.');
  perform pg_temp.ok(
    (select status from public.biodata_revisions where id = v_rev.id) = 'approved',
    'one approval approves the biodata too');
  perform pg_temp.ok(
    (select published_revision_id = v_rev.id and discoverable and publication_status = 'published'
       from public.candidates where id = v_app.candidate_id),
    'and the profile is live at once, with no consent step');
  perform pg_temp.ok(
    not exists (select 1 from public.revision_field_issues where revision_id = v_rev.id and resolved_at is null),
    'approval closes the biodata''s open issues');
  perform pg_temp.ok(
    (select bool_and(status = 'approved') from public.candidate_media where candidate_id = v_app.candidate_id),
    'one approval approves the profile''s photo too');

  -- A photo added once the profile is live needs no second wait.
  perform pg_temp.as_user(v_rajesh);
  perform public.register_media(v_app.candidate_id, 'photo', v_app.candidate_id::text || '/later.jpg', 'image/jpeg', 50000, false);
  perform pg_temp.ok(
    (select status from public.candidate_media where storage_path = v_app.candidate_id::text || '/later.jpg') = 'approved',
    'a photo added to a live profile is approved straight away');

  -- Other members see it, because photos are open to members by default.
  perform pg_temp.ok(
    (select photo_visibility from public.candidate_privacy where candidate_id = v_app.candidate_id) = 'members',
    'a new profile''s photos are open to approved members');
  perform pg_temp.as_user('00000000-0000-4000-8000-000000000012');
  perform pg_temp.ok(
    (select count(*) from public.discover_photos(array[v_app.candidate_id])) = 1,
    'another approved member gets one photo for the card');

  -- ------------------------------------------------------ a photo to send
  v_app := pg_temp.registered(v_rajesh, 'Wasim Nophoto', date '1993-05-05');
  update public.candidate_media set deleted_at = now() where candidate_id = v_app.candidate_id;
  perform pg_temp.as_user(v_rajesh);
  perform public.save_biodata_draft(v_app.candidate_id, pg_temp.full_bio());
  perform pg_temp.ok(
    pg_temp.fails(v_rajesh, format('select public.submit_registration(%L)', v_app.id), 'incomplete: photo%'),
    'a registration cannot be sent without a profile photo');

  -- ------------------------------------------------- rejected, then reopened
  v_app := pg_temp.registered(v_rajesh, 'Yash Rejectedonce', date '1991-03-03');
  perform public.save_biodata_draft(v_app.candidate_id, pg_temp.full_bio());
  perform public.submit_registration(v_app.id);
  perform pg_temp.as_user(v_admin);
  perform public.admin_decide_registration(v_app.id, 'reject', 'submitted', 'Pic clear nathi.');
  perform pg_temp.ok(
    (select status from public.biodata_revisions where candidate_id = v_app.candidate_id) = 'rejected',
    'a rejection refuses the biodata with it');

  perform pg_temp.as_user(v_rajesh);
  perform public.reopen_my_registration(v_app.id);
  perform pg_temp.ok(
    (select status from public.biodata_revisions where candidate_id = v_app.candidate_id) = 'correction_requested',
    'reopening a rejection reopens the biodata');
  perform public.save_biodata_draft(v_app.candidate_id, '{"height":"174"}'::jsonb);
  perform public.submit_registration(v_app.id);
  perform pg_temp.ok(
    (select count(*) from public.biodata_revisions
      where candidate_id = v_app.candidate_id and status = 'submitted') = 1,
    'and both go back to the admin together, as one revision');

  -- ------------------------------------------------------- taken back to edit
  v_app := pg_temp.registered(v_rajesh, 'Xavier Tookitback', date '1992-04-04');
  perform public.save_biodata_draft(v_app.candidate_id, pg_temp.full_bio());
  perform public.submit_registration(v_app.id);
  perform public.edit_my_registration(v_app.id);
  perform pg_temp.ok(
    (select status from public.biodata_revisions where candidate_id = v_app.candidate_id) = 'draft',
    'taking the registration back to change it reopens the biodata too');
  perform public.save_biodata_draft(v_app.candidate_id, '{"height":"176"}'::jsonb);

  raise notice 'one approval assertions passed';
end
$$;
