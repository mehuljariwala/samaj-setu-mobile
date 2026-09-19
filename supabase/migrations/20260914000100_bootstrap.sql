-- ---------------------------------------------------------------------------
-- Bootstrap: schemas, extensions, enumerated domain states, shared triggers.
--
-- Two schemas carry application code:
--   public — tables and the RPCs a signed-in client is allowed to call.
--   app    — authorisation helpers and internal machinery. Deliberately absent
--            from `db.schemas` in config.toml, so PostgREST will not expose it
--            and a client cannot call these directly.
-- ---------------------------------------------------------------------------

create schema if not exists app;

-- pgcrypto: random share-link tokens. pg_trgm: name similarity for duplicate
-- detection. Nothing else is installed — an extension nobody calls is still an
-- extension somebody has to patch.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

comment on schema app is
  'Internal authorisation helpers and triggers. Not exposed through PostgREST.';

-- --------------------------------------------------------------- roles -----
-- `member` is implicit in having an approved candidate; these are the elevated
-- roles. Spec §2: a member must not be able to grant themselves admin, which is
-- why roles live in their own table with no member-writable policy.
create type public.app_role as enum ('moderator', 'admin', 'superadmin');

create type public.account_status as enum ('active', 'suspended', 'closed');
create type public.language_code as enum ('gu', 'en');

-- Spec §2's access table, as a single derived value.
create type public.access_state as enum (
  'signed_out',
  'no_application',
  'application_draft',
  'awaiting_review',
  'correction_requested',
  'approved',
  'rejected',
  'suspended'
);

-- --------------------------------------------------------- people ----------
create type public.gender as enum ('male', 'female');

create type public.marital_status as enum ('never_married', 'divorced', 'widowed');

-- How the operator relates to the candidate. Spec §3 step 3.
create type public.relationship as enum (
  'self', 'son', 'daughter', 'brother', 'sister', 'ward', 'other'
);

-- What an account may do with a candidate. `candidate` is the person themselves
-- and is the only role that can supply publication consent (spec §4).
create type public.membership_role as enum ('candidate', 'guardian', 'viewer');

-- ------------------------------------------------------- lifecycle ---------
-- Spec §5: "Identity approval and publication approval remain separate records
-- and states." Hence two independent status enums on a candidate.
create type public.identity_status as enum (
  'unverified', 'pending', 'correction_requested', 'verified', 'rejected', 'suspended'
);

create type public.publication_status as enum (
  'not_started', 'draft', 'in_review', 'correction_requested',
  'published', 'unpublished', 'rejected'
);

create type public.application_status as enum (
  'draft', 'submitted', 'under_review', 'correction_requested',
  'approved', 'rejected', 'withdrawn'
);

create type public.revision_status as enum (
  'draft', 'submitted', 'under_review', 'correction_requested',
  'approved', 'superseded', 'rejected'
);

-- ---------------------------------------------------------- review ---------
create type public.review_subject as enum (
  'registration', 'biodata_revision', 'access_request', 'duplicate', 'media'
);

create type public.review_action as enum (
  'approve', 'request_correction', 'reject', 'reopen', 'claim', 'release'
);

create type public.duplicate_status as enum ('open', 'confirmed', 'not_duplicate');

create type public.access_request_status as enum (
  'pending', 'approved', 'rejected', 'withdrawn'
);

-- -------------------------------------------------- matching / media -------
create type public.interest_status as enum (
  'pending', 'accepted', 'declined', 'withdrawn', 'expired'
);

create type public.contact_kind as enum ('self', 'father', 'mother', 'guardian');

create type public.media_kind as enum ('photo', 'kundali');

create type public.media_status as enum ('pending_review', 'approved', 'rejected');

-- Spec §8: photo permission is viewer-specific. `on_request` is the default —
-- nothing is visible until this candidate grants a named viewer access.
create type public.media_visibility as enum ('private', 'on_request', 'members');

create type public.media_request_status as enum (
  'pending', 'approved', 'declined', 'withdrawn', 'revoked', 'expired'
);

-- Spec §7: "Unknown information must not be treated as evidence of
-- eligibility" — which is why `insufficient_information` is its own verdict and
-- never collapses into `eligible`.
create type public.eligibility_verdict as enum (
  'eligible',
  'insufficient_information',
  'excluded_self',
  'excluded_same_household',
  'excluded_gender',
  'excluded_shared_mosal',
  'excluded_sub_community',
  'excluded_sect',
  'excluded_blocked',
  'not_discoverable'
);

create type public.rule_scope as enum ('universal', 'family_preference');

create type public.notification_kind as enum (
  'registration_submitted',
  'registration_decided',
  'biodata_decided',
  'access_request_decided',
  'interest_received',
  'interest_responded',
  'photo_request_received',
  'photo_request_decided',
  'review_overdue'
);

-- ------------------------------------------------------------- identity ----
-- The account id of whoever is making this request, or NULL for an anonymous
-- or service-role call. Defined here, before any table, because triggers and
-- helpers throughout the schema depend on it.
create or replace function app.current_account_id()
returns uuid
language sql
stable
as $$
  select auth.uid()
$$;

-- ------------------------------------------------------ shared triggers ----
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

comment on function app.touch_updated_at() is
  'BEFORE UPDATE trigger. Keeps updated_at honest regardless of what the writer sends.';

-- Squash whitespace and case so two spellings of the same name compare equal.
-- Deliberately does NOT transliterate or fuzzy-match: spec §7 forbids inferring
-- genealogical identity from an approximate text match, so this is only ever
-- used to group candidates for *admin review*, never to auto-exclude.
create or replace function app.normalize_name(p_value text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g'))), '')
$$;

-- Short, human-quotable identifier shown in the UI and in admin queues
-- (the prototype's "SS-1024"). Sequential rather than random so support can
-- read one over the phone.
create sequence public.candidate_code_seq start with 1024;

create or replace function app.next_candidate_code()
returns text
language sql
volatile
as $$
  select 'SS-' || nextval('public.candidate_code_seq')::text
$$;

-- ----------------------------------------------------------- settings ------
-- Single-row table for the knobs spec §14 lists as "decisions to settle during
-- planning". They are data, not constants, so that settling one is an UPDATE
-- with an audit trail rather than a deploy — and so that an unsettled decision
-- can be represented honestly as NULL instead of as a guess baked into code.
create table public.app_settings (
  id                      boolean primary key default true check (id),

  -- Spec §3: review target, not a deadline and never an auto-approval.
  review_target_hours     integer not null default 24 check (review_target_hours > 0),

  -- Spec §14: "interest expiry" is unsettled. NULL means interests do not
  -- expire, which is the only behaviour we can defend without a decision.
  interest_expiry_days    integer check (interest_expiry_days > 0),

  -- Spec §8: a photo grant is viewer-specific; whether it lapses is a product
  -- decision. NULL means it stands until revoked.
  photo_grant_days        integer check (photo_grant_days > 0),

  -- Spec §9: protected share links. These do expire — an unbounded link is a
  -- standing invitation to whoever the message was forwarded to.
  share_link_days         integer not null default 14 check (share_link_days > 0),

  -- Bumped whenever the consent wording changes, so stored consent can be tied
  -- to the text the candidate actually agreed to.
  consent_text_version    text not null default '2026-09-14',

  -- Spec §14: certificate retention is unsettled. NULL means no automatic
  -- deletion is performed. Nothing reads this yet beyond the admin screen.
  certificate_retention_days integer check (certificate_retention_days > 0),

  updated_at              timestamptz not null default now(),
  updated_by_account_id   uuid
);

insert into public.app_settings (id) values (true);

create trigger app_settings_touch
  before update on public.app_settings
  for each row execute function app.touch_updated_at();

create or replace function app.settings()
returns public.app_settings
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.app_settings where id
$$;
