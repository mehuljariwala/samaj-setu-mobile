-- ---------------------------------------------------------------------------
-- What the samaj asked to add to the biodata on 2026-10-24.
--
--   children        બાળકોની સંખ્યા, asked of a divorced (છૂટાછેડા) or widowed
--                   (વિધવા / વિધુર) son or daughter, and then required. The
--                   marital status already answers the હા / ના beside each.
--   the full address  the current address in parts, typed by the family:
--                   house and building, street or area, landmark, village or
--                   city, taluka, district, state and PIN code. Landmark and
--                   taluka are optional, the rest required. The native address
--                   comes in the same parts, all optional. `address` and
--                   `nativeAddress` stay the first line of each, so what
--                   families already wrote is kept.
--   community       now called જ્ઞાતિ - પેટા સમાજ (Caste - Sub-community).
--
-- Every part stays with the admins: the directory copy other families read
-- drops them all, as it drops the two one-line addresses today.
--
-- An approved family whose live biodata has no full address is asked for it
-- at the top of every member screen (my_address_gaps), and adds it without a
-- new version or an admin's approval (save_live_address): the address is not
-- shown to other families, so there is nothing for a reviewer to check before
-- it is live. Admins still see who changed it, in the audit trail and the
-- activity log.
--
-- Two catalogue additions carry them:
--   value_type 'pincode'  six digits, the first not 0
--   asked_when.value      may now be a list as well as one value: children is
--                         asked while marital is divorced or widowed
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- catalogue ---
alter table public.biodata_fields drop constraint biodata_fields_value_type_check;
alter table public.biodata_fields add constraint biodata_fields_value_type_check
  check (value_type in ('text', 'number', 'time', 'enum', 'phone', 'date', 'pincode'));

alter table public.biodata_fields drop constraint biodata_fields_asked_when_check;
alter table public.biodata_fields add constraint biodata_fields_asked_when_check
  check (asked_when is null
         or (jsonb_typeof(asked_when -> 'key') = 'string'
             and (jsonb_typeof(asked_when -> 'value') = 'string'
                  or (jsonb_typeof(asked_when -> 'value') = 'array'
                      and jsonb_array_length(asked_when -> 'value') > 0
                      and not jsonb_path_exists(asked_when, '$.value[*] ? (@.type() != "string")')))));

comment on column public.biodata_fields.asked_when is
  'Asked only while another answer has this value, or one of these values, e.g. '
  '{"key":"marital","value":"divorced"} or {"key":"marital","value":["divorced","widowed"]}. '
  '`required` binds only then. Null: always asked.';

update public.biodata_fields
   set label_gu = 'જ્ઞાતિ - પેટા સમાજ', label_en = 'Caste - Sub-community'
 where key = 'community';

-- The two one-line addresses become the first line of their own sections.
update public.biodata_fields
   set section = 'address', ordinal = 1,
       label_gu = 'મકાન નંબર, સોસાયટી / બિલ્ડિંગ', label_en = 'House no., society / building'
 where key = 'address';
update public.biodata_fields
   set section = 'native', ordinal = 1,
       label_gu = 'વતનનું ઘર, શેરી / ફળિયું', label_en = 'Native house, street / area'
 where key = 'nativeAddress';

insert into public.biodata_fields
  (key, section, ordinal, label_gu, label_en, required, required_for, value_type, options, asked_when)
values
  ('children',        'personal', 7, 'બાળકોની સંખ્યા', 'Number of children', true, 'all', 'enum',
   '[{"value":"0","gu":"કોઈ નહીં","en":"None"},{"value":"1","gu":"1","en":"1"},{"value":"2","gu":"2","en":"2"},'
   '{"value":"3","gu":"3","en":"3"},{"value":"4","gu":"4","en":"4"},{"value":"5+","gu":"5 કે વધુ","en":"5 or more"}]',
   '{"key":"marital","value":["divorced","widowed"]}'),
  ('addressArea',     'address',  2, 'શેરી / વિસ્તાર', 'Street / area', true, 'all', 'text', '[]', null),
  ('addressLandmark', 'address',  3, 'લેન્ડમાર્ક', 'Landmark', false, 'all', 'text', '[]', null),
  ('addressCity',     'address',  4, 'હાલનું ગામ / શહેર', 'Current village / city', true, 'all', 'text', '[]', null),
  ('addressTaluka',   'address',  5, 'તાલુકો', 'Taluka', false, 'all', 'text', '[]', null),
  ('addressDistrict', 'address',  6, 'જિલ્લો', 'District', true, 'all', 'text', '[]', null),
  ('addressState',    'address',  7, 'હાલનું રાજ્ય', 'Current state', true, 'all', 'text', '[]', null),
  ('addressPin',      'address',  8, 'પિન કોડ', 'PIN code', true, 'all', 'pincode', '[]', null),
  ('nativeVillage',   'native',   2, 'વતનનું ગામ / શહેર', 'Native village / town', false, 'all', 'text', '[]', null),
  ('nativeTaluka',    'native',   3, 'વતનનો તાલુકો', 'Native taluka', false, 'all', 'text', '[]', null),
  ('nativeDistrict',  'native',   4, 'વતનનો જિલ્લો', 'Native district', false, 'all', 'text', '[]', null),
  ('nativeState',     'native',   5, 'વતનનું રાજ્ય', 'Native state', false, 'all', 'text', '[]', null),
  ('nativePin',       'native',   6, 'વતનનો પિન કોડ', 'Native PIN code', false, 'all', 'pincode', '[]', null);

-- ------------------------------------------------------------- validation --
-- Whether a biodata is asked a field, by its `asked_when`. `@>` reads both
-- shapes: a string contains only itself, and a list contains each of its
-- strings.
create or replace function app.is_asked(p_asked_when jsonb, p_data jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_asked_when is null
      or (p_asked_when -> 'value') @> to_jsonb(coalesce(p_data ->> (p_asked_when ->> 'key'), ''))
$$;

-- Same as 20261021000100, with `asked_when` read by app.is_asked and a PIN
-- code checked as six digits.
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
    and app.is_asked(f.asked_when, p_data)
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
  select f.key, 'not_a_date'
  from public.biodata_fields f
  join supplied s on s.key = f.key
  where f.value_type = 'date' and s.val <> ''
    and coalesce(app.try_date(s.val) not between date '1940-01-01' and current_date, true)

  union all
  select f.key, 'not_a_phone'
  from public.biodata_fields f
  join supplied s on s.key = f.key
  where f.value_type = 'phone' and s.val <> ''
    and s.val !~ '^[6-9][0-9]{9}$'

  union all
  select f.key, 'not_a_pincode'
  from public.biodata_fields f
  join supplied s on s.key = f.key
  where f.value_type = 'pincode' and s.val <> ''
    and s.val !~ '^[1-9][0-9]{5}$'

  union all
  select f.key, 'too_long'
  from public.biodata_fields f
  join supplied s on s.key = f.key
  where f.value_type = 'text' and length(s.val) > 200
$$;

-- Same as 20261021000100, with `asked_when` read by app.is_asked.
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
    and app.is_asked(f.asked_when, p_data)
$$;

-- -------------------------------------------- never in the directory ------
-- Same as 20261021000100, with every part of both addresses removed.
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
  (r.data - array[
    'phone', 'extraPhone', 'contactKind', 'fatherPhone',
    'address', 'addressArea', 'addressLandmark', 'addressCity', 'addressTaluka',
    'addressDistrict', 'addressState', 'addressPin',
    'nativeAddress', 'nativeVillage', 'nativeTaluka', 'nativeDistrict', 'nativeState', 'nativePin'
  ]) as biodata,
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

-- ------------------------------------------- the address, without review --
-- The caller's approved biodatas whose live version still lacks a required
-- part of the current address: what the banner on member screens asks for.
create or replace function public.my_address_gaps()
returns table (candidate_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.candidates c
  join public.biodata_revisions r on r.id = c.published_revision_id
  where c.id in (select app.operated_candidate_ids())
    and exists (
      select 1 from public.biodata_fields f
      where f.section = 'address' and f.required
        and btrim(coalesce(r.data ->> f.key, '')) = ''
    )
  order by c.public_code
$$;

-- Writes the current and native address straight onto the live biodata, and
-- onto a version waiting beside it, so approving that version later does not
-- take the address away again. Only address fields may be sent, and the
-- current address must be whole afterwards. The shape of every part is still
-- checked by the revision's own trigger.
create or replace function public.save_live_address(p_candidate_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_published uuid;
  v_data      jsonb := coalesce(p_data, '{}'::jsonb);
  v_others    text;
  v_missing   text;
begin
  perform app.require_operator(p_candidate_id);

  if jsonb_typeof(v_data) <> 'object' then
    raise exception 'invalid: the address is sent as fields' using errcode = '22023';
  end if;

  select published_revision_id into v_published
    from public.candidates where id = p_candidate_id
     for update;
  if v_published is null then
    raise exception 'conflict: until the biodata is approved, the address is filled in on it'
      using errcode = 'P0001';
  end if;

  select string_agg(k, ',' order by k) into v_others
  from jsonb_object_keys(v_data) k
  where not exists (select 1 from public.biodata_fields f
                     where f.key = k and f.section in ('address', 'native'));
  if v_others is not null then
    raise exception 'invalid: only the address changes here, not %', v_others using errcode = '22023';
  end if;

  select string_agg(f.key, ',' order by f.ordinal) into v_missing
  from public.biodata_fields f, public.biodata_revisions r
  where r.id = v_published
    and f.section = 'address' and f.required
    and btrim(coalesce((r.data || v_data) ->> f.key, '')) = '';
  if v_missing is not null then
    raise exception 'incomplete: %', v_missing using errcode = 'P0001';
  end if;

  update public.biodata_revisions
     set data = data || v_data
   where id = v_published
      or (candidate_id = p_candidate_id
          and status in ('draft', 'submitted', 'under_review', 'correction_requested'));
end
$$;

revoke execute on function public.my_address_gaps() from public, anon;
grant execute on function public.my_address_gaps() to authenticated, service_role;
revoke execute on function public.save_live_address(uuid, jsonb) from public, anon;
grant execute on function public.save_live_address(uuid, jsonb) to authenticated, service_role;
