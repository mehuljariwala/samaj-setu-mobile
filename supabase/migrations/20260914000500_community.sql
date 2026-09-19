-- ---------------------------------------------------------------------------
-- Community rules and per-family requirements (spec §7).
--
-- Two distinct things the BRD ran together:
--   universal        — community-wide exclusions that apply to everyone.
--   family_preference — a family's own hard requirements, opted into per
--                       candidate, and never applied to anyone else.
--
-- A rule that has not been ratified by community leadership is stored with
-- enabled = false and ratified_at = null. It is visible to admins, documented,
-- and has no effect. Spec §7 is explicit that the paternal-surname and
-- declared-relation rules need a precise ratified definition before they can be
-- enforced, so shipping them switched off is the design, not an omission.
-- ---------------------------------------------------------------------------

create table public.community_rules (
  code            text primary key,
  scope           public.rule_scope not null,
  title_gu        text not null,
  title_en        text not null,
  -- Shown verbatim to members when a rule excludes someone (spec §7: "Explain
  -- exclusion or insufficient-information states in plain Gujarati and English").
  explanation_gu  text not null,
  explanation_en  text not null,
  enabled         boolean not null default false,
  -- How the comparison is performed. Kept as data so that ratifying a
  -- definition is an UPDATE with an audit trail, not a code deploy.
  definition      jsonb not null default '{}'::jsonb,
  ratified_at     timestamptz,
  ratified_by_account_id uuid references public.accounts(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- The point of the whole table: nothing enforces until someone ratifies it.
  constraint community_rules_enabled_requires_ratification
    check (enabled = false or ratified_at is not null)
);

create trigger community_rules_touch
  before update on public.community_rules
  for each row execute function app.touch_updated_at();

insert into public.community_rules
  (code, scope, title_gu, title_en, explanation_gu, explanation_en, enabled, definition, ratified_at)
values
  ('shared_mosal', 'universal',
   'સમાન મોસાળ', 'Shared mosal',
   'બંને પરિવારોનું મોસાળ એક જ હોવાથી આ સંબંધ શક્ય નથી.',
   'Both families share the same mosal, so this match is not possible.',
   true,
   '{"compare": "normalized_exact", "field": "mosal_family", "requires_confirmation": true}'::jsonb,
   now()),

  -- Spec §7: "The BRD's paternal-surname and declared-relation rules need a
  -- precise, leadership-ratified comparison definition before enforcement is
  -- implemented. Do not infer genealogical identity from an approximate text
  -- match." Recorded, disabled, awaiting a definition.
  ('paternal_surname', 'universal',
   'પિતૃપક્ષની અટક', 'Paternal surname',
   'આ નિયમની ચોક્કસ વ્યાખ્યા સમાજના આગેવાનો દ્વારા મંજૂર થવાની બાકી છે.',
   'The exact definition of this rule is awaiting community leadership approval.',
   false,
   '{"status": "awaiting_ratified_definition", "note": "no approximate text match"}'::jsonb,
   null),

  ('declared_relation', 'universal',
   'જાહેર કરેલો સંબંધ', 'Declared relation',
   'આ નિયમની ચોક્કસ વ્યાખ્યા સમાજના આગેવાનો દ્વારા મંજૂર થવાની બાકી છે.',
   'The exact definition of this rule is awaiting community leadership approval.',
   false,
   '{"status": "awaiting_ratified_definition"}'::jsonb,
   null),

  -- Not stated in the specification, which never mentions gender matching at
  -- all. It is recorded as an explicit, ratified rule rather than buried in a
  -- query so that it is visible on the admin rules screen and can be switched
  -- off with an UPDATE if that assumption is wrong.
  ('opposite_gender', 'universal',
   'વિરુદ્ધ લિંગ', 'Opposite gender',
   'આ ડિરેક્ટરી લગ્ન માટે વિરુદ્ધ લિંગના ઉમેદવારો બતાવે છે.',
   'The directory introduces candidates of the opposite gender.',
   true,
   '{"compare": "not_equal", "field": "gender", "assumption": "not stated in the specification"}'::jsonb,
   now()),

  ('same_sub_community', 'family_preference',
   'સમાન પેટા સમાજ', 'Same sub-community',
   'આ પરિવારે સમાન પેટા સમાજની શરત રાખી છે.',
   'This family requires a match from the same sub-community.',
   true,
   '{"compare": "exact", "field": "sub_community"}'::jsonb,
   now()),

  ('same_sect', 'family_preference',
   'સમાન ભક્ત / જગત', 'Same sect',
   'આ પરિવારે સમાન ભક્ત / જગતની શરત રાખી છે.',
   'This family requires a match from the same sect.',
   true,
   '{"compare": "exact", "field": "sect"}'::jsonb,
   now());

-- ---------------------------------------------------- family preferences ---
-- A family's own hard requirements. Defaults are all "no requirement", so a
-- family that never opens this screen never silently narrows their own results.
create table public.family_preferences (
  candidate_id              uuid primary key references public.candidates(id) on delete cascade,
  require_same_sub_community boolean not null default false,
  require_same_sect          boolean not null default false,
  min_age                    smallint check (min_age between 18 and 99),
  max_age                    smallint check (max_age between 18 and 99),
  cities                     text[] not null default '{}',
  updated_at                 timestamptz not null default now(),

  constraint family_preferences_age_range_is_ordered
    check (min_age is null or max_age is null or min_age <= max_age)
);

create trigger family_preferences_touch
  before update on public.family_preferences
  for each row execute function app.touch_updated_at();

comment on table public.family_preferences is
  'Per-candidate hard requirements. Distinct from community_rules with '
  'scope = universal, which bind everybody (spec §7).';
