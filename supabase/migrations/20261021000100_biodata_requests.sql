-- ---------------------------------------------------------------------------
-- What the samaj asked to add to the biodata on 2026-10-21.
--
--   shakh           શાખ, typed in. A Khatri biodata's question; the form does
--                   not ask it of a Sanatan biodata, which asks the caste.
--   address         every family's now, not only a Sanatan daughter's, and
--                   called the current address: where they live today.
--   nativeAddress   the address back home (મૂળ વતન), optional.
--   divorceDate,    asked only when the marital status is divorced, and then
--   divorceDetails  required.
--   widowedDate     asked only when widowed, and then required.
--
-- Both addresses stay with the admins: the directory copy other families read
-- drops them, as it already drops the phone numbers.
--
-- Two catalogue additions carry the conditional questions:
--   value_type 'date'  an ISO date (yyyy-mm-dd), not in the future
--   asked_when         {"key": …, "value": …}: the field is asked, and its
--                      `required` binds, only while that other answer holds
--
-- And one change to when completeness is checked. It was checked on every
-- write to a submitted, in-review or approved revision, so a question added to
-- the catalogue later made every older approved biodata "incomplete": approving
-- the one waiting in review, or an admin moving a profile's gender, would then
-- fail. Completeness is now checked when a revision is submitted, the moment
-- the family vouches for it (submit_biodata and the registration send already
-- check it then, with friendlier errors). The shape of every answer is still
-- checked on every write.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- catalogue ---
alter table public.biodata_fields drop constraint biodata_fields_value_type_check;
alter table public.biodata_fields add constraint biodata_fields_value_type_check
  check (value_type in ('text', 'number', 'time', 'enum', 'phone', 'date'));

alter table public.biodata_fields
  add column asked_when jsonb
  check (asked_when is null
         or (jsonb_typeof(asked_when -> 'key') = 'string' and jsonb_typeof(asked_when -> 'value') = 'string'));

comment on column public.biodata_fields.asked_when is
  'Asked only while another answer has this value, e.g. {"key":"marital","value":"divorced"}. '
  '`required` binds only then. Null: always asked.';

update public.biodata_fields
   set required_for = 'all', label_gu = 'હાલનું સરનામું', label_en = 'Current address'
 where key = 'address';

insert into public.biodata_fields
  (key, section, ordinal, label_gu, label_en, required, required_for, value_type, options, asked_when)
values
  ('divorceDate',    'personal',  4, 'છૂટાછેડાની તારીખ', 'Date of divorce', true, 'all', 'date', '[]',
   '{"key":"marital","value":"divorced"}'),
  ('divorceDetails', 'personal',  5, 'છૂટાછેડાની વિગત', 'Divorce details', true, 'all', 'text', '[]',
   '{"key":"marital","value":"divorced"}'),
  ('widowedDate',    'personal',  6, 'જીવનસાથીના અવસાનની તારીખ', 'Date of spouse''s death', true, 'all', 'date', '[]',
   '{"key":"marital","value":"widowed"}'),
  ('shakh',          'community', 6, 'શાખ', 'Shakh', false, 'all', 'text', '[]', null),
  ('nativeAddress',  'contact',   6, 'મૂળ વતનનું સરનામું', 'Native address', false, 'all', 'text', '[]', null);

-- ------------------------------------------------------------- validation --
-- A date that does not exist (2026-02-30) is not an error to raise mid-query,
-- just a value that is not a date.
create or replace function app.try_date(p_value text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  return p_value::date;
exception
  when others then
    return null;
end
$$;

-- Same as 20261004000700, plus: `asked_when` gates the required check, and a
-- date must be a real one, from 1940 on and not in the future.
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
    and (f.asked_when is null
         or coalesce(p_data ->> (f.asked_when ->> 'key'), '') = f.asked_when ->> 'value')
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
  select f.key, 'too_long'
  from public.biodata_fields f
  join supplied s on s.key = f.key
  where f.value_type = 'text' and length(s.val) > 200
$$;

-- Same as 20261004000700, with `asked_when` honoured: a divorce date counts
-- towards completion only on a divorced biodata.
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
    and (f.asked_when is null
         or coalesce(p_data ->> (f.asked_when ->> 'key'), '') = f.asked_when ->> 'value')
$$;

-- Same as 20260914000400, except that completeness is required only as the
-- revision enters `submitted`, not on every later write (see the header).
create or replace function app.validate_biodata_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problems text;
begin
  select string_agg(field_key || ':' || problem, ', ' order by field_key)
    into v_problems
  from app.validate_biodata(
    new.data,
    new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted')
  );

  if v_problems is not null then
    raise exception 'biodata_invalid: %', v_problems
      using errcode = 'check_violation';
  end if;

  new.completion := app.biodata_completion(new.data);
  return new;
end
$$;

-- -------------------------------------------- never in the directory ------
-- Same as 20261004000700, with the native address removed as well.
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
  (r.data - 'phone' - 'extraPhone' - 'contactKind' - 'fatherPhone' - 'address' - 'nativeAddress') as biodata,
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
