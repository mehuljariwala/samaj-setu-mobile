-- A name search matched everyone. The phone clause strips non-digits from the
-- query, and for "Rohan" that leaves '', so `phone like '%%'` was true for
-- every row. The phone is only compared when the query has digits in it.
create or replace function public.admin_registration_queue(
  p_statuses public.application_status[] default null,
  p_query    text default null,
  p_overdue  boolean default false,
  p_limit    integer default 25,
  p_offset   integer default 0
)
returns table (
  application_id   uuid,
  candidate_id     uuid,
  public_code      text,
  full_name        text,
  date_of_birth    date,
  city             text,
  operator_phone   text,
  relationship     public.relationship,
  status           public.application_status,
  submitted_at     timestamptz,
  review_due_at    timestamptz,
  overdue          boolean,
  resubmit_count   integer,
  has_certificate  boolean,
  open_duplicates  bigint,
  claimed_by       uuid
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
    ra.id, c.id, c.public_code, c.full_name, c.date_of_birth, c.city,
    a.phone, ra.operator_relationship, ra.status, ra.submitted_at, ra.review_due_at,
    ra.review_due_at is not null
      and ra.status in ('submitted', 'under_review')
      and ra.review_due_at < now(),
    ra.resubmit_count,
    exists (select 1 from public.application_documents d
            where d.application_id = ra.id and d.kind = 'birth_certificate'
              and d.deleted_at is null),
    (select count(*) from public.duplicate_candidates dc
     where dc.application_id = ra.id and dc.status = 'open'),
    (select rc.admin_account_id from public.review_claims rc
     where rc.subject_type = 'registration' and rc.subject_id = ra.id and rc.expires_at > now())
  from public.registration_applications ra
  join public.candidates c on c.id = ra.candidate_id
  join public.accounts a on a.id = ra.account_id
  where (p_statuses is null or ra.status = any (p_statuses))
    and (not p_overdue or (ra.review_due_at < now()
                           and ra.status in ('submitted', 'under_review')))
    and (
      p_query is null or btrim(p_query) = ''
      or c.full_name_norm like '%' || app.normalize_name(p_query) || '%'
      or c.public_code ilike '%' || btrim(p_query) || '%'
      or (regexp_replace(p_query, '\D', '', 'g') <> ''
          and a.phone like '%' || regexp_replace(p_query, '\D', '', 'g') || '%')
    )
  order by
    -- Overdue first, then closest to the target. Spec §10's dashboard ordering.
    (ra.review_due_at < now()) desc nulls last,
    ra.review_due_at asc nulls last,
    ra.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
end
$$;

