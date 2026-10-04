-- ---------------------------------------------------------------------------
-- An approved biodata is published at once. The separate consent step is gone.
--
-- Publication used to need two things: an admin's approval and the
-- candidate's own consent, given from the candidate's own account. In practice
-- most profiles are run by a parent, who could not give it, so approved
-- profiles sat invisible with no way forward for the family — 32 of them when
-- this changed, 22 with no candidate account at all. The samaj decided that
-- the admin's approval is enough: the family asked for the profile to be
-- published by sending the biodata, and an admin has checked it.
--
-- So the consent condition comes out of the two places that decided
-- visibility, and every approved profile that was waiting on it is published
-- now. A family that wants to stay out of the directory still pauses the
-- profile, which hides it immediately, exactly as before.
--
-- The consent ledger and its functions stay: the rows are history, and
-- removing them would rewrite what was true when those profiles were shown.
-- ---------------------------------------------------------------------------

create or replace function app.apply_publication_state(p_candidate_id uuid)
returns public.publication_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates;
  v_next      public.publication_status;
begin
  select * into v_candidate from public.candidates where id = p_candidate_id for update;
  if v_candidate.id is null then
    raise exception 'not_found: no such candidate' using errcode = 'P0002';
  end if;

  -- A revision under review, a correction outstanding or a rejection all own
  -- the status; publication is not in question yet.
  if v_candidate.publication_status in ('not_started', 'draft', 'in_review',
                                        'correction_requested', 'rejected') then
    return v_candidate.publication_status;
  end if;

  v_next := case
    when v_candidate.identity_status <> 'verified' then 'unpublished'
    when v_candidate.published_revision_id is null then 'unpublished'
    else 'published'
  end;

  if v_next is distinct from v_candidate.publication_status then
    update public.candidates set publication_status = v_next where id = p_candidate_id;
  else
    -- Still touch the row so the discoverability trigger re-evaluates: pause
    -- and match-found change the answer without changing status.
    update public.candidates set updated_at = now() where id = p_candidate_id;
  end if;

  return v_next;
end
$$;

-- Same as 20260929000200, less the consent condition.
create or replace function app.set_candidate_discoverability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.discoverable :=
        new.identity_status = 'verified'
    and new.publication_status = 'published'
    and new.published_revision_id is not null
    and not new.paused
    and new.match_found_at is null
    and new.deleted_at is null
    and exists (
      select 1
      from public.candidate_memberships m
      join public.accounts a on a.id = m.account_id
      where m.candidate_id = new.id
        and m.revoked_at is null
        and a.status = 'active'
    );

  return new;
end
$$;

-- Everything approved and waiting on consent goes live now.
do $$
declare
  v_candidate uuid;
begin
  for v_candidate in
    select id from public.candidates
     where identity_status = 'verified'
       and published_revision_id is not null
       and publication_status in ('published', 'unpublished')
       and deleted_at is null
  loop
    perform app.apply_publication_state(v_candidate);
  end loop;
end
$$;
