-- ---------------------------------------------------------------------------
-- સનાતન દીકરા: a son from another Hindu caste registers like a Sanatan
-- daughter, is asked the same questions, and is shown to the girls.
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
  v_meena uuid := '00000000-0000-4000-8000-000000000015';
  v_start jsonb;
  v_son   uuid;
  v_girl  uuid;
begin
  perform pg_temp.as_user(v_meena);
  v_start := public.start_registration('son', 'Kunal Sanatandikro', date '1996-02-02', 'male', 'Mahesh Joshi', null, 'Bhavnagar', 'Bhavnagar');
  v_son := (v_start ->> 'candidate_id')::uuid;
  perform public.set_sanatan(v_son, true);
  perform pg_temp.ok((select is_sanatan and gender = 'male' from public.candidates where id = v_son),
    'a son is registered as Sanatan');

  perform public.save_biodata_draft(v_son, jsonb_build_object('gender', 'male', 'height', '175', 'marital', 'never'));
  perform pg_temp.ok(
    (select data ->> 'origin' from public.biodata_revisions where candidate_id = v_son) = 'sanatan',
    'his biodata is stamped as a Sanatan biodata');
  perform pg_temp.ok(
    exists (select 1 from app.validate_biodata(
      (select data from public.biodata_revisions where candidate_id = v_son), true) where field_key = 'caste'),
    'he is asked his caste, like a Sanatan daughter');
  perform pg_temp.ok(
    not exists (select 1 from app.validate_biodata(
      (select data from public.biodata_revisions where candidate_id = v_son), true) where field_key = 'mosal'),
    'and not a Khatri mosal');

  -- Matched with the girls, not the boys. He is not live yet, so for a girl
  -- the last word is "not discoverable" rather than a gender exclusion.
  v_girl := (select c.id from public.candidates c where c.gender = 'female' and not c.is_sanatan
              and c.published_revision_id is not null order by c.public_code limit 1);
  perform pg_temp.ok(app.eligibility(v_girl, v_son) = 'not_discoverable',
    'a samaj girl is held back only by his not being live yet: ' || app.eligibility(v_girl, v_son));
  perform pg_temp.ok(
    app.eligibility((select id from public.candidates where public_code = 'SS-1024'), v_son) = 'excluded_gender',
    'a boy is not shown him');

  raise notice 'sanatan son assertions passed';
end
$$;
