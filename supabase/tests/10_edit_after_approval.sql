-- ---------------------------------------------------------------------------
-- An approved family edits its own biodata and registration details. The
-- approved version stays live until an admin approves the new one.
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
  v_riya   uuid := '00000000-0000-4000-8000-000000000013';
  v_meena  uuid := '00000000-0000-4000-8000-000000000015';
  c_riya   uuid;
  c_aarav  uuid;
  v_live   uuid;
  v_rev    uuid;
  v_out    jsonb;
  v_detail jsonb;
begin
  c_riya := (select id from public.candidates where full_name = 'રિયા મહેતા');
  c_aarav := (select id from public.candidates where public_code = 'SS-1024');
  v_live := (select published_revision_id from public.candidates where id = c_riya);
  perform pg_temp.ok((select discoverable from public.candidates where id = c_riya), 'Riya starts live');

  -- ------------------------------------------------ who may, and when
  perform pg_temp.ok(
    pg_temp.fails(v_rajesh, format('select public.propose_detail_changes(%L, p_city => %L)', c_riya, 'Surat'), 'forbidden:%'),
    'another family cannot change her details');
  perform pg_temp.ok(
    pg_temp.fails(v_riya, format('select public.propose_detail_changes(%L, p_date_of_birth => %L)', c_riya, current_date - 365), 'invalid:%'),
    'a date of birth under 18 is refused');
  perform pg_temp.ok(
    pg_temp.fails(v_meena,
      format('select public.propose_detail_changes(%L, p_gender => %L)',
             (select id from public.candidates where full_name = 'Pooja Sanatandikri'), 'male'),
      'invalid:%Sanatan%'),
    'a Sanatan daughter cannot be changed to a son');
  perform pg_temp.ok(
    pg_temp.fails(v_rajesh,
      format('select public.propose_detail_changes(%L, p_city => %L)',
             (select id from public.candidates where full_name = 'Varun Notsanatan'), 'Surat'),
      'conflict:%registration%'),
    'a family still under review changes the registration instead');

  -- ------------------------------------------------ registration details
  perform pg_temp.as_user(v_riya);
  v_out := public.propose_detail_changes(c_riya, p_full_name => 'Riya K Mehta', p_city => 'Surat');
  v_rev := (v_out ->> 'revision_id')::uuid;
  perform pg_temp.ok(v_rev <> v_live, 'the change opens a new version');
  perform pg_temp.ok(v_out -> 'detail_changes' = '{"full_name":"Riya K Mehta","city":"Surat"}'::jsonb,
    'the version carries the registration changes');
  perform pg_temp.ok((select full_name from public.candidates where id = c_riya) = 'રિયા મહેતા',
    'her name is not changed before approval');

  v_out := public.propose_detail_changes(c_riya, p_city => 'Ahmedabad');
  perform pg_temp.ok(v_out -> 'detail_changes' = '{"full_name":"Riya K Mehta"}'::jsonb,
    'a value put back to what is on file is no longer a change');

  -- ------------------------------------------------ typing a community field
  perform public.save_biodata_draft(c_riya, '{"mosal":"Shah"}'::jsonb);
  perform pg_temp.ok((select mosal_family from public.candidate_community where candidate_id = c_riya) = 'Desai',
    'eligibility still reads her approved mosal while she types');
  perform pg_temp.ok((select confirmed_at is not null from public.candidate_community where candidate_id = c_riya),
    'her approved community details stay confirmed');
  perform pg_temp.ok((select biodata ->> 'mosal' from public.directory_profiles where id = c_riya) = 'Desai',
    'other families still read the approved biodata');
  perform pg_temp.ok((select discoverable from public.candidates where id = c_riya), 'she is live while editing');

  -- ------------------------------------------------ sent, sent back, dropped
  perform public.submit_biodata(v_rev);
  perform pg_temp.ok((select discoverable and publication_status = 'published' from public.candidates where id = c_riya),
    'sending the changes keeps her live');
  perform pg_temp.ok(
    pg_temp.fails(v_riya, format('select public.propose_detail_changes(%L, p_city => %L)', c_riya, 'Surat'), 'conflict:%under review%'),
    'nothing changes while an admin is checking');

  perform pg_temp.as_user(v_admin);
  perform pg_temp.ok(
    exists (select 1 from public.admin_family_queue('review') q where q.candidate_id = c_riya and q.stage = 'biodata_review'),
    'the changes are in the admin''s review list');
  v_detail := public.admin_biodata_detail(v_rev);
  perform pg_temp.ok((v_detail -> 'published' ->> 'id')::uuid = v_live, 'the admin sees the live version to compare');
  perform pg_temp.ok(v_detail -> 'revision' -> 'detail_changes' ->> 'full_name' = 'Riya K Mehta',
    'the admin sees the new name');

  perform public.admin_decide_biodata(v_rev, 'request_correction', 'submitted', 'Please check the mosal.',
    '[{"field":"mosal","gu":"મોસાળ તપાસો","en":"Check the mosal"}]'::jsonb);
  perform pg_temp.ok((select discoverable and publication_status = 'published' from public.candidates where id = c_riya),
    'a fix request keeps her live');

  perform pg_temp.as_user(v_riya);
  perform public.discard_biodata_changes(c_riya);
  perform pg_temp.ok(not exists (select 1 from public.biodata_revisions where id = v_rev), 'the changes are dropped');
  perform pg_temp.ok((select published_revision_id from public.candidates where id = c_riya) = v_live,
    'the approved version is untouched');
  perform pg_temp.ok((select discoverable from public.candidates where id = c_riya), 'she is still live');

  -- ------------------------------------------------ rejected
  v_rev := (public.propose_detail_changes(c_riya, p_full_name => 'Riya K Mehta') ->> 'revision_id')::uuid;
  perform public.submit_biodata(v_rev);
  perform pg_temp.as_user(v_admin);
  perform public.admin_decide_biodata(v_rev, 'reject', 'submitted', 'The name does not match the certificate.');
  perform pg_temp.ok((select discoverable and full_name = 'રિયા મહેતા' from public.candidates where id = c_riya),
    'a rejected change leaves her live, with her name as approved');
  perform pg_temp.ok(
    exists (select 1 from public.admin_family_queue('live') q where q.candidate_id = c_riya),
    'the admin still lists her as live');

  -- ------------------------------------------------ approved
  perform pg_temp.as_user(v_riya);
  v_rev := (public.propose_detail_changes(c_riya, p_full_name => 'Riya K Mehta', p_city => 'Surat') ->> 'revision_id')::uuid;
  perform pg_temp.ok((select detail_changes = '{"full_name":"Riya K Mehta","city":"Surat"}'::jsonb
                        from public.biodata_revisions where id = v_rev),
    'a new version after a rejection starts clean');
  perform public.save_biodata_draft(c_riya, '{"mosal":"Shah"}'::jsonb);
  perform public.submit_biodata(v_rev);

  perform pg_temp.as_user(v_admin);
  perform public.admin_decide_biodata(v_rev, 'approve', 'submitted');
  perform pg_temp.ok((select full_name = 'Riya K Mehta' and city = 'Surat' from public.candidates where id = c_riya),
    'approval writes the registration changes');
  perform pg_temp.ok((select published_revision_id from public.candidates where id = c_riya) = v_rev,
    'approval publishes the new version');
  perform pg_temp.ok((select status from public.biodata_revisions where id = v_live) = 'superseded',
    'the old version is kept as history');
  perform pg_temp.ok((select mosal_family = 'Shah' and confirmed_at is not null
                        from public.candidate_community where candidate_id = c_riya),
    'approval moves the new mosal into eligibility, confirmed');
  perform pg_temp.ok((select discoverable from public.candidates where id = c_riya), 'she is live after approval');
  perform pg_temp.ok((select biodata ->> 'mosal' = 'Shah' and full_name = 'Riya K Mehta'
                        from public.directory_profiles where id = c_riya),
    'other families now read the new version');

  -- ------------------------------------------------ gender follows along
  perform pg_temp.as_user(v_rajesh);
  v_rev := (public.propose_detail_changes(c_aarav, p_gender => 'female') ->> 'revision_id')::uuid;
  perform pg_temp.ok((select data ->> 'gender' from public.biodata_revisions where id = v_rev) = 'female',
    'the biodata''s gender follows a gender change');
  perform pg_temp.ok((select gender from public.candidates where id = c_aarav) = 'male',
    'the candidate''s gender waits for approval');
  perform public.save_biodata_draft(c_aarav, '{"gender":"male","height":"176"}'::jsonb);
  perform pg_temp.ok((select data ->> 'gender' = 'female' and data ->> 'height' = '176'
                        from public.biodata_revisions where id = v_rev),
    'a late autosave of the old gender does not undo the change');
  perform public.propose_detail_changes(c_aarav, p_gender => 'male');
  perform pg_temp.ok((select detail_changes = '{}'::jsonb and data ->> 'gender' = 'male'
                        from public.biodata_revisions where id = v_rev),
    'putting the gender back undoes both');
  perform public.discard_biodata_changes(c_aarav);

  perform pg_temp.ok(
    pg_temp.fails(v_rajesh,
      format('select public.discard_biodata_changes(%L)', (select id from public.candidates where full_name = 'Varun Notsanatan')),
      'conflict:%'),
    'a biodata never approved is not discarded this way');

  raise notice 'edit-after-approval assertions passed';
end
$$;
