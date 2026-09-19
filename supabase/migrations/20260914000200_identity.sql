-- ---------------------------------------------------------------------------
-- Identity: operator accounts, elevated roles, candidates, and the family
-- links between them.
--
-- The distinction that drives the whole schema (spec §4):
--   an *account* is a person who operates the app (a parent or a candidate),
--   a *candidate* is the person being matched.
-- One candidate has exactly one canonical row; several accounts may operate it.
-- ---------------------------------------------------------------------------

-- -------------------------------------------------------------- accounts ---
create table public.accounts (
  id                 uuid primary key references auth.users(id) on delete cascade,
  -- Spec §4: "Phone numbers identify operator accounts, not candidate
  -- uniqueness." Stored as 10 local digits, matching the prototype's validation.
  --
  -- This release does not send an OTP, so the number is a self-declared claim
  -- until an admin corroborates it during certificate review. `phone_verified_at`
  -- exists now so that enabling phone OTP later is a configuration change and a
  -- backfill, not a schema migration. Nothing in this schema treats a phone
  -- number as proof of anything.
  phone              text not null unique check (phone ~ '^[6-9][0-9]{9}$'),
  phone_verified_at  timestamptz,
  display_name       text check (length(btrim(display_name)) between 1 and 120),
  preferred_language public.language_code not null default 'gu',
  status             public.account_status not null default 'active',
  suspension_reason  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint accounts_suspension_reason_requires_suspension
    check (status <> 'suspended' or suspension_reason is not null)
);

comment on table public.accounts is
  'One row per operator account, 1:1 with auth.users. Created automatically on sign-up.';

-- Deferred from the bootstrap migration, where accounts did not exist yet.
alter table public.app_settings
  add constraint app_settings_updated_by_fkey
  foreign key (updated_by_account_id) references public.accounts(id) on delete set null;

create trigger accounts_touch
  before update on public.accounts
  for each row execute function app.touch_updated_at();

-- Sign-up happens inside GoTrue, so the application profile has to be created
-- by a trigger rather than by application code — otherwise an interrupted
-- sign-up leaves an auth user with no account row and no way to make one.
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  -- GoTrue stores phones in E.164; the app works in 10 local digits.
  v_phone := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  if length(v_phone) > 10 then
    v_phone := right(v_phone, 10);
  end if;

  if v_phone !~ '^[6-9][0-9]{9}$' then
    -- Do not invent a phone number. Sign-ups without a usable one (a seeded
    -- admin, say) get a row only once an operator supplies one.
    return new;
  end if;

  insert into public.accounts (id, phone, display_name, preferred_language)
  values (
    new.id,
    v_phone,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'preferred_language', ''), 'gu')::public.language_code
  )
  on conflict (id) do nothing;

  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- ---------------------------------------------------------- elevated roles -
-- Spec §2: "Admin access uses a separate role; a member cannot grant it to
-- themselves." Kept out of `accounts` so that no policy which lets an account
-- edit its own profile can ever also let it edit its own privileges.
create table public.account_roles (
  account_id uuid not null references public.accounts(id) on delete cascade,
  role       public.app_role not null,
  granted_by uuid references public.accounts(id) on delete set null,
  granted_at timestamptz not null default now(),
  note       text,
  primary key (account_id, role)
);

comment on table public.account_roles is
  'Elevated roles. No INSERT/UPDATE/DELETE policy exists for members by design; '
  'granting is a service-role or superadmin RPC operation only.';

-- -------------------------------------------------------------- candidates -
create table public.candidates (
  id                  uuid primary key default gen_random_uuid(),
  public_code         text not null unique default app.next_candidate_code(),

  -- Identity-verified core. Spec §5: changing any of these re-opens verification.
  full_name           text not null check (length(btrim(full_name)) between 2 and 160),
  full_name_norm      text generated always as (app.normalize_name(full_name)) stored,
  date_of_birth       date not null,
  gender              public.gender not null,
  father_name         text check (length(btrim(father_name)) between 2 and 160),
  father_name_norm    text generated always as (app.normalize_name(father_name)) stored,
  mother_name         text check (length(btrim(mother_name)) between 2 and 160),
  city                text,
  native_place        text,

  -- Two independent lifecycles (spec §5).
  identity_status     public.identity_status not null default 'unverified',
  publication_status  public.publication_status not null default 'not_started',
  published_revision_id uuid,           -- FK added once biodata_revisions exists

  -- Member-controlled switches (spec §6, Family tab).
  paused              boolean not null default false,
  match_found_at      timestamptz,
  deletion_requested_at timestamptz,
  deleted_at          timestamptz,

  -- Denormalised answer to "may this candidate appear in the directory?".
  -- Maintained only by app.refresh_discoverability(); never written directly.
  -- It exists because the real predicate spans four tables and the directory
  -- query has to be indexable.
  discoverable        boolean not null default false,

  created_by_account_id uuid references public.accounts(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint candidates_dob_is_plausible
    check (date_of_birth > date '1900-01-01' and date_of_birth < current_date),
  constraint candidates_deleted_is_not_discoverable
    check (deleted_at is null or discoverable = false)
);

comment on column public.candidates.discoverable is
  'Derived cache of identity_status=verified AND publication_status=published AND '
  'active consent AND NOT paused AND NOT match_found AND NOT deleted. '
  'Refreshed by trigger from every table that participates in that predicate.';

create trigger candidates_touch
  before update on public.candidates
  for each row execute function app.touch_updated_at();

create index candidates_discoverable_idx
  on public.candidates (gender, city)
  where discoverable;

create index candidates_identity_status_idx
  on public.candidates (identity_status)
  where deleted_at is null;

-- Duplicate detection (spec §4) compares name and birth date. A trigram index
-- keeps that lookup cheap without implying that a match *is* a duplicate.
create index candidates_full_name_trgm_idx
  on public.candidates using gin (full_name_norm extensions.gin_trgm_ops);

create index candidates_dob_idx on public.candidates (date_of_birth);

-- ------------------------------------------------------------ memberships --
-- Who may act for a candidate. A parent managing three children has three rows;
-- a candidate managing themselves has one with role = 'candidate'.
create table public.candidate_memberships (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references public.candidates(id) on delete cascade,
  account_id        uuid not null references public.accounts(id) on delete cascade,
  role              public.membership_role not null,
  relationship      public.relationship not null,
  linked_by_account_id uuid references public.accounts(id) on delete set null,
  linked_at         timestamptz not null default now(),
  revoked_at        timestamptz,
  revoked_by_account_id uuid references public.accounts(id) on delete set null,
  revoke_reason     text,

  constraint memberships_self_role_agrees
    check ((role = 'candidate') = (relationship = 'self'))
);

comment on table public.candidate_memberships is
  'Family links. role=candidate is the person themselves — the only role that '
  'can supply publication consent (spec §4).';

-- One live link per (candidate, account); revoked rows are kept for history.
create unique index candidate_memberships_active_unique
  on public.candidate_memberships (candidate_id, account_id)
  where revoked_at is null;

-- Spec §4: one candidate, one canonical self.
create unique index candidate_memberships_one_self
  on public.candidate_memberships (candidate_id)
  where revoked_at is null and role = 'candidate';

create index candidate_memberships_account_idx
  on public.candidate_memberships (account_id)
  where revoked_at is null;

-- ------------------------------------------------- community attributes ----
-- Spec §7: "Capture structured mosal, paternal surname, sub-community, and
-- sect." Separated from `candidates` because these are the inputs to
-- eligibility, they arrive from several sources, and each needs its own
-- "has a human confirmed this?" marker. A missing row means unknown — which
-- spec §7 says must never read as eligible.
create table public.candidate_community (
  candidate_id       uuid primary key references public.candidates(id) on delete cascade,
  sub_community      text,
  sect               text,
  paternal_surname   text,
  paternal_surname_norm text generated always as (app.normalize_name(paternal_surname)) stored,
  mosal_family       text,
  mosal_family_norm  text generated always as (app.normalize_name(mosal_family)) stored,
  -- Imported or pasted values are unconfirmed until an operator reviews them
  -- (spec §5: "Require review of extracted fields").
  confirmed_at       timestamptz,
  confirmed_by_account_id uuid references public.accounts(id) on delete set null,
  source             text not null default 'biodata'
                     check (source in ('registration', 'biodata', 'import', 'admin')),
  updated_at         timestamptz not null default now()
);

create trigger candidate_community_touch
  before update on public.candidate_community
  for each row execute function app.touch_updated_at();

create index candidate_community_mosal_idx
  on public.candidate_community (mosal_family_norm)
  where mosal_family_norm is not null;

-- --------------------------------------------------------------- privacy ---
create table public.candidate_privacy (
  candidate_id        uuid primary key references public.candidates(id) on delete cascade,
  -- Spec §8: photo access is viewer-specific, so 'on_request' is the default and
  -- 'members' is an explicit opt-in by the candidate.
  photo_visibility    public.media_visibility not null default 'on_request',
  kundali_visibility  public.media_visibility not null default 'private',
  -- Spec §8: acceptance grants contact access; a candidate may still withhold it.
  reveal_contact_on_accept boolean not null default true,
  updated_at          timestamptz not null default now()
);

create trigger candidate_privacy_touch
  before update on public.candidate_privacy
  for each row execute function app.touch_updated_at();

-- Every candidate must have privacy defaults from the moment they exist, or the
-- absence of a row would have to be interpreted — and interpreted consistently —
-- in every read path.
create or replace function app.seed_candidate_side_tables()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.candidate_privacy (candidate_id) values (new.id)
    on conflict (candidate_id) do nothing;
  insert into public.candidate_community (candidate_id, source) values (new.id, 'registration')
    on conflict (candidate_id) do nothing;
  return new;
end
$$;

create trigger candidates_seed_side_tables
  after insert on public.candidates
  for each row execute function app.seed_candidate_side_tables();

-- --------------------------------------------------------------- contacts --
-- Never readable by a member without an accepted interest (spec §8).
create table public.candidate_contacts (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  contact_kind public.contact_kind not null,
  display_name text,
  phone        text not null check (phone ~ '^[6-9][0-9]{9}$'),
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (candidate_id, phone)
);

create trigger candidate_contacts_touch
  before update on public.candidate_contacts
  for each row execute function app.touch_updated_at();

create unique index candidate_contacts_one_primary
  on public.candidate_contacts (candidate_id)
  where is_primary;
