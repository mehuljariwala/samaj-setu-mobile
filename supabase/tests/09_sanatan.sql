-- ---------------------------------------------------------------------------
-- સનાતન દીકરીઓ: a daughter from outside the Khatri samaj registers the same
-- way, with her own required fields and the community rules adjusted.
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

do $$
declare
  v_admin  uuid := '00000000-0000-4000-8000-000000000002';
  v_rajesh uuid := '00000000-0000-4000-8000-000000000010';
  v_meena  uuid := '00000000-0000-4000-8000-000000000015';
  v_aarav  uuid;
  v_start  jsonb;
  v_app    uuid;
  v_girl   uuid;
  v_boy    uuid;
  v_dir    jsonb;
begin
  -- A son cannot be a Sanatan daughter.
  perform pg_temp.as_user(v_rajesh);
  v_start := public.start_registration('son', 'Varun Notsanatan', date '1994-06-06', 'male', 'Father', null, 'Surat', 'Surat');
  v_boy := (v_start ->> 'candidate_id')::uuid;
  perform pg_temp.ok(
    pg_temp.fails(v_rajesh, format('select public.set_sanatan(%L, true)', v_boy), 'invalid:%'),
    'only a daughter can be registered as a Sanatan daughter');

  -- A daughter from outside the samaj.
  perform pg_temp.as_user(v_meena);
  v_start := public.start_registration('daughter', 'Pooja Sanatandikri', date '2001-07-07', 'female', 'Mahesh Joshi', null, 'Bhavnagar', 'Bhavnagar');
  v_girl := (v_start ->> 'candidate_id')::uuid;
  v_app := (v_start ->> 'application_id')::uuid;
  perform pg_temp.ok(
    pg_temp.fails(v_rajesh, format('select public.set_sanatan(%L, true)', v_girl), 'forbidden:%'),
    'only her own family can tick the box');

  perform pg_temp.as_user(v_meena);
  perform public.set_sanatan(v_girl, true);
  perform pg_temp.ok((select is_sanatan from public.candidates where id = v_girl), 'the box marks her as a Sanatan daughter');

  perform public.attach_certificate(v_app, v_girl::text || '/lc.jpg', 'image/jpeg', 90000, null, 'leaving');
  perform public.attach_identity_document(v_app, 'front', 'aadhaar', v_girl::text || '/f.jpg', 'image/jpeg', 60000);
  perform public.attach_identity_document(v_app, 'back', 'aadhaar', v_girl::text || '/b.jpg', 'image/jpeg', 60000);
  perform public.register_media(v_girl, 'photo', v_girl::text || '/p.jpg', 'image/jpeg', 50000, true);

  -- The samaj biodata alone is not enough for her, and Khatri fields are not asked.
  perform public.save_biodata_draft(v_girl, jsonb_build_object(
    'gender', 'female', 'height', '160', 'marital', 'never', 'sect', 'bhagat',
    'education', 'bachelor', 'work', 'employed', 'contactKind', 'father', 'phone', '9876502222'));
  perform pg_temp.ok(
    (select data ->> 'origin' from public.biodata_revisions where candidate_id = v_girl) = 'sanatan',
    'her biodata is stamped as a Sanatan biodata');
  perform pg_temp.ok(
    pg_temp.fails(v_meena, format('select public.submit_registration(%L)', v_app), 'incomplete: biodata,%caste%'),
    'her biodata needs her caste and the other Sanatan details');
  perform pg_temp.ok(
    not pg_temp.fails(v_meena, format('select public.submit_registration(%L)', v_app), '%mosal%'),
    'she is not asked for a Khatri mosal');

  perform pg_temp.as_user(v_meena);
  perform public.save_biodata_draft(v_girl, jsonb_build_object(
    'caste', 'Brahmin', 'hometown', 'Sihor', 'state', 'Gujarat', 'mother', 'Asha Joshi',
    'fatherWork', 'Teacher', 'fatherPhone', '9876503333', 'address', '12, Station Road, Sihor'));
  perform pg_temp.ok(
    (select completion from public.biodata_revisions where candidate_id = v_girl) = 100,
    'her completion counts her own required fields');
  perform public.submit_registration(v_app);

  perform pg_temp.as_user(v_admin);
  perform public.admin_decide_registration(v_app, 'approve', 'submitted', 'Verified.');
  perform pg_temp.ok((select discoverable from public.candidates where id = v_girl), 'one approval puts her live');

  -- Her father's number and address stay with the admins.
  select biodata into v_dir from public.directory_profiles where id = v_girl;
  perform pg_temp.ok(not (v_dir ? 'fatherPhone') and not (v_dir ? 'address') and not (v_dir ? 'phone'),
    'the directory copy carries neither her father''s number nor her address');
  perform pg_temp.ok(v_dir ->> 'caste' = 'Brahmin', 'the directory copy does carry her caste');

  -- A samaj boy with a confirmed mosal sees her as eligible, not "rules unknown".
  v_aarav := (select id from public.candidates where public_code = 'SS-1024');
  perform pg_temp.ok(app.eligibility(v_aarav, v_girl) = 'eligible',
    'the shared-mosal rule does not hold a Sanatan daughter back');

  insert into public.family_preferences (candidate_id, require_same_sub_community)
  values (v_aarav, true)
  on conflict (candidate_id) do update set require_same_sub_community = true;
  perform pg_temp.ok(app.eligibility(v_aarav, v_girl) = 'excluded_sub_community',
    'a family that asked for the same sub-community is not shown her');
  update public.family_preferences set require_same_sub_community = false where candidate_id = v_aarav;

  -- A samaj biodata still needs the Khatri fields.
  perform pg_temp.ok(
    exists (select 1 from app.validate_biodata('{"origin":"samaj"}'::jsonb, true) where field_key = 'mosal'),
    'a samaj biodata still needs the mosal');
  perform pg_temp.ok(
    not exists (select 1 from app.validate_biodata('{"origin":"samaj"}'::jsonb, true) where field_key = 'caste'),
    'a samaj biodata is not asked for a caste');

  perform pg_temp.as_user(v_admin);
  perform pg_temp.ok(
    (select is_sanatan from public.admin_profiles('Pooja')),
    'the admin''s profiles list knows she is a Sanatan daughter');

  raise notice 'sanatan assertions passed';
end
$$;
