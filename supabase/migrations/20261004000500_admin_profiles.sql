-- ---------------------------------------------------------------------------
-- Every profile, for User management's boys-and-girls view.
--
-- The account list answers "who can sign in". Admins also need "who is on
-- the platform, and what is each one still missing": boys on one side, girls
-- on the other, filterable by stage, city, sub-community and age. That is a
-- list of candidates, not accounts, so it gets its own function.
--
-- One row per profile with the facts the screen filters and flags on. The
-- filtering itself happens on the page: a samaj is a few hundred profiles,
-- and keeping the filters out of SQL lets the screen count every option
-- against the same rows it shows.
-- ---------------------------------------------------------------------------

create or replace function public.admin_profiles(p_query text default null)
returns table (
  candidate_id          uuid,
  public_code           text,
  full_name             text,
  gender                public.gender,
  age                   integer,
  city                  text,
  sub_community         text,
  stage                 text,
  application_id        uuid,
  submitted_at          timestamptz,
  review_due_at         timestamptz,
  overdue               boolean,
  revision_id           uuid,
  revision_submitted_at timestamptz,
  published_revision_id uuid,
  completion            integer,
  has_photo             boolean,
  documents_complete    boolean
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
    f.candidate_id, f.public_code, f.full_name, c.gender,
    extract(year from age(c.date_of_birth))::integer,
    f.city, cc.sub_community, f.stage, f.application_id,
    f.submitted_at, f.review_due_at, f.overdue,
    f.revision_id, f.revision_submitted_at, f.published_revision_id,
    coalesce(r.completion, 0),
    exists (select 1 from public.candidate_media m
             where m.candidate_id = f.candidate_id and m.kind = 'photo'
               and m.deleted_at is null and m.status <> 'rejected'),
    f.has_certificate
      and exists (select 1 from public.application_documents d
                   where d.application_id = f.application_id and d.kind = 'identity_front' and d.deleted_at is null)
      and exists (select 1 from public.application_documents d
                   where d.application_id = f.application_id and d.kind = 'identity_back' and d.deleted_at is null)
  from app.family_stages() f
  join public.candidates c on c.id = f.candidate_id
  left join public.candidate_community cc on cc.candidate_id = f.candidate_id
  left join public.biodata_revisions r on r.id = f.revision_id
  -- Same search as the admin list: the phone is only compared when the query
  -- has digits, or a name search would match everyone.
  where p_query is null or btrim(p_query) = ''
     or f.full_name_norm like '%' || app.normalize_name(p_query) || '%'
     or f.public_code ilike '%' || btrim(p_query) || '%'
     or (regexp_replace(p_query, '\D', '', 'g') <> ''
         and f.operator_phone like '%' || regexp_replace(p_query, '\D', '', 'g') || '%')
  order by f.full_name
  limit 2000;
end
$$;

revoke execute on function public.admin_profiles(text) from public, anon;
grant execute on function public.admin_profiles(text) to authenticated, service_role;
