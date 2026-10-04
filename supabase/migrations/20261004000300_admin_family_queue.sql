-- ---------------------------------------------------------------------------
-- One admin list for every family, whatever stage it is at.
--
-- The console had two queues: registrations (the identity check) and biodata,
-- the second behind a tile of its own. An admin looking a family up found it
-- in the first list marked "Approved" while the family's own screen said its
-- biodata was waiting for review, and nothing connected the two. The first
-- list also stopped at 25 rows, so "All" never showed everyone.
--
-- app.family_stages() names each family's stage across both reviews, in the
-- order a family moves through them, so a family is always in exactly one:
--
--   not_sent           registration not sent yet (draft or withdrawn)
--   identity_review    registration waiting for an admin
--   identity_fix       registration sent back to the family to fix
--   identity_rejected  registration refused
--   biodata_pending    identity verified, biodata not sent yet
--   biodata_review     biodata waiting for an admin (also after an edit to a
--                      live profile, which stays live meanwhile)
--   biodata_fix        biodata sent back to the family to fix
--   biodata_rejected   biodata refused
--   live               published and in the directory
--   hidden             approved, but paused, matched, or every operator off
--
-- Admin work comes first in every ordering: the oldest identity check against
-- its 24-hour target, with biodata reviews slotted in by the same yardstick.
-- ---------------------------------------------------------------------------

create or replace function app.family_stages()
returns table (
  candidate_id          uuid,
  public_code           text,
  full_name             text,
  full_name_norm        text,
  city                  text,
  operator_phone        text,
  relationship          public.relationship,
  stage                 text,
  application_id        uuid,
  application_status    public.application_status,
  submitted_at          timestamptz,
  review_due_at         timestamptz,
  overdue               boolean,
  resubmit_count        integer,
  has_certificate       boolean,
  open_duplicates       bigint,
  revision_id           uuid,
  revision_status       public.revision_status,
  revision_submitted_at timestamptz,
  published_revision_id uuid,
  sort_due              timestamptz,
  last_change           timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select
      c.id, c.public_code, c.full_name, c.full_name_norm, c.city, c.identity_status,
      c.discoverable, c.published_revision_id, c.created_at as candidate_created,
      a.phone, ra.operator_relationship,
      ra.id as application_id, ra.status as app_status, ra.submitted_at, ra.review_due_at,
      ra.resubmit_count, ra.updated_at as app_updated,
      r.id as revision_id, r.status as rev_status, r.submitted_at as rev_submitted,
      r.updated_at as rev_updated
    from public.candidates c
    left join public.registration_applications ra on ra.candidate_id = c.id
    left join public.accounts a on a.id = ra.account_id
    left join lateral (
      select r.id, r.status, r.submitted_at, r.updated_at
        from public.biodata_revisions r
       where r.candidate_id = c.id
       order by r.version desc
       limit 1
    ) r on true
    where c.deleted_at is null
  ),
  staged as (
    select b.*,
      case
        when b.app_status in ('submitted', 'under_review') then 'identity_review'
        when b.app_status = 'correction_requested' then 'identity_fix'
        when b.app_status = 'rejected' then 'identity_rejected'
        when b.app_status is distinct from 'approved' or b.identity_status <> 'verified' then 'not_sent'
        when b.rev_status in ('submitted', 'under_review') then 'biodata_review'
        when b.rev_status = 'correction_requested' then 'biodata_fix'
        when b.rev_status = 'rejected' then 'biodata_rejected'
        when b.discoverable then 'live'
        when b.published_revision_id is not null then 'hidden'
        else 'biodata_pending'
      end as stage
    from base b
  )
  select
    s.id, s.public_code, s.full_name, s.full_name_norm, s.city, s.phone, s.operator_relationship,
    s.stage, s.application_id, s.app_status, s.submitted_at, s.review_due_at,
    s.stage = 'identity_review' and s.review_due_at < now(),
    s.resubmit_count,
    exists (select 1 from public.application_documents d
             where d.application_id = s.application_id and d.kind = 'birth_certificate'
               and d.deleted_at is null),
    (select count(*) from public.duplicate_candidates dc
      where dc.application_id = s.application_id and dc.status = 'open'),
    s.revision_id, s.rev_status, s.rev_submitted, s.published_revision_id,
    case s.stage
      when 'identity_review' then s.review_due_at
      when 'biodata_review' then s.rev_submitted + interval '24 hours'
    end,
    greatest(s.app_updated, s.rev_updated, s.candidate_created)
  from staged s
$$;

revoke execute on function app.family_stages() from public, anon, authenticated;

create or replace function public.admin_family_queue(
  p_filter text default 'review',
  p_query  text default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  candidate_id          uuid,
  public_code           text,
  full_name             text,
  city                  text,
  relationship          public.relationship,
  stage                 text,
  application_id        uuid,
  application_status    public.application_status,
  submitted_at          timestamptz,
  review_due_at         timestamptz,
  overdue               boolean,
  resubmit_count        integer,
  has_certificate       boolean,
  open_duplicates       bigint,
  revision_id           uuid,
  revision_status       public.revision_status,
  revision_submitted_at timestamptz,
  published_revision_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_staff();

  return query
  select
    f.candidate_id, f.public_code, f.full_name, f.city, f.relationship, f.stage,
    f.application_id, f.application_status, f.submitted_at, f.review_due_at, f.overdue,
    f.resubmit_count, f.has_certificate, f.open_duplicates,
    f.revision_id, f.revision_status, f.revision_submitted_at, f.published_revision_id
  from app.family_stages() f
  where case coalesce(p_filter, 'review')
          when 'review'  then f.stage in ('identity_review', 'biodata_review')
          when 'overdue' then f.overdue
          when 'family'  then f.stage in ('not_sent', 'identity_fix', 'biodata_pending', 'biodata_fix')
          when 'live'    then f.stage = 'live'
          else true
        end
    -- Same search as admin_registration_queue: the phone is only compared when
    -- the query has digits, or a name search would match everyone.
    and (
      p_query is null or btrim(p_query) = ''
      or f.full_name_norm like '%' || app.normalize_name(p_query) || '%'
      or f.public_code ilike '%' || btrim(p_query) || '%'
      or (regexp_replace(p_query, '\D', '', 'g') <> ''
          and f.operator_phone like '%' || regexp_replace(p_query, '\D', '', 'g') || '%')
    )
  order by
    (f.stage in ('identity_review', 'biodata_review')) desc,
    f.sort_due asc nulls last,
    f.last_change desc nulls last
  limit greatest(1, least(coalesce(p_limit, 50), 500))
  offset greatest(0, coalesce(p_offset, 0));
end
$$;

create or replace function public.admin_family_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_staff();

  return (
    select jsonb_build_object(
      'review',  count(*) filter (where f.stage in ('identity_review', 'biodata_review')),
      'overdue', count(*) filter (where f.overdue),
      'family',  count(*) filter (where f.stage in ('not_sent', 'identity_fix', 'biodata_pending', 'biodata_fix')),
      'live',    count(*) filter (where f.stage = 'live'),
      'all',     count(*),
      'duplicates_open', (select count(*) from public.duplicate_candidates where status = 'open')
    )
    from app.family_stages() f
  );
end
$$;

revoke execute on function public.admin_family_queue(text, text, integer, integer) from public, anon;
revoke execute on function public.admin_family_counts() from public, anon;
grant execute on function public.admin_family_queue(text, text, integer, integer) to authenticated, service_role;
grant execute on function public.admin_family_counts() to authenticated, service_role;
