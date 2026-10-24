-- ---------------------------------------------------------------------------
-- An admin moves a profile between the Khatri samaj and Sanatan.
--
-- On 2026-10-24 two Khatri boys (SS-1350, SS-1352) were found under Sanatan:
-- the box had been ticked at registration, and a family can change it only
-- until the registration is sent. As with a profile in the wrong gender
-- (20261007000100), an admin now moves it:
--
--   the candidate      is_sanatan changes; the audit trigger records who
--   the biodata        re-stamped Khatri samaj or Sanatan on the published
--                      version and on any open or waiting one, so its
--                      questions and its label follow. Superseded and
--                      rejected versions are history and keep theirs.
--
-- What a move cannot supply is what the other kind of biodata asks and this
-- one never did. A Sanatan biodata has no sub-community, paternal surname or
-- mosal, and until the family adds them the mosal rule cannot be checked, so
-- the profile can be browsed but not introduced (spec §7). The family is asked
-- for them the next time it sends its biodata, and an admin can add them at
-- once by opening the family's account (20261024000100). Waiting interests
-- are left to the rules to decide when someone answers them.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_sanatan(p_candidate_id uuid, p_sanatan boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates;
begin
  perform app.require_admin();

  if p_sanatan is null then
    raise exception 'invalid: choose Khatri samaj or Sanatan' using errcode = 'P0001';
  end if;

  select * into v_candidate from public.candidates
   where id = p_candidate_id and deleted_at is null
   for update;
  if v_candidate.id is null then
    raise exception 'not_found: no such candidate' using errcode = 'P0002';
  end if;

  if v_candidate.is_sanatan = p_sanatan then
    return jsonb_build_object('is_sanatan', p_sanatan);
  end if;

  update public.candidates set is_sanatan = p_sanatan where id = p_candidate_id;

  -- Any write re-stamps the origin (app.stamp_biodata_origin).
  update public.biodata_revisions set data = data
   where candidate_id = p_candidate_id
     and status not in ('superseded', 'rejected');

  return jsonb_build_object('is_sanatan', p_sanatan);
end
$$;

revoke execute on function public.admin_set_sanatan(uuid, boolean) from public, anon;
grant execute on function public.admin_set_sanatan(uuid, boolean) to authenticated, service_role;
