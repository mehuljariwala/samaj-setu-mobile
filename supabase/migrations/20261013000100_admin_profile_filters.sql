-- ---------------------------------------------------------------------------
-- More filters for User management's profiles: birth year, what a candidate
-- studied, what they do for work, and the other biodata answers an admin
-- sorts families by.
--
-- admin_profiles() now also returns those answers, from the profile's latest
-- biodata (the one sent or being filled in), so the screen can filter by them
-- in the browser along with its other filters. Only short answers travel:
-- about a fifth of a kilobyte more per profile, once per visit to the screen.
-- ---------------------------------------------------------------------------

drop function public.admin_profiles(text);

create function public.admin_profiles(p_query text default null)
returns table (
  candidate_id          uuid,
  public_code           text,
  full_name             text,
  gender                public.gender,
  is_sanatan            boolean,
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
  documents_complete    boolean,
  birth_year            integer,
  sect                  text,
  education             text,
  degree                text,
  work                  text,
  role                  text,
  employer              text,
  marital               text,
  diet                  text,
  height                integer,
  mangal                text,
  native                text
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
    f.candidate_id, f.public_code, f.full_name, c.gender, c.is_sanatan,
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
                   where d.application_id = f.application_id and d.kind = 'identity_back' and d.deleted_at is null),
    extract(year from c.date_of_birth)::integer,
    coalesce(cc.sect, nullif(r.data ->> 'sect', '')),
    nullif(r.data ->> 'education', ''),
    nullif(btrim(r.data ->> 'degree'), ''),
    nullif(r.data ->> 'work', ''),
    nullif(btrim(r.data ->> 'role'), ''),
    nullif(btrim(r.data ->> 'employer'), ''),
    nullif(r.data ->> 'marital', ''),
    nullif(r.data ->> 'diet', ''),
    -- Stored as text; checked rather than cast, so one odd value cannot break the list.
    case when r.data ->> 'height' ~ '^\d{2,3}$' then (r.data ->> 'height')::integer end,
    nullif(r.data ->> 'mangal', ''),
    nullif(btrim(r.data ->> 'native'), '')
  from app.family_stages() f
  join public.candidates c on c.id = f.candidate_id
  left join public.candidate_community cc on cc.candidate_id = f.candidate_id
  left join public.biodata_revisions r on r.id = f.revision_id
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
