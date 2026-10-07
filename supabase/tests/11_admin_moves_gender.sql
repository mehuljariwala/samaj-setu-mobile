-- ---------------------------------------------------------------------------
-- An admin moves a profile between Boys and Girls, and everything that names
-- the gender follows.
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
  v_admin    uuid := '00000000-0000-4000-8000-000000000002';
  v_rajesh   uuid := '00000000-0000-4000-8000-000000000010';
  v_riya     uuid := '00000000-0000-4000-8000-000000000013';
  v_meena    uuid := '00000000-0000-4000-8000-000000000015';
  c_aarav    uuid;
  c_riya     uuid;
  c_dhara    uuid;
  v_interest uuid;
  v_draft    uuid;
  v_out      jsonb;
begin
  c_aarav := (select id from public.candidates where public_code = 'SS-1024');
  c_riya := (select id from public.candidates where full_name = 'Riya K Mehta');
  c_dhara := (select id from public.candidates where full_name = 'ધારા જોષી');

  perform pg_temp.ok(
    pg_temp.fails(v_rajesh, format('select public.admin_set_gender(%L, %L)', c_riya, 'male'), 'forbidden:%'),
    'a family cannot move a profile');
  perform pg_temp.ok(
    pg_temp.fails(v_admin,
      format('select public.admin_set_gender(%L, %L)', (select id from public.candidates where full_name = 'Pooja Sanatandikri'), 'male'),
      'invalid:%Sanatan%'),
    'a Sanatan daughter is not moved to the boys');

  -- A boy's family is interested in her, and her own family has a version open
  -- that asks to change her gender and city.
  perform pg_temp.as_user(v_rajesh);
  v_interest := public.send_interest(c_aarav, c_riya, null);
  perform pg_temp.as_user(v_riya);
  v_draft := (public.propose_detail_changes(c_riya, p_gender => 'male', p_city => 'Rajkot') ->> 'revision_id')::uuid;

  perform pg_temp.as_user(v_admin);
  v_out := public.admin_set_gender(c_riya, 'male');
  perform pg_temp.ok((select gender from public.candidates where id = c_riya) = 'male', 'the profile moves to the boys');
  perform pg_temp.ok(
    (select r.data ->> 'gender' from public.biodata_revisions r join public.candidates c on c.published_revision_id = r.id
      where c.id = c_riya) = 'male',
    'the published biodata says male');
  perform pg_temp.ok(
    (select data ->> 'gender' = 'male' and detail_changes = '{"city":"Rajkot"}'::jsonb
       from public.biodata_revisions where id = v_draft),
    'the open version follows, and the family''s own gender change is settled');
  perform pg_temp.ok((select status from public.interests where id = v_interest) = 'withdrawn'
                     and (v_out ->> 'withdrawn_interests')::integer = 1,
    'an interest between two boys is withdrawn');
  perform pg_temp.ok((select discoverable from public.candidates where id = c_riya), 'the profile stays live');
  perform pg_temp.ok((select gender from public.admin_profiles('Riya')) = 'male', 'the admin''s list shows her among the boys');

  v_out := public.admin_set_gender(c_riya, 'male');
  perform pg_temp.ok((v_out ->> 'withdrawn_interests')::integer = 0, 'moving to the same group changes nothing');

  -- A parent who picked "my daughter" for a son.
  perform public.admin_set_gender(c_dhara, 'male');
  perform pg_temp.ok(
    (select bool_and(relationship = 'son') from public.candidate_memberships where candidate_id = c_dhara and role <> 'candidate')
    and (select operator_relationship from public.registration_applications where candidate_id = c_dhara) = 'son',
    'the parent''s "daughter" becomes "son"');
  perform public.admin_set_gender(c_dhara, 'female');
  perform pg_temp.ok(
    (select operator_relationship from public.registration_applications where candidate_id = c_dhara) = 'daughter',
    'and back again');

  perform pg_temp.as_user(v_riya);
  perform public.discard_biodata_changes(c_riya);

  raise notice 'admin moves gender assertions passed';
end
$$;
