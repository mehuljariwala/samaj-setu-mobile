-- ---------------------------------------------------------------------------
-- User management's profiles carry the biodata answers its filters use.
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

do $$
declare
  v_admin uuid := '00000000-0000-4000-8000-000000000002';
  v_rev   uuid;
  v_cand  uuid;
  v_data  jsonb;
begin
  -- A profile whose latest biodata has the answers filled in.
  select r.id, r.candidate_id, r.data into v_rev, v_cand, v_data
    from public.biodata_revisions r
   where r.data ? 'degree' and r.data ? 'role' and r.data ? 'education'
   order by r.version desc
   limit 1;
  perform pg_temp.ok(v_rev is not null, 'the seed has a filled-in biodata to check against');

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

  perform pg_temp.ok(
    (select bool_and(p.birth_year = extract(year from c.date_of_birth))
       from public.admin_profiles() p join public.candidates c on c.id = p.candidate_id),
    'every profile carries its birth year');

  perform pg_temp.ok(
    exists (
      select 1 from public.admin_profiles() p
       where p.revision_id = v_rev
         and p.education = v_data ->> 'education'
         and p.degree = v_data ->> 'degree'
         and p.work is not distinct from v_data ->> 'work'
         and p.role = v_data ->> 'role'
         and p.employer is not distinct from v_data ->> 'employer'
         and p.marital is not distinct from v_data ->> 'marital'
         and p.diet is not distinct from v_data ->> 'diet'
         and p.height is not distinct from (v_data ->> 'height')::integer
         and p.native is not distinct from v_data ->> 'native'
    ),
    'a profile carries what was studied, the work, and the other answers from its latest biodata');
  reset role;

  raise notice 'admin profile filter assertions passed';
end
$$;
