-- ---------------------------------------------------------------------------
-- Development seed.
--
-- Every record here is produced by calling the same RPCs the application calls,
-- with the same JWT claims a signed-in user would carry. Nothing is inserted
-- behind the state machine. That makes the seed a working demonstration of the
-- flows, and it fails loudly if a transition stops being reachable.
--
-- Fictional data only, as the prototype's README requires.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------- helpers ---
-- GoTrue's auth.users has columns this project's local shim does not, and vice
-- versa. Build the INSERT from whatever columns are actually present so the
-- seed runs against both `supabase db reset` and tests/verify.sh.
create or replace function pg_temp.seed_user(p_id uuid, p_phone text, p_name text)
returns uuid
language plpgsql
as $$
declare
  v_cols text := 'id, phone, encrypted_password, raw_user_meta_data, created_at, updated_at';
  v_vals text;
begin
  v_vals := format(
    '%L::uuid, %L, extensions.crypt(%L, extensions.gen_salt(''bf'')), %L::jsonb, now(), now()',
    p_id, '91' || p_phone, 'samaj-setu-dev',
    json_build_object('display_name', p_name, 'preferred_language', 'gu')::text
  );

  -- GoTrue requires these; the shim has no such columns.
  if exists (select 1 from information_schema.columns
             where table_schema = 'auth' and table_name = 'users' and column_name = 'instance_id') then
    v_cols := v_cols || ', instance_id, aud, role';
    v_vals := v_vals || ', ''00000000-0000-0000-0000-000000000000''::uuid, ''authenticated'', ''authenticated''';
  end if;

  -- Set so that password sign-in works locally. This is GoTrue's record of a
  -- usable phone identity; it is NOT the product's notion of a verified phone,
  -- which lives in accounts.phone_verified_at and stays null because this
  -- release sends no OTP.
  if exists (select 1 from information_schema.columns
             where table_schema = 'auth' and table_name = 'users' and column_name = 'phone_confirmed_at') then
    v_cols := v_cols || ', phone_confirmed_at';
    v_vals := v_vals || ', now()';
  end if;

  execute format('insert into auth.users (%s) values (%s) on conflict (id) do nothing', v_cols, v_vals);

  return p_id;
end
$$;

create or replace function pg_temp.as_user(p_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text,
    false
  );
end
$$;

-- Registers a candidate, uploads a (recorded but not stored) certificate,
-- submits, and has an admin approve — the whole of spec §3 in one call.
create or replace function pg_temp.verified_candidate(
  p_operator uuid, p_admin uuid, p_relationship public.relationship,
  p_name text, p_dob date, p_gender public.gender,
  p_father text, p_city text
)
returns uuid
language plpgsql
as $$
declare
  v_start jsonb;
  v_candidate uuid;
  v_application uuid;
begin
  perform pg_temp.as_user(p_operator);
  v_start := public.start_registration(p_relationship, p_name, p_dob, p_gender, p_father, null, p_city, p_city);
  v_candidate := (v_start ->> 'candidate_id')::uuid;
  v_application := (v_start ->> 'application_id')::uuid;

  -- No object is written to storage; only the row that records one. A seeded
  -- certificate is a filename, exactly as in the prototype.
  perform public.attach_certificate(
    v_application, v_candidate::text || '/seed-certificate.pdf', 'application/pdf', 84000
  );
  perform public.submit_registration(v_application);

  perform pg_temp.as_user(p_admin);
  perform public.admin_decide_registration(v_application, 'approve', 'submitted', 'Details match the certificate.');

  return v_candidate;
end
$$;

-- Completes, submits, approves and consents to a biodata revision.
create or replace function pg_temp.publish_candidate(
  p_candidate uuid, p_operator uuid, p_self uuid, p_admin uuid, p_data jsonb
)
returns void
language plpgsql
as $$
declare
  v_saved jsonb;
  v_revision uuid;
begin
  perform pg_temp.as_user(p_operator);
  v_saved := public.save_biodata_draft(p_candidate, p_data);
  v_revision := (v_saved ->> 'revision_id')::uuid;
  perform public.submit_biodata(v_revision);

  perform pg_temp.as_user(p_admin);
  perform public.admin_decide_biodata(v_revision, 'approve', 'submitted', 'Complete and consistent.');

  -- Spec §4: only the candidate's own account may consent.
  perform pg_temp.as_user(p_self);
  perform public.grant_publication_consent(p_candidate);
end
$$;

-- ------------------------------------------------------------------ staff --
do $$
declare
  v_super uuid := '00000000-0000-4000-8000-000000000001';
  v_admin uuid := '00000000-0000-4000-8000-000000000002';
begin
  perform pg_temp.seed_user(v_super, '9999900001', 'Samaj Setu superadmin');
  perform pg_temp.seed_user(v_admin, '9999900002', 'Samaj Setu admin');

  -- Bootstrapping the first superadmin is necessarily a privileged act: there
  -- is nobody yet who could grant it. Every later grant goes through
  -- public.grant_role(), which refuses a self-grant.
  insert into public.account_roles (account_id, role) values (v_super, 'superadmin')
    on conflict do nothing;

  perform pg_temp.as_user(v_super);
  perform public.grant_role(v_admin, 'admin');
end
$$;

-- ----------------------------------------------------------- the families --
do $$
declare
  v_admin  uuid := '00000000-0000-4000-8000-000000000002';

  v_rajesh uuid := '00000000-0000-4000-8000-000000000010';  -- parent
  v_aarav  uuid := '00000000-0000-4000-8000-000000000011';  -- his son, own account
  v_kavya  uuid := '00000000-0000-4000-8000-000000000012';
  v_riya   uuid := '00000000-0000-4000-8000-000000000013';
  v_nidhi  uuid := '00000000-0000-4000-8000-000000000014';
  v_meena  uuid := '00000000-0000-4000-8000-000000000015';  -- parent, application pending
  v_suresh uuid := '00000000-0000-4000-8000-000000000016';  -- parent, correction asked

  c_aarav uuid; c_kavya uuid; c_riya uuid; c_nidhi uuid; c_dhara uuid; c_jay uuid;
  v_start jsonb; v_app uuid;
begin
  perform pg_temp.seed_user(v_rajesh, '9876543210', 'રાજેશભાઈ શાહ');
  perform pg_temp.seed_user(v_aarav,  '9876500011', 'આરવ શાહ');
  perform pg_temp.seed_user(v_kavya,  '9876500012', 'કાવ્યા દેસાઈ');
  perform pg_temp.seed_user(v_riya,   '9876500013', 'રિયા મહેતા');
  perform pg_temp.seed_user(v_nidhi,  '9876500014', 'નિધિ પટેલ');
  perform pg_temp.seed_user(v_meena,  '9876500015', 'મીનાબેન જોષી');
  perform pg_temp.seed_user(v_suresh, '9876500016', 'સુરેશભાઈ પરમાર');

  -- ------------------------------------------------ a published son (viewer)
  c_aarav := pg_temp.verified_candidate(
    v_rajesh, v_admin, 'son', 'આરવ શાહ', date '1998-03-14', 'male', 'રાજેશ શાહ', 'Surat');

  -- Aarav also holds his own account, which is what lets him consent.
  insert into public.candidate_memberships
    (candidate_id, account_id, role, relationship, linked_by_account_id)
  values (c_aarav, v_aarav, 'candidate', 'self', v_admin)
  on conflict do nothing;

  perform pg_temp.publish_candidate(c_aarav, v_rajesh, v_aarav, v_admin, jsonb_build_object(
    'gender', 'male', 'height', '175', 'marital', 'never',
    'community', 'surti', 'sect', 'bhagat', 'surname', 'Shah', 'mosal', 'Trivedi',
    'education', 'bachelor', 'degree', 'B.E. Computer', 'work', 'employed',
    'role', 'Software engineer', 'employer', 'Surat Systems',
    'mother', 'Nayana Shah', 'native', 'Surat', 'diet', 'vegetarian',
    'brothers', '0', 'sisters', '1',
    'birthplace', 'Surat', 'birthtime', '06:20', 'rashi', 'Pisces', 'gan', 'dev', 'mangal', 'no',
    'contactKind', 'father', 'phone', '9876543210'));

  -- --------------------------------------- three published daughters (§13's
  -- seeded launch target, at prototype scale)
  c_kavya := pg_temp.verified_candidate(
    v_kavya, v_admin, 'self', 'કાવ્યા દેસાઈ', date '2000-06-02', 'female', 'મહેશ દેસાઈ', 'Surat');
  perform pg_temp.publish_candidate(c_kavya, v_kavya, v_kavya, v_admin, jsonb_build_object(
    'gender', 'female', 'height', '165', 'marital', 'never',
    'community', 'surti', 'sect', 'bhagat', 'surname', 'Desai', 'mosal', 'Patel',
    'education', 'master', 'degree', 'M.Arch', 'work', 'employed',
    'role', 'Architect', 'employer', 'Desai & Associates',
    'mother', 'Bhavna Desai', 'native', 'Surat', 'diet', 'vegetarian',
    'brothers', '1', 'sisters', '0',
    'birthplace', 'Surat', 'birthtime', '11:45', 'rashi', 'Gemini', 'gan', 'manushya', 'mangal', 'unknown',
    'contactKind', 'self', 'phone', '9876500012'));

  c_riya := pg_temp.verified_candidate(
    v_riya, v_admin, 'self', 'રિયા મહેતા', date '2001-01-19', 'female', 'કિરીટ મહેતા', 'Ahmedabad');
  perform pg_temp.publish_candidate(c_riya, v_riya, v_riya, v_admin, jsonb_build_object(
    'gender', 'female', 'height', '162', 'marital', 'never',
    'community', 'ahmedabadi', 'sect', 'jagat', 'surname', 'Mehta', 'mosal', 'Desai',
    'education', 'master', 'degree', 'MBA', 'work', 'employed',
    'role', 'Product designer', 'employer', 'Ahmedabad Labs',
    'mother', 'Rekha Mehta', 'native', 'Ahmedabad', 'diet', 'jain',
    'brothers', '0', 'sisters', '2',
    'birthplace', 'Ahmedabad', 'birthtime', '19:05', 'rashi', 'Capricorn', 'gan', 'dev', 'mangal', 'no',
    'contactKind', 'self', 'phone', '9876500013'));

  -- Nidhi's mosal matches Aarav's, so spec §7's hard exclusion applies to that
  -- pair and to nobody else. The seed exists to make that visible.
  c_nidhi := pg_temp.verified_candidate(
    v_nidhi, v_admin, 'self', 'નિધિ પટેલ', date '1999-11-08', 'female', 'હસમુખ પટેલ', 'Surat');
  perform pg_temp.publish_candidate(c_nidhi, v_nidhi, v_nidhi, v_admin, jsonb_build_object(
    'gender', 'female', 'height', '167', 'marital', 'never',
    'community', 'surti', 'sect', 'bhagat', 'surname', 'Patel', 'mosal', 'Trivedi',
    'education', 'master', 'degree', 'M.Com', 'work', 'employed',
    'role', 'Finance analyst', 'employer', 'Surat Finance',
    'mother', 'Jyoti Patel', 'native', 'Surat', 'diet', 'vegetarian',
    'brothers', '2', 'sisters', '0',
    'birthplace', 'Surat', 'birthtime', '04:30', 'rashi', 'Scorpio', 'gan', 'rakshas', 'mangal', 'yes',
    'contactKind', 'self', 'phone', '9876500014'));

  -- --------------------------------------------- an application under review
  perform pg_temp.as_user(v_meena);
  v_start := public.start_registration(
    'daughter', 'ધારા જોષી', date '2002-04-21', 'female', 'પ્રવીણ જોષી', null, 'Vadodara', 'Vadodara');
  c_dhara := (v_start ->> 'candidate_id')::uuid;
  v_app := (v_start ->> 'application_id')::uuid;
  perform public.attach_certificate(v_app, c_dhara::text || '/seed-certificate.pdf', 'image/jpeg', 220000);
  perform public.submit_registration(v_app);

  -- ------------------------------------------------- a correction requested
  perform pg_temp.as_user(v_suresh);
  v_start := public.start_registration(
    'son', 'જય પરમાર', date '1997-09-30', 'male', 'સુરેશ પરમાર', null, 'Rajkot', 'Rajkot');
  c_jay := (v_start ->> 'candidate_id')::uuid;
  v_app := (v_start ->> 'application_id')::uuid;
  perform public.attach_certificate(v_app, c_jay::text || '/seed-certificate.pdf', 'image/png', 190000);
  perform public.submit_registration(v_app);

  perform pg_temp.as_user(v_admin);
  perform public.admin_decide_registration(
    v_app, 'request_correction', 'submitted',
    'જન્મ પ્રમાણપત્ર પરની તારીખ અરજી સાથે મેળ ખાતી નથી. / The date on the certificate does not match the application.',
    array['date_of_birth'],
    'DOB on certificate reads 1997-09-03.');

  -- ----------------------------------------------- one interest, accepted
  perform pg_temp.as_user(v_rajesh);
  perform public.send_interest(c_aarav, c_kavya, 'અમને આ પરિચય યોગ્ય લાગે છે.');

  perform pg_temp.as_user(v_kavya);
  perform public.respond_interest(
    (select id from public.interests
      where from_candidate_id = c_aarav and to_candidate_id = c_kavya), true);

  -- ------------------------------------- one photo request, still pending
  perform pg_temp.as_user(v_rajesh);
  perform public.request_media_access(c_aarav, c_riya, 'photo', 'ફોટો જોવાની વિનંતી.');

  perform set_config('request.jwt.claims', null, false);
end
$$;

-- Seeded candidates have no biodata photographs: no object exists in the
-- private buckets, and inventing a candidate_media row for a file that is not
-- there would make list_viewable_media return a broken signed URL.
