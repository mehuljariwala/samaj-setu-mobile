-- ---------------------------------------------------------------------------
-- સનાતન દીકરા-દીકરીઓ: sons from other Hindu castes as well as daughters.
--
-- The samaj asked on 2026-10-21 for "અન્ય હિન્દુ જ્ઞાતિની દીકરીઓ, દીકરાઓ"
-- (M/F). Everything 20261004000700 built for a Sanatan daughter applies to a
-- son unchanged: the same box at registration, the same questions (caste,
-- village or town, state, parents' details, address), no shared-mosal check
-- for a pair with one in it, and not shown to a family that asked for the same
-- sub-community. Opposite-gender matching decides the rest, so a Sanatan son
-- is shown to the girls.
--
-- What changes is only the three places that refused a boy: ticking the box,
-- a family changing the gender after approval, and an admin moving a profile
-- between the boys and the girls. Each function below is the latest one, with
-- that refusal taken out and nothing else changed.
-- ---------------------------------------------------------------------------

comment on column public.candidates.is_sanatan is
  'A son or daughter from another Hindu caste, outside the Khatri samaj (સનાતન). Ticked at registration.';

update public.biodata_fields
   set options = '[{"value":"samaj","gu":"ખત્રી સમાજ","en":"Khatri samaj"},{"value":"sanatan","gu":"સનાતન (અન્ય હિન્દુ જ્ઞાતિ)","en":"Sanatan (another Hindu caste)"}]'
 where key = 'origin';

-- ------------------------------------------------------ ticking the box ----
-- Same as 20261004000700, without the daughters-only check.
create or replace function public.set_sanatan(p_candidate_id uuid, p_sanatan boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_operator(p_candidate_id);

  if not exists (select 1 from public.registration_applications
                  where candidate_id = p_candidate_id and status in ('draft', 'correction_requested')) then
    raise exception 'conflict: this can only change while the registration is being prepared'
      using errcode = 'P0001';
  end if;

  update public.candidates set is_sanatan = coalesce(p_sanatan, false) where id = p_candidate_id;

  update public.biodata_revisions set data = data
   where candidate_id = p_candidate_id and status in ('draft', 'correction_requested');
end
$$;

-- ----------------------------------------------- registration details ------
-- Same as 20261005000100, without the refusal to make a Sanatan profile male.
create or replace function public.propose_detail_changes(
  p_candidate_id  uuid,
  p_full_name     text default null,
  p_date_of_birth date default null,
  p_gender        public.gender default null,
  p_father_name   text default null,
  p_city          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates;
  v_rev       public.biodata_revisions;
  v_wanted    jsonb;
  v_changes   jsonb;
  v_gender    public.gender;
begin
  perform app.require_operator(p_candidate_id);

  select * into v_candidate from public.candidates where id = p_candidate_id and deleted_at is null;
  if v_candidate.id is null then
    raise exception 'not_found: no such candidate' using errcode = 'P0002';
  end if;

  if v_candidate.identity_status <> 'verified' then
    raise exception 'conflict: until the registration is approved, change these on the registration'
      using errcode = 'P0001';
  end if;

  if p_full_name is not null and length(btrim(p_full_name)) not between 2 and 160 then
    raise exception 'invalid: full_name must be 2 to 160 characters' using errcode = 'P0001';
  end if;
  if p_father_name is not null and length(btrim(p_father_name)) not between 2 and 160 then
    raise exception 'invalid: father_name must be 2 to 160 characters' using errcode = 'P0001';
  end if;
  if p_city is not null and length(btrim(p_city)) not between 2 and 80 then
    raise exception 'invalid: city must be 2 to 80 characters' using errcode = 'P0001';
  end if;
  if p_date_of_birth is not null
     and (p_date_of_birth <= date '1900-01-01'
          or p_date_of_birth > (current_date - interval '18 years')::date) then
    raise exception 'invalid: date_of_birth must make the candidate at least 18' using errcode = 'P0001';
  end if;

  -- Refuses while a version is with an admin.
  v_rev := app.open_revision(p_candidate_id, 'guided');

  v_wanted := v_rev.detail_changes || jsonb_strip_nulls(jsonb_build_object(
    'full_name',     nullif(btrim(p_full_name), ''),
    'date_of_birth', p_date_of_birth,
    'gender',        p_gender,
    'father_name',   nullif(btrim(p_father_name), ''),
    'city',          nullif(btrim(p_city), '')
  ));

  select coalesce(jsonb_object_agg(w.key, w.value), '{}'::jsonb) into v_changes
    from jsonb_each_text(v_wanted) w
   where w.value is distinct from case w.key
           when 'full_name'     then v_candidate.full_name
           when 'date_of_birth' then v_candidate.date_of_birth::text
           when 'gender'        then v_candidate.gender::text
           when 'father_name'   then v_candidate.father_name
           when 'city'          then v_candidate.city
         end;

  v_gender := coalesce((v_changes ->> 'gender')::public.gender, v_candidate.gender);

  update public.biodata_revisions
     set detail_changes = v_changes,
         data = data || jsonb_build_object('gender', v_gender::text)
   where id = v_rev.id
   returning * into v_rev;

  return jsonb_build_object('revision_id', v_rev.id, 'detail_changes', v_rev.detail_changes);
end
$$;

-- ------------------------------------------------ an admin moves gender ----
-- Same as 20261007000100, without the refusal to move a Sanatan profile to
-- the boys.
create or replace function public.admin_set_gender(p_candidate_id uuid, p_gender public.gender)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates;
  v_withdrawn integer;
begin
  perform app.require_admin();

  if p_gender is null then
    raise exception 'invalid: choose male or female' using errcode = 'P0001';
  end if;

  select * into v_candidate from public.candidates
   where id = p_candidate_id and deleted_at is null
   for update;
  if v_candidate.id is null then
    raise exception 'not_found: no such candidate' using errcode = 'P0002';
  end if;

  if v_candidate.gender = p_gender then
    return jsonb_build_object('gender', p_gender, 'withdrawn_interests', 0);
  end if;

  update public.candidates set gender = p_gender where id = p_candidate_id;

  -- Superseded and rejected versions are history and stay as they were. A
  -- gender change the family asked for with an open version is settled by
  -- this one.
  update public.biodata_revisions
     set data = data || jsonb_build_object('gender', p_gender::text),
         detail_changes = detail_changes - 'gender'
   where candidate_id = p_candidate_id
     and status not in ('superseded', 'rejected')
     and (data ->> 'gender' is distinct from p_gender::text or detail_changes ? 'gender');

  update public.candidate_memberships
     set relationship = case relationship
           when 'daughter' then 'son' when 'son' then 'daughter'
           when 'sister' then 'brother' when 'brother' then 'sister'
         end::public.relationship
   where candidate_id = p_candidate_id
     and relationship in (case p_gender when 'male' then 'daughter' else 'son' end::public.relationship,
                          case p_gender when 'male' then 'sister' else 'brother' end::public.relationship);

  update public.registration_applications
     set operator_relationship = case operator_relationship
           when 'daughter' then 'son' when 'son' then 'daughter'
           when 'sister' then 'brother' when 'brother' then 'sister'
         end::public.relationship
   where candidate_id = p_candidate_id
     and operator_relationship in (case p_gender when 'male' then 'daughter' else 'son' end::public.relationship,
                                   case p_gender when 'male' then 'sister' else 'brother' end::public.relationship);

  with withdrawn as (
    update public.interests i
       set status = 'withdrawn', withdrawn_at = now()
     where i.status = 'pending'
       and p_candidate_id in (i.from_candidate_id, i.to_candidate_id)
       and exists (
         select 1 from public.candidates other
          where other.id = case when i.from_candidate_id = p_candidate_id
                                then i.to_candidate_id else i.from_candidate_id end
            and other.gender = p_gender
       )
    returning 1
  )
  select count(*) into v_withdrawn from withdrawn;

  return jsonb_build_object('gender', p_gender, 'withdrawn_interests', v_withdrawn);
end
$$;
