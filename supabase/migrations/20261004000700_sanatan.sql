-- ---------------------------------------------------------------------------
-- સનાતન દીકરીઓ: daughters from outside the Khatri samaj.
--
-- The samaj also introduces girls from other Hindu castes. They register the
-- same way and are approved the same way (one approval), but their biodata
-- asks different things: their caste, village or town and state, the
-- mother's name, the father's occupation and mobile number, and the address —
-- and not the Khatri sub-community or mosal, which do not describe them.
--
--   candidates.is_sanatan     the source of truth, ticked at registration
--   biodata data ->> origin   a copy stamped on every revision write, so the
--                             catalogue's validation can tell which fields a
--                             biodata must have without a candidate to look up
--   biodata_fields.required_for  'all', 'samaj' or 'sanatan': whom `required`
--                             applies to
--
-- The Khatri community rules meet them where they make sense: the shared-mosal
-- rule does not apply to a pair with a Sanatan daughter in it (she has no
-- Khatri mosal to share), and a family that asked for the same sub-community
-- is not shown them. The father's mobile and the address are for admins:
-- they never reach the directory copy other families read.
-- ---------------------------------------------------------------------------

alter table public.candidates add column is_sanatan boolean not null default false;

comment on column public.candidates.is_sanatan is
  'A daughter from outside the Khatri samaj (સનાતન દીકરી). Ticked at registration.';

-- ------------------------------------------------------------- catalogue ---
alter table public.biodata_fields
  add column required_for text not null default 'all'
  check (required_for in ('all', 'samaj', 'sanatan'));

update public.biodata_fields set required_for = 'samaj' where key in ('community', 'mosal', 'surname');
update public.biodata_fields set required = true, required_for = 'sanatan' where key = 'mother';

insert into public.biodata_fields
  (key, section, ordinal, label_gu, label_en, required, required_for, value_type, options)
values
  ('origin',      'meta',      1, 'પ્રોફાઇલ પ્રકાર', 'Profile type', false, 'all', 'enum',
   '[{"value":"samaj","gu":"ખત્રી સમાજ","en":"Khatri samaj"},{"value":"sanatan","gu":"સનાતન દીકરી","en":"Sanatan daughter"}]'),
  ('caste',       'community', 5, 'કઈ જ્ઞાતિ', 'Caste', true, 'sanatan', 'text', '[]'),
  ('hometown',    'family',    6, 'ગામ / શહેર', 'Village or town', true, 'sanatan', 'text', '[]'),
  ('state',       'family',    7, 'રાજ્ય', 'State', true, 'sanatan', 'text', '[]'),
  ('fatherWork',  'family',    8, 'પિતાનો વ્યવસાય', 'Father''s occupation', true, 'sanatan', 'text', '[]'),
  ('fatherPhone', 'contact',   4, 'પિતાનો મોબાઇલ નંબર', 'Father''s mobile number', true, 'sanatan', 'phone', '[]'),
  ('address',     'contact',   5, 'સરનામું', 'Address', true, 'sanatan', 'text', '[]');

-- ----------------------------------------------- whom `required` binds -----
-- Same as 20260914000400 except the required check, which now asks whom the
-- field is required for. A biodata without an origin is a samaj biodata.
create or replace function app.validate_biodata(p_data jsonb, p_require_complete boolean default false)
returns table (field_key text, problem text)
language sql
stable
security definer
set search_path = ''
as $$
  with supplied as (
    select key, btrim(coalesce(value #>> '{}', '')) as val
    from jsonb_each(coalesce(p_data, '{}'::jsonb))
  ),
  audience as (
    select case when coalesce(p_data ->> 'origin', '') = 'sanatan' then 'sanatan' else 'samaj' end as who
  )
  select s.key, 'unknown_field'
  from supplied s
  where not exists (select 1 from public.biodata_fields f where f.key = s.key)

  union all
  select f.key, 'required'
  from public.biodata_fields f, audience a
  where p_require_complete
    and f.required
    and f.required_for in ('all', a.who)
    and coalesce((select val from supplied s where s.key = f.key), '') = ''

  union all
  select f.key, 'not_an_option'
  from public.biodata_fields f
  join supplied s on s.key = f.key
  where f.value_type = 'enum' and s.val <> ''
    and not exists (
      select 1 from jsonb_array_elements(f.options) o where o ->> 'value' = s.val
    )

  union all
  select f.key, 'out_of_range'
  from public.biodata_fields f
  join supplied s on s.key = f.key
  where f.value_type = 'number' and s.val <> ''
    and (s.val !~ '^-?[0-9]+$'
         or s.val::integer < coalesce(f.min_value, 0)
         or s.val::integer > coalesce(f.max_value, 2147483647))

  union all
  select f.key, 'not_a_time'
  from public.biodata_fields f
  join supplied s on s.key = f.key
  where f.value_type = 'time' and s.val <> ''
    and s.val !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'

  union all
  select f.key, 'not_a_phone'
  from public.biodata_fields f
  join supplied s on s.key = f.key
  where f.value_type = 'phone' and s.val <> ''
    and s.val !~ '^[6-9][0-9]{9}$'

  union all
  select f.key, 'too_long'
  from public.biodata_fields f
  join supplied s on s.key = f.key
  where f.value_type = 'text' and length(s.val) > 200
$$;

create or replace function app.biodata_completion(p_data jsonb)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    round(
      100.0 * count(*) filter (
        where btrim(coalesce(p_data #>> array[f.key], '')) <> ''
      ) / nullif(count(*), 0)
    )::integer,
    0
  )
  from public.biodata_fields f
  where f.required
    and f.required_for in ('all', case when coalesce(p_data ->> 'origin', '') = 'sanatan' then 'sanatan' else 'samaj' end)
$$;

-- ------------------------------------------------- the origin, stamped -----
-- Named to fire before biodata_revisions_validate (triggers run in name
-- order), so completion and validation see the origin.
create or replace function app.stamp_biodata_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.data := coalesce(new.data, '{}'::jsonb) || jsonb_build_object(
    'origin',
    case when exists (select 1 from public.candidates where id = new.candidate_id and is_sanatan)
         then 'sanatan' else 'samaj' end
  );
  return new;
end
$$;

create trigger biodata_revisions_00_origin
  before insert or update on public.biodata_revisions
  for each row execute function app.stamp_biodata_origin();

-- ------------------------------------------------------ ticking the box ----
-- While the registration is being prepared or fixed. A Sanatan daughter is a
-- girl; the open biodata is re-stamped so its required fields follow.
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

  if coalesce(p_sanatan, false)
     and exists (select 1 from public.candidates where id = p_candidate_id and gender <> 'female') then
    raise exception 'invalid: only a daughter can be registered as a Sanatan daughter' using errcode = 'P0001';
  end if;

  update public.candidates set is_sanatan = coalesce(p_sanatan, false) where id = p_candidate_id;

  update public.biodata_revisions set data = data
   where candidate_id = p_candidate_id and status in ('draft', 'correction_requested');
end
$$;

revoke execute on function public.set_sanatan(uuid, boolean) from public, anon;
grant execute on function public.set_sanatan(uuid, boolean) to authenticated, service_role;

-- -------------------------------------------- never in the directory ------
-- Same as 20260914001100, with the father's mobile and the address removed
-- from the biodata other families read, like the contact number already is.
create or replace view public.directory_profiles
with (security_invoker = true) as
select
  c.id,
  c.public_code,
  c.full_name,
  c.full_name_norm as full_name_search,
  c.gender,
  c.city,
  c.native_place,
  extract(year from age(c.date_of_birth))::integer as age,
  cc.sub_community,
  cc.sect,
  cc.paternal_surname,
  cc.mosal_family,
  cc.confirmed_at is not null as community_confirmed,
  (r.data - 'phone' - 'extraPhone' - 'contactKind' - 'fatherPhone' - 'address') as biodata,
  r.completion,
  c.published_revision_id as revision_id,
  p.photo_visibility,
  p.kundali_visibility,
  c.updated_at
from public.candidates c
join public.biodata_revisions r on r.id = c.published_revision_id
join public.candidate_privacy p on p.candidate_id = c.id
left join public.candidate_community cc on cc.candidate_id = c.id
where c.discoverable;

-- --------------------------------------------------- community rules ------
-- Same as 20260914001100, except for Sanatan daughters: no shared-mosal check
-- for a pair that includes one, and a same-sub-community preference excludes
-- them rather than waiting on a sub-community they will never have.
create or replace function app.eligibility(p_viewer uuid, p_target uuid)
returns public.eligibility_verdict
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer      public.candidates;
  v_target      public.candidates;
  v_viewer_cc   public.candidate_community;
  v_target_cc   public.candidate_community;
  v_prefs       public.family_preferences;
  v_rule_mosal  boolean;
  v_rule_gender boolean;
  v_incomplete  boolean := false;
begin
  if p_viewer is null or p_target is null then
    return 'insufficient_information';
  end if;

  if p_viewer = p_target then
    return 'excluded_self';
  end if;

  select * into v_viewer from public.candidates where id = p_viewer;
  select * into v_target from public.candidates where id = p_target;

  if v_viewer.id is null or v_target.id is null then
    return 'not_discoverable';
  end if;

  if exists (
    select 1
    from public.candidate_memberships a
    join public.candidate_memberships b on b.account_id = a.account_id
    where a.candidate_id = p_viewer and a.revoked_at is null
      and b.candidate_id = p_target and b.revoked_at is null
  ) then
    return 'excluded_same_household';
  end if;

  if exists (
    select 1 from public.candidate_blocks
    where (blocker_candidate_id = p_viewer and blocked_candidate_id = p_target)
       or (blocker_candidate_id = p_target and blocked_candidate_id = p_viewer)
  ) then
    return 'excluded_blocked';
  end if;

  select enabled into v_rule_gender from public.community_rules where code = 'opposite_gender';
  if coalesce(v_rule_gender, false) and v_viewer.gender = v_target.gender then
    return 'excluded_gender';
  end if;

  select * into v_viewer_cc from public.candidate_community where candidate_id = p_viewer;
  select * into v_target_cc from public.candidate_community where candidate_id = p_target;

  -- ------------------------------------------------ universal: shared mosal
  select enabled into v_rule_mosal from public.community_rules where code = 'shared_mosal';
  if coalesce(v_rule_mosal, false) and not (v_viewer.is_sanatan or v_target.is_sanatan) then
    if v_viewer_cc.mosal_family_norm is null
       or v_target_cc.mosal_family_norm is null
       or v_viewer_cc.confirmed_at is null
       or v_target_cc.confirmed_at is null then
      v_incomplete := true;
    elsif v_viewer_cc.mosal_family_norm = v_target_cc.mosal_family_norm then
      return 'excluded_shared_mosal';
    end if;
  end if;

  -- --------------------------------------------- family preferences (viewer)
  select * into v_prefs from public.family_preferences where candidate_id = p_viewer;

  if coalesce(v_prefs.require_same_sub_community, false) then
    if v_viewer.is_sanatan or v_target.is_sanatan then
      return 'excluded_sub_community';
    elsif v_viewer_cc.sub_community is null or v_target_cc.sub_community is null then
      v_incomplete := true;
    elsif v_viewer_cc.sub_community <> v_target_cc.sub_community then
      return 'excluded_sub_community';
    end if;
  end if;

  if coalesce(v_prefs.require_same_sect, false) then
    if v_viewer_cc.sect is null or v_target_cc.sect is null then
      v_incomplete := true;
    elsif v_viewer_cc.sect <> v_target_cc.sect then
      return 'excluded_sect';
    end if;
  end if;

  if not v_target.discoverable then
    return 'not_discoverable';
  end if;

  if v_incomplete then
    return 'insufficient_information';
  end if;

  return 'eligible';
end
$$;

-- --------------------------------------------- profiles, with the flag ----
-- Same as 20261004000500, plus is_sanatan, for User management's three tabs.
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
                   where d.application_id = f.application_id and d.kind = 'identity_back' and d.deleted_at is null)
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
