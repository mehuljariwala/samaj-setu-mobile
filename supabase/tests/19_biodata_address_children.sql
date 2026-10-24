-- ---------------------------------------------------------------------------
-- The samaj's 2026-10-24 biodata questions: the number of children of a
-- divorced or widowed son or daughter, and the full current and native
-- addresses, which stay with the admins.
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

-- The error a statement raises, run as this account; null when it succeeds.
create or replace function pg_temp.error_of(p_account uuid, p_sql text) returns text language plpgsql as $$
begin
  perform pg_temp.as_user(p_account);
  execute p_sql;
  return null;
exception
  when others then
    return sqlerrm;
end
$$;

create or replace function pg_temp.problem(p_data jsonb, p_key text, p_complete boolean default true)
returns text
language sql
as $$
  select problem from app.validate_biodata(p_data, p_complete) where field_key = p_key limit 1
$$;

do $$
declare
  v_address jsonb := jsonb_build_object(
    'address', '12, Shanti Society',
    'addressArea', 'Adajan', 'addressCity', 'Surat', 'addressDistrict', 'Surat', 'addressState', 'Gujarat', 'addressPin', '395009');
  v_base jsonb := v_address || jsonb_build_object(
    'origin', 'samaj', 'gender', 'male', 'height', '170', 'marital', 'never',
    'community', 'surti', 'sect', 'bhagat', 'surname', 'Testwala', 'mosal', 'Mosalwala',
    'education', 'bachelor', 'work', 'employed', 'contactKind', 'father', 'phone', '9876501234');
  v_native jsonb := jsonb_build_object(
    'addressLandmark', 'Near Star Bazaar', 'addressTaluka', 'Choryasi',
    'nativeAddress', 'Mota Faliya', 'nativeVillage', 'Khambhat', 'nativeTaluka', 'Khambhat',
    'nativeDistrict', 'Anand', 'nativeState', 'Gujarat', 'nativePin', '388620');
  v_key  text;
  v_rev  public.biodata_revisions;
  v_dir  jsonb;
begin
  perform pg_temp.ok(not exists (select 1 from app.validate_biodata(v_base, true)),
    'a complete samaj biodata with the full address has no problems');

  -- The current address: every part but the landmark and taluka is required.
  foreach v_key in array array['address', 'addressArea', 'addressCity', 'addressDistrict', 'addressState', 'addressPin'] loop
    perform pg_temp.ok(pg_temp.problem(v_base - v_key, v_key) = 'required', 'the current address needs ' || v_key);
  end loop;
  perform pg_temp.ok(
    not exists (select 1 from app.validate_biodata(v_base || v_native, true)),
    'the landmark, the taluka and every part of the native address are known fields');

  -- A PIN code is six digits, the first not 0.
  perform pg_temp.ok(pg_temp.problem(v_base || '{"addressPin":"39500"}', 'addressPin', false) = 'not_a_pincode',
    'a five-digit PIN code is refused');
  perform pg_temp.ok(pg_temp.problem(v_base || '{"addressPin":"095009"}', 'addressPin', false) = 'not_a_pincode',
    'a PIN code cannot start with 0');
  perform pg_temp.ok(pg_temp.problem(v_base || '{"nativePin":"3886 20"}', 'nativePin', false) = 'not_a_pincode',
    'the native PIN code is checked too');

  -- The number of children is asked of a divorced or widowed biodata only.
  perform pg_temp.ok(pg_temp.problem(v_base, 'children') is null, 'a never-married biodata is not asked about children');
  perform pg_temp.ok(
    pg_temp.problem(v_base || '{"marital":"divorced","divorceDate":"2022-03-14","divorceDetails":"Mutual consent"}', 'children') = 'required',
    'a divorced biodata says how many children');
  perform pg_temp.ok(
    pg_temp.problem(v_base || '{"marital":"widowed","widowedDate":"2021-07-02"}', 'children') = 'required',
    'a widowed biodata says how many children');
  perform pg_temp.ok(
    not exists (select 1 from app.validate_biodata(
      v_base || '{"marital":"widowed","widowedDate":"2021-07-02","children":"0"}', true)),
    'none is an answer');
  perform pg_temp.ok(pg_temp.problem(v_base || '{"children":"7"}', 'children', false) = 'not_an_option',
    'the number of children is one of the choices');
  perform pg_temp.ok(app.biodata_completion(v_base || '{"marital":"divorced","divorceDate":"2022-03-14","divorceDetails":"x"}') < 100,
    'a divorced biodata without the number of children is not complete');
  perform pg_temp.ok(app.biodata_completion(v_base || '{"marital":"divorced","divorceDate":"2022-03-14","divorceDetails":"x","children":"5+"}') = 100,
    'with it, it is');

  -- A single value in asked_when still reads as before.
  perform pg_temp.ok(app.is_asked('{"key":"marital","value":"divorced"}', '{"marital":"divorced"}')
    and not app.is_asked('{"key":"marital","value":"divorced"}', '{"marital":"widowed"}')
    and not app.is_asked('{"key":"marital","value":["divorced","widowed"]}', '{}')
    and app.is_asked(null, '{}'),
    'asked_when takes one value or a list');

  -- An approved biodata from before the full address is still written to.
  select r.* into v_rev
    from public.directory_profiles d join public.biodata_revisions r on r.id = d.revision_id
   order by d.public_code limit 1;
  update public.biodata_revisions set data = data - 'addressPin' - 'addressArea' where id = v_rev.id;

  -- No part of either address reaches other families.
  update public.biodata_revisions set data = data || v_address || v_native || '{"children":"1"}' where id = v_rev.id;
  select biodata into v_dir from public.directory_profiles where revision_id = v_rev.id;
  perform pg_temp.ok(
    not exists (select 1 from jsonb_object_keys(v_dir) k where k like 'address%' or (k like 'native%' and k <> 'native')),
    'the directory copy carries no part of either address: ' || v_dir::text);
  perform pg_temp.ok(v_dir ->> 'children' = '1', 'the directory copy does carry the number of children');

  raise notice 'biodata address and children assertions passed';
end
$$;

-- An approved family adds the address to its live biodata, with no review.
do $$
declare
  v_full     text := '{"address":"12, Shanti Society","addressArea":"Adajan","addressCity":"Surat",'
                     '"addressDistrict":"Surat","addressState":"Gujarat","addressPin":"395009","nativeVillage":"Khambhat"}';
  v_cand     uuid;
  v_family   uuid;
  v_stranger uuid;
  v_live     uuid;
  v_open     uuid;
  v_waiting  uuid;
  v_versions integer;
  v_error    text;
begin
  select c.id, c.published_revision_id, m.account_id into v_cand, v_live, v_family
    from public.candidates c
    join public.candidate_memberships m on m.candidate_id = c.id and m.revoked_at is null
   where c.published_revision_id is not null
   order by c.public_code, m.account_id limit 1;
  select m.account_id into v_stranger
    from public.candidate_memberships m
   where m.revoked_at is null
     and not exists (select 1 from public.candidate_memberships x
                      where x.candidate_id = v_cand and x.account_id = m.account_id)
   limit 1;
  perform pg_temp.ok(v_cand is not null and v_stranger is not null, 'the seed has an approved family and another');

  -- Approved before the full address was asked.
  update public.biodata_revisions
     set data = data - array['addressArea', 'addressCity', 'addressDistrict', 'addressState', 'addressPin']
   where id = v_live;

  perform pg_temp.as_user(v_family);
  perform pg_temp.ok(v_cand in (select candidate_id from public.my_address_gaps()),
    'the family is asked for the address of its approved biodata');
  perform pg_temp.as_user(v_stranger);
  perform pg_temp.ok(v_cand not in (select candidate_id from public.my_address_gaps()),
    'nobody else is asked for it');

  -- A change it already started, waiting beside the live version.
  perform pg_temp.as_user(v_family);
  v_open := (public.save_biodata_draft(v_cand, '{}'::jsonb) ->> 'revision_id')::uuid;
  perform pg_temp.ok(v_open <> v_live, 'a new version is open beside the live one');
  select count(*) into v_versions from public.biodata_revisions where candidate_id = v_cand;

  v_error := pg_temp.error_of(v_family, format('select public.save_live_address(%L, %L)', v_cand, '{"addressPin":"395009"}'));
  perform pg_temp.ok(v_error like 'incomplete: addressArea,addressCity,addressDistrict,addressState%',
    'the current address must be whole: ' || coalesce(v_error, 'saved'));
  v_error := pg_temp.error_of(v_family, format('select public.save_live_address(%L, %L)', v_cand,
    (v_full::jsonb || '{"phone":"9123456780"}')::text));
  perform pg_temp.ok(v_error like 'invalid: only the address changes here, not phone%',
    'nothing but the address goes live this way: ' || coalesce(v_error, 'saved'));
  v_error := pg_temp.error_of(v_family, format('select public.save_live_address(%L, %L)', v_cand,
    (v_full::jsonb || '{"addressPin":"39500"}')::text));
  perform pg_temp.ok(v_error like 'biodata_invalid: addressPin:not_a_pincode%',
    'a part in the wrong shape is refused: ' || coalesce(v_error, 'saved'));
  v_error := pg_temp.error_of(v_stranger, format('select public.save_live_address(%L, %L)', v_cand, v_full));
  perform pg_temp.ok(v_error like 'forbidden:%', 'another family cannot write it: ' || coalesce(v_error, 'saved'));

  v_error := pg_temp.error_of(v_family, format('select public.save_live_address(%L, %L)', v_cand, v_full));
  perform pg_temp.ok(v_error is null, 'the family saves the full address: ' || coalesce(v_error, ''));

  perform pg_temp.ok(
    (select status = 'approved' and data ->> 'addressPin' = '395009' and data ->> 'nativeVillage' = 'Khambhat'
       from public.biodata_revisions where id = v_live),
    'it is on the live version straight away, still approved');
  perform pg_temp.ok(
    (select data ->> 'addressPin' = '395009' from public.biodata_revisions where id = v_open),
    'and on the version waiting beside it');
  perform pg_temp.ok(
    (select count(*) from public.biodata_revisions where candidate_id = v_cand) = v_versions
      and (select published_revision_id from public.candidates where id = v_cand) = v_live,
    'no new version was made, and none waits for an admin because of it');
  perform pg_temp.as_user(v_family);
  perform pg_temp.ok(v_cand not in (select candidate_id from public.my_address_gaps()),
    'the banner goes once the address is there');

  -- A biodata not yet approved gets its address on the form, as everything else.
  select c.id, m.account_id into v_waiting, v_family
    from public.candidates c
    join public.candidate_memberships m on m.candidate_id = c.id and m.revoked_at is null
   where c.published_revision_id is null
   limit 1;
  v_error := pg_temp.error_of(v_family, format('select public.save_live_address(%L, %L)', v_waiting, v_full));
  perform pg_temp.ok(v_error like 'conflict:%', 'an unapproved biodata is not written this way: ' || coalesce(v_error, 'saved'));

  raise notice 'live address assertions passed';
end
$$;
