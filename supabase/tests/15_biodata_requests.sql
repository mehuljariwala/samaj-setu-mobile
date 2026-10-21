-- ---------------------------------------------------------------------------
-- The samaj's 2026-10-21 biodata questions: the current and native addresses,
-- the શાખ, and the divorce and widowhood questions asked only when they apply.
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

create or replace function pg_temp.problem(p_data jsonb, p_key text, p_complete boolean default true)
returns text
language sql
as $$
  select problem from app.validate_biodata(p_data, p_complete) where field_key = p_key limit 1
$$;

do $$
declare
  v_base jsonb := jsonb_build_object(
    'origin', 'samaj', 'gender', 'male', 'height', '170', 'marital', 'never',
    'community', 'surti', 'sect', 'bhagat', 'surname', 'Testwala', 'mosal', 'Mosalwala',
    'education', 'bachelor', 'work', 'employed', 'contactKind', 'father', 'phone', '9876501234',
    'address', '1, Khatri Mohalla, Surat');
  v_rev  public.biodata_revisions;
  v_dir  jsonb;
begin
  perform pg_temp.ok(not exists (select 1 from app.validate_biodata(v_base, true)),
    'a complete samaj biodata has no problems');

  -- Every family gives a current address now, not only a Sanatan daughter.
  perform pg_temp.ok(pg_temp.problem(v_base - 'address', 'address') = 'required',
    'a samaj biodata needs the current address');
  perform pg_temp.ok(pg_temp.problem(v_base, 'nativeAddress') is null and pg_temp.problem(v_base, 'shakh') is null,
    'the native address and the shakh are optional');
  perform pg_temp.ok(
    not exists (select 1 from app.validate_biodata(v_base || '{"shakh":"Vachhani","nativeAddress":"Khambhat"}', true)),
    'the shakh and the native address are known fields');

  -- Divorce questions are asked of a divorced biodata, and only of one.
  perform pg_temp.ok(pg_temp.problem(v_base, 'divorceDate') is null, 'a never-married biodata is not asked a divorce date');
  perform pg_temp.ok(pg_temp.problem(v_base || '{"marital":"divorced"}', 'divorceDate') = 'required',
    'a divorced biodata needs the divorce date');
  perform pg_temp.ok(pg_temp.problem(v_base || '{"marital":"divorced"}', 'divorceDetails') = 'required',
    'a divorced biodata needs the divorce details');
  perform pg_temp.ok(pg_temp.problem(v_base || '{"marital":"divorced"}', 'widowedDate') is null,
    'a divorced biodata is not asked a date of death');
  perform pg_temp.ok(pg_temp.problem(v_base || '{"marital":"widowed"}', 'widowedDate') = 'required',
    'a widowed biodata needs the date of the spouse''s death');
  perform pg_temp.ok(
    not exists (select 1 from app.validate_biodata(
      v_base || '{"marital":"divorced","divorceDate":"2022-03-14","divorceDetails":"Final decree, Surat family court"}', true)),
    'a divorced biodata with both answers is complete');
  perform pg_temp.ok(pg_temp.problem(v_base || '{"marital":"divorced"}', 'divorceDate', false) is null,
    'a draft may leave the divorce date for later');

  -- A date has to be a real one, and not in the future.
  perform pg_temp.ok(pg_temp.problem(v_base || '{"widowedDate":"2026-02-30"}', 'widowedDate', false) = 'not_a_date',
    'a day that does not exist is not a date');
  perform pg_temp.ok(pg_temp.problem(v_base || '{"widowedDate":"14/03/2022"}', 'widowedDate', false) = 'not_a_date',
    'a date is written yyyy-mm-dd');
  perform pg_temp.ok(
    pg_temp.problem(v_base || jsonb_build_object('widowedDate', (current_date + 1)::text), 'widowedDate', false) = 'not_a_date',
    'a date cannot be in the future');

  -- Completion counts a conditional question only where it is asked.
  perform pg_temp.ok(app.biodata_completion(v_base) = 100, 'a never-married biodata is complete without divorce answers');
  perform pg_temp.ok(app.biodata_completion(v_base || '{"marital":"divorced"}') < 100,
    'a divorced biodata without them is not');

  -- Completeness is checked when a biodata is submitted, not on every later
  -- write: a question added to the catalogue must not break an approved one.
  select r.* into v_rev
    from public.directory_profiles d join public.biodata_revisions r on r.id = d.revision_id
   order by d.public_code limit 1;
  perform pg_temp.ok(v_rev.status = 'approved', 'the seed has a published biodata to check against');
  update public.biodata_revisions set data = data - 'address' where id = v_rev.id;
  perform pg_temp.ok((select not (data ? 'address') from public.biodata_revisions where id = v_rev.id),
    'an approved biodata from before a new question can still be written');

  perform pg_temp.ok(exists (select 1 from public.biodata_revisions where status = 'draft'),
    'the seed has a draft to submit');
  -- The photo rule (20261004000600) would refuse it first; it is not what
  -- this checks.
  alter table public.biodata_revisions disable trigger biodata_needs_a_photo_to_send;
  begin
    update public.biodata_revisions set data = data - 'address', status = 'submitted'
     where id = (select id from public.biodata_revisions where status = 'draft' order by id limit 1);
    raise exception 'ASSERTION FAILED: a biodata without the current address was submitted';
  exception
    when check_violation then
      perform pg_temp.ok(sqlerrm like '%address:required%', 'submitting checks the current address: ' || sqlerrm);
  end;
  alter table public.biodata_revisions enable trigger biodata_needs_a_photo_to_send;

  -- Neither address reaches other families.
  update public.biodata_revisions
     set data = data || '{"address":"1, Khatri Mohalla, Surat","nativeAddress":"Khambhat","shakh":"Vachhani"}'
   where id = v_rev.id;
  select biodata into v_dir from public.directory_profiles where revision_id = v_rev.id;
  perform pg_temp.ok(not (v_dir ? 'address') and not (v_dir ? 'nativeAddress'),
    'the directory copy carries neither address');
  perform pg_temp.ok(v_dir ->> 'shakh' = 'Vachhani', 'the directory copy does carry the shakh');

  raise notice 'biodata request assertions passed';
end
$$;
