-- ---------------------------------------------------------------------------
-- An admin moves a profile between Boys and Girls.
--
-- A boy who tapped "Female" at registration (or a girl who tapped "Male") sat
-- in the wrong group with no way out. The family cannot change the gender
-- once the registration is sent, and all an admin could do was switch the
-- account off, which hid the profile from families but left it in the admin's
-- list under the wrong group, and locked the family out. On 2026-10-07 three
-- boys were switched off this way. Now an admin moves the profile instead:
--
--   the candidate's gender       changed; the audit trigger records who did it
--   the biodata's gender         follows, on the published version and on any
--                                version still open or with an admin
--   son / daughter, brother /    follows too, where a parent picked the wrong
--   sister                       one
--   pending interests            withdrawn where both sides would now be the
--                                same gender, which the rules do not allow
--
-- A Sanatan daughter is a girl from outside the samaj, so she is not moved to
-- the boys this way: her biodata asks questions a boy's does not.
-- ---------------------------------------------------------------------------

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

  if p_gender = 'male' and v_candidate.is_sanatan then
    raise exception 'invalid: a Sanatan daughter cannot be moved to the boys' using errcode = 'P0001';
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

revoke execute on function public.admin_set_gender(uuid, public.gender) from public, anon;
grant execute on function public.admin_set_gender(uuid, public.gender) to authenticated, service_role;
