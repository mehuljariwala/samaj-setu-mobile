-- ---------------------------------------------------------------------------
-- Biodata revisions, server-side field validation, and candidate consent
-- (spec §5, §12).
--
-- Biodata is versioned rather than edited in place: spec §5 requires that
-- "published content changes create a revision for review while the approved
-- version remains visible". `candidates.published_revision_id` points at the
-- approved revision; a new draft can be in review beside it without disturbing
-- what members see.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------- field catalogue ---
-- The same 25 fields as components/biodata/model.ts, but here they are the
-- authority. Spec §12: pasted biodata is untrusted input. A jsonb blob the
-- client fills in freely is not a schema, so the server validates every write
-- against this catalogue and computes completion itself.
create table public.biodata_fields (
  key            text primary key,
  section        text not null,
  ordinal        smallint not null,
  label_gu       text not null,
  label_en       text not null,
  required       boolean not null default false,
  value_type     text not null check (value_type in ('text', 'number', 'time', 'enum', 'phone')),
  min_value      integer,
  max_value      integer,
  options        jsonb not null default '[]'::jsonb,
  -- Spec §7: these feed community-rule evaluation, so an unconfirmed value has
  -- to be distinguishable from a confirmed one.
  affects_eligibility boolean not null default false,
  unique (section, ordinal)
);

comment on table public.biodata_fields is
  'Server-side field catalogue. Mirrors components/biodata/model.ts; the two must '
  'be changed together. This copy is the one that decides what a write may contain.';

insert into public.biodata_fields
  (key, section, ordinal, label_gu, label_en, required, value_type, min_value, max_value, options, affects_eligibility)
values
  ('gender',      'personal',  1, 'લિંગ', 'Gender', true, 'enum', null, null,
   '[{"value":"male","gu":"પુરુષ","en":"Male"},{"value":"female","gu":"સ્ત્રી","en":"Female"}]', false),
  ('height',      'personal',  2, 'ઊંચાઈ (સે.મી.)', 'Height (cm)', true, 'number', 100, 250, '[]', false),
  ('marital',     'personal',  3, 'વૈવાહિક સ્થિતિ', 'Marital status', true, 'enum', null, null,
   '[{"value":"never","gu":"અપરિણીત","en":"Never married"},{"value":"divorced","gu":"છૂટાછેડા થયેલ","en":"Divorced"},{"value":"widowed","gu":"વિધુર / વિધવા","en":"Widowed"}]', false),

  ('community',   'community', 1, 'પેટા સમાજ', 'Sub-community', true, 'enum', null, null,
   '[{"value":"surti","gu":"સુરતી","en":"Surti"},{"value":"khambhati","gu":"ખંભાતી","en":"Khambhati"},{"value":"ahmedabadi","gu":"અમદાવાદી","en":"Ahmedabadi"},{"value":"indori","gu":"ઇન્દોરી","en":"Indori"}]', true),
  ('sect',        'community', 2, 'ભક્ત / જગત', 'Sect', true, 'enum', null, null,
   '[{"value":"bhagat","gu":"ભક્ત","en":"Bhagat"},{"value":"jagat","gu":"જગત","en":"Jagat"}]', true),
  ('surname',     'community', 3, 'પિતૃપક્ષની અટક', 'Paternal surname', true, 'text', null, null, '[]', true),
  ('mosal',       'community', 4, 'મોસાળનું કુટુંબ / અટક', 'Maternal grandfather''s family / surname', true, 'text', null, null, '[]', true),

  ('education',   'education', 1, 'લાયકાત', 'Qualification', true, 'enum', null, null,
   '[{"value":"school","gu":"શાળા","en":"School"},{"value":"diploma","gu":"ડિપ્લોમા","en":"Diploma"},{"value":"bachelor","gu":"સ્નાતક","en":"Bachelor''s"},{"value":"master","gu":"અનુસ્નાતક","en":"Master''s"},{"value":"doctorate","gu":"ડૉક્ટરેટ","en":"Doctorate"},{"value":"other","gu":"અન્ય","en":"Other"}]', false),
  ('degree',      'education', 2, 'ડિગ્રી / વિષય', 'Degree / specialisation', false, 'text', null, null, '[]', false),
  ('work',        'education', 3, 'હાલની સ્થિતિ', 'Current status', true, 'enum', null, null,
   '[{"value":"employed","gu":"નોકરી","en":"Employed"},{"value":"business","gu":"વ્યવસાય","en":"Business"},{"value":"student","gu":"વિદ્યાર્થી","en":"Student"},{"value":"not_working","gu":"હાલ કામ નથી","en":"Not working"},{"value":"other","gu":"અન્ય","en":"Other"}]', false),
  ('role',        'education', 4, 'વ્યવસાય / ભૂમિકા', 'Profession / role', false, 'text', null, null, '[]', false),
  ('employer',    'education', 5, 'કંપની / વ્યવસાયનું નામ', 'Employer / business name', false, 'text', null, null, '[]', false),

  ('mother',      'family',    1, 'માતાનું પૂરું નામ', 'Mother''s full name', false, 'text', null, null, '[]', false),
  ('native',      'family',    2, 'મૂળ વતન', 'Native place', false, 'text', null, null, '[]', false),
  ('brothers',    'family',    3, 'ભાઈઓની સંખ્યા', 'Number of brothers', false, 'number', 0, 30, '[]', false),
  ('sisters',     'family',    4, 'બહેનોની સંખ્યા', 'Number of sisters', false, 'number', 0, 30, '[]', false),
  ('diet',        'family',    5, 'આહાર', 'Diet', false, 'enum', null, null,
   '[{"value":"vegetarian","gu":"શાકાહારી","en":"Vegetarian"},{"value":"jain","gu":"જૈન","en":"Jain"},{"value":"eggetarian","gu":"ઇંડા સહિત","en":"Eggetarian"},{"value":"nonveg","gu":"માંસાહારી","en":"Non-vegetarian"},{"value":"other","gu":"અન્ય","en":"Other"}]', false),

  ('birthplace',  'astro',     1, 'જન્મ સ્થળ', 'Birthplace', false, 'text', null, null, '[]', false),
  ('birthtime',   'astro',     2, 'જન્મ સમય', 'Birth time', false, 'time', null, null, '[]', false),
  ('rashi',       'astro',     3, 'રાશિ', 'Rashi', false, 'enum', null, null,
   '[{"value":"unknown","gu":"જાણ નથી","en":"Not known"},{"value":"Aries","gu":"મેષ","en":"Aries"},{"value":"Taurus","gu":"વૃષભ","en":"Taurus"},{"value":"Gemini","gu":"મિથુન","en":"Gemini"},{"value":"Cancer","gu":"કર્ક","en":"Cancer"},{"value":"Leo","gu":"સિંહ","en":"Leo"},{"value":"Virgo","gu":"કન્યા","en":"Virgo"},{"value":"Libra","gu":"તુલા","en":"Libra"},{"value":"Scorpio","gu":"વૃશ્ચિક","en":"Scorpio"},{"value":"Sagittarius","gu":"ધનુ","en":"Sagittarius"},{"value":"Capricorn","gu":"મકર","en":"Capricorn"},{"value":"Aquarius","gu":"કુંભ","en":"Aquarius"},{"value":"Pisces","gu":"મીન","en":"Pisces"}]', false),
  ('gan',         'astro',     4, 'ગણ', 'Gan', false, 'enum', null, null,
   '[{"value":"unknown","gu":"જાણ નથી","en":"Not known"},{"value":"dev","gu":"દેવ","en":"Dev"},{"value":"manushya","gu":"મનુષ્ય","en":"Manushya"},{"value":"rakshas","gu":"રાક્ષસ","en":"Rakshas"}]', false),
  ('mangal',      'astro',     5, 'મંગળ સ્થિતિ', 'Mangal status', false, 'enum', null, null,
   '[{"value":"unknown","gu":"જાણ નથી","en":"Not known"},{"value":"yes","gu":"મંગળ છે","en":"Manglik"},{"value":"no","gu":"મંગળ નથી","en":"Not Manglik"}]', false),

  ('contactKind', 'contact',   1, 'સંપર્ક વ્યક્તિ', 'Contact person', true, 'enum', null, null,
   '[{"value":"self","gu":"ઉમેદવાર","en":"Candidate"},{"value":"father","gu":"પિતા","en":"Father"},{"value":"mother","gu":"માતા","en":"Mother"},{"value":"guardian","gu":"વાલી","en":"Guardian"}]', false),
  ('phone',       'contact',   2, 'સંપર્ક નંબર', 'Contact number', true, 'phone', null, null, '[]', false),
  ('extraPhone',  'contact',   3, 'વધારાનો નંબર', 'Additional number', false, 'phone', null, null, '[]', false);

-- ------------------------------------------------------------ validation ---
-- Returns one row per problem. An empty result means the payload is acceptable;
-- it does not mean the biodata is complete (see app.biodata_completion).
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
  )
  -- Keys the catalogue does not know about. Rejecting rather than ignoring
  -- them keeps a pasted-biodata importer from quietly persisting junk.
  select s.key, 'unknown_field'
  from supplied s
  where not exists (select 1 from public.biodata_fields f where f.key = s.key)

  union all
  -- Only enforced when submitting for review; a draft is allowed to be partial.
  select f.key, 'required'
  from public.biodata_fields f
  where p_require_complete
    and f.required
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
$$;

comment on function app.biodata_completion(jsonb) is
  'Percentage of required fields present. Matches completion() in '
  'components/biodata/model.ts, but computed where it cannot be faked.';

-- ------------------------------------------------------------- revisions ---
create table public.biodata_revisions (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references public.candidates(id) on delete cascade,
  version           integer not null check (version > 0),
  status            public.revision_status not null default 'draft',
  -- Flat key/value, matching the form's `Values` shape. Validated on write
  -- against biodata_fields; never trusted as-is.
  data              jsonb not null default '{}'::jsonb,
  completion        integer not null default 0 check (completion between 0 and 100),
  source            text not null default 'guided'
                    check (source in ('guided', 'pasted', 'imported')),
  -- Spec §5: imported values must be reviewed, and uncertain ones flagged.
  -- Keys listed here were machine-extracted and not yet confirmed by a human.
  unconfirmed_fields text[] not null default '{}',

  created_by_account_id uuid references public.accounts(id) on delete set null,
  submitted_at      timestamptz,
  decided_at        timestamptz,
  decided_by_account_id uuid references public.accounts(id) on delete set null,
  decision_reason   text,
  correction_fields text[] not null default '{}',
  approved_at       timestamptz,
  superseded_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (candidate_id, version),
  constraint revisions_submitted_has_timestamp
    check ((status = 'draft') = (submitted_at is null)),
  constraint revisions_approved_has_timestamp
    check ((status in ('approved', 'superseded')) = (approved_at is not null)),
  constraint revisions_refusal_needs_reason
    check (status not in ('rejected', 'correction_requested') or decision_reason is not null)
);

create trigger biodata_revisions_touch
  before update on public.biodata_revisions
  for each row execute function app.touch_updated_at();

-- At most one revision in flight per candidate. Without this, two devices
-- editing the same draft would silently fork it.
create unique index biodata_revisions_one_open
  on public.biodata_revisions (candidate_id)
  where status in ('draft', 'submitted', 'under_review', 'correction_requested');

create index biodata_revisions_queue_idx
  on public.biodata_revisions (submitted_at)
  where status in ('submitted', 'under_review');

-- Now that the table exists, close the loop from candidates.
alter table public.candidates
  add constraint candidates_published_revision_fkey
  foreign key (published_revision_id) references public.biodata_revisions(id)
  on delete set null;

-- Validate and score on every write, so no code path can store an invalid
-- payload or a completion percentage that disagrees with the data.
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
    new.status in ('submitted', 'under_review', 'approved')
  );

  if v_problems is not null then
    raise exception 'biodata_invalid: %', v_problems
      using errcode = 'check_violation';
  end if;

  new.completion := app.biodata_completion(new.data);
  return new;
end
$$;

create trigger biodata_revisions_validate
  before insert or update of data, status on public.biodata_revisions
  for each row execute function app.validate_biodata_revision();

-- ---------------------------------------------------------- field issues ---
-- Spec §10: publication review reports field-level issues, in both languages,
-- because the applicant reads them.
create table public.revision_field_issues (
  id           uuid primary key default gen_random_uuid(),
  revision_id  uuid not null references public.biodata_revisions(id) on delete cascade,
  field_key    text not null references public.biodata_fields(key),
  message_gu   text not null,
  message_en   text not null,
  created_by_account_id uuid references public.accounts(id) on delete set null,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  unique (revision_id, field_key)
);

-- ----------------------------------------------------------------- consent -
-- Spec §4: "The candidate controls publication consent. A parent cannot supply
-- that consent on the candidate's behalf." Enforced by trigger below, not only
-- by the RPC, so that no future write path can bypass it.
create table public.candidate_consents (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references public.candidates(id) on delete cascade,
  revision_id       uuid references public.biodata_revisions(id) on delete set null,
  granted_by_account_id uuid not null references public.accounts(id) on delete restrict,
  consent_text_version text not null,
  granted_at        timestamptz not null default now(),
  withdrawn_at      timestamptz,
  withdrawn_by_account_id uuid references public.accounts(id) on delete set null,
  -- Evidence, not tracking: what the candidate's browser said at the moment
  -- they consented. No IP address is stored.
  user_agent        text,

  constraint consents_withdrawal_is_complete
    check ((withdrawn_at is null) = (withdrawn_by_account_id is null))
);

comment on table public.candidate_consents is
  'Append-only consent ledger. Withdrawal sets withdrawn_at on the active row; '
  'rows are never deleted, because "consent was active when we published" has to '
  'stay answerable after the fact.';

create unique index candidate_consents_one_active
  on public.candidate_consents (candidate_id)
  where withdrawn_at is null;

create or replace function app.enforce_consent_is_self()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.candidate_memberships m
    where m.candidate_id = new.candidate_id
      and m.account_id = new.granted_by_account_id
      and m.role = 'candidate'
      and m.revoked_at is null
  ) then
    -- Spec §4: where the candidate cannot consent normally, publication stays
    -- blocked until an assisted process is defined. Substituting a parent is
    -- not that process.
    raise exception
      'consent_must_be_candidate: only the candidate''s own account may grant publication consent'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger candidate_consents_self_only
  before insert on public.candidate_consents
  for each row execute function app.enforce_consent_is_self();

create or replace function app.has_active_consent(p_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.candidate_consents c
    where c.candidate_id = p_candidate_id and c.withdrawn_at is null
  )
$$;
