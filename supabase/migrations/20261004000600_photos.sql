-- ---------------------------------------------------------------------------
-- Photos: required to send, approved with the profile, and open to members.
--
-- Every upload starts as pending_review, and only approved media is shown to
-- anyone but the family. candidate_media says media "is reviewed alongside
-- the biodata revision it belongs to", but nothing ever did that review: when
-- this changed, all 70 photos and 62 janmakshar on the platform were still
-- pending, so no photo had ever been seen by another family, even one the
-- family had said yes to.
--
-- Now, in step with the one-approval change (20261004000400):
--   * approving a biodata — on its own or with the registration — approves
--     the profile's waiting photos and janmakshar; the admin sees the photos
--     on the approval page before deciding;
--   * a photo added to a profile that is already approved is approved at
--     once, rather than waiting on a second review;
--   * a biodata cannot be sent without a profile photo, which also covers
--     sending a registration, because that sends the biodata with it;
--   * photos are open to approved members by default. A family that wants
--     otherwise still chooses "on request" or "private" in its privacy
--     settings. Profiles left on the old default move to the new one; the
--     few who chose "members" themselves are unchanged.
-- ---------------------------------------------------------------------------

-- --------------------------------------------- approved with the biodata ---
create or replace function app.approve_media_with_biodata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.candidate_media
       set status = 'approved'
     where candidate_id = new.candidate_id
       and status = 'pending_review'
       and deleted_at is null;
  end if;
  return new;
end
$$;

create trigger biodata_approval_approves_media
  after update of status on public.biodata_revisions
  for each row execute function app.approve_media_with_biodata();

-- --------------------------------------- added after approval: no wait -----
-- An AFTER trigger, because the insert policy only admits pending_review rows
-- and a BEFORE trigger's change would be checked against it.
create or replace function app.approve_media_of_approved_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending_review'
     and exists (select 1 from public.candidates
                  where id = new.candidate_id and published_revision_id is not null) then
    update public.candidate_media set status = 'approved' where id = new.id;
  end if;
  return null;
end
$$;

create trigger media_of_approved_profile_is_approved
  after insert on public.candidate_media
  for each row execute function app.approve_media_of_approved_profile();

-- ------------------------------------------------- a photo to send ---------
create or replace function app.require_photo_to_send()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted'
     and not exists (
       select 1 from public.candidate_media m
        where m.candidate_id = new.candidate_id and m.kind = 'photo'
          and m.deleted_at is null and m.status <> 'rejected'
     ) then
    raise exception 'incomplete: photo' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger biodata_needs_a_photo_to_send
  before update of status on public.biodata_revisions
  for each row execute function app.require_photo_to_send();

-- ---------------------------------------------------- open to members ------
alter table public.candidate_privacy alter column photo_visibility set default 'members';

update public.candidate_privacy set photo_visibility = 'members' where photo_visibility = 'on_request';

-- ------------------------------------------------------------- backfill ----
-- Profiles already approved have their waiting media approved now.
update public.candidate_media m
   set status = 'approved'
 where m.status = 'pending_review'
   and m.deleted_at is null
   and exists (select 1 from public.candidates c
                where c.id = m.candidate_id and c.published_revision_id is not null);

-- ------------------------------------------------ a photo on every card ----
-- The first approved photo of each listed candidate that the caller may see,
-- for Discover's cards. Visibility is app.can_view_media_of, the same rule
-- the storage policy applies, evaluated for the signed-in caller.
create or replace function public.discover_photos(p_candidates uuid[])
returns table (candidate_id uuid, bucket_id text, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (m.candidate_id) m.candidate_id, m.bucket_id, m.storage_path
    from public.candidate_media m
   where m.candidate_id = any (p_candidates)
     and m.kind = 'photo' and m.status = 'approved' and m.deleted_at is null
     and app.can_view_media_of(m.candidate_id, 'photo')
   order by m.candidate_id, m.is_primary desc, m.sort_order, m.created_at
$$;

revoke execute on function public.discover_photos(uuid[]) from public, anon;
grant execute on function public.discover_photos(uuid[]) to authenticated, service_role;
