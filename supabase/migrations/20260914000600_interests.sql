-- ---------------------------------------------------------------------------
-- Interests, blocking, and contact grants (spec §8).
--
-- An interest is between two *candidates*, never between two accounts: spec §6
-- requires that "candidate-specific actions must always identify the acting
-- candidate", so a parent managing three children sends three distinguishable
-- interests, each carrying its own eligibility.
-- ---------------------------------------------------------------------------

create table public.candidate_blocks (
  id                   uuid primary key default gen_random_uuid(),
  blocker_candidate_id uuid not null references public.candidates(id) on delete cascade,
  blocked_candidate_id uuid not null references public.candidates(id) on delete cascade,
  created_by_account_id uuid references public.accounts(id) on delete set null,
  reason               text,
  created_at           timestamptz not null default now(),

  constraint candidate_blocks_distinct
    check (blocker_candidate_id <> blocked_candidate_id),
  unique (blocker_candidate_id, blocked_candidate_id)
);

comment on table public.candidate_blocks is
  'Blocking is one-directional in intent but symmetric in effect: neither side '
  'appears to the other, or a block would itself be a signal.';

create index candidate_blocks_blocked_idx
  on public.candidate_blocks (blocked_candidate_id);

-- ------------------------------------------------------------- interests ---
create table public.interests (
  id                  uuid primary key default gen_random_uuid(),
  from_candidate_id   uuid not null references public.candidates(id) on delete cascade,
  to_candidate_id     uuid not null references public.candidates(id) on delete cascade,
  initiated_by_account_id uuid references public.accounts(id) on delete set null,
  status              public.interest_status not null default 'pending',
  message             text check (length(message) <= 300),

  -- Spec §14 leaves interest expiry unsettled. NULL means "does not expire",
  -- which is what app_settings.interest_expiry_days = NULL produces.
  expires_at          timestamptz,

  responded_at        timestamptz,
  responded_by_account_id uuid references public.accounts(id) on delete set null,
  withdrawn_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Ordered pair, so "is there already something between these two?" is one
  -- index lookup regardless of who asked first.
  pair_low            uuid generated always as (least(from_candidate_id, to_candidate_id)) stored,
  pair_high           uuid generated always as (greatest(from_candidate_id, to_candidate_id)) stored,

  constraint interests_distinct check (from_candidate_id <> to_candidate_id),
  constraint interests_response_is_complete
    check ((status in ('accepted', 'declined')) = (responded_at is not null)),
  constraint interests_withdrawal_is_complete
    check ((status = 'withdrawn') = (withdrawn_at is not null))
);

create trigger interests_touch
  before update on public.interests
  for each row execute function app.touch_updated_at();

-- Spec §8: "Avoid duplicate pending requests between the same candidate pair."
-- Accepted is included because a second request to someone who already said yes
-- is noise, and because the contact grant is already in place.
create unique index interests_one_live_per_pair
  on public.interests (pair_low, pair_high)
  where status in ('pending', 'accepted');

create index interests_inbox_idx
  on public.interests (to_candidate_id, status, created_at desc);

create index interests_outbox_idx
  on public.interests (from_candidate_id, status, created_at desc);

create index interests_expiry_idx
  on public.interests (expires_at)
  where status = 'pending' and expires_at is not null;

-- --------------------------------------------------------- contact grants --
-- Created when an interest is accepted. Separate from the interest so that
-- revoking contact access does not rewrite the history of the interest, and so
-- that a future grant path (an admin-assisted introduction, say) has somewhere
-- to live.
create table public.contact_grants (
  id            uuid primary key default gen_random_uuid(),
  interest_id   uuid not null references public.interests(id) on delete cascade,
  candidate_low uuid not null references public.candidates(id) on delete cascade,
  candidate_high uuid not null references public.candidates(id) on delete cascade,
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_by_account_id uuid references public.accounts(id) on delete set null,

  constraint contact_grants_ordered check (candidate_low < candidate_high),
  unique (interest_id)
);

comment on table public.contact_grants is
  'Spec §8: revocation prevents future access. It cannot recall what has already '
  'been seen, and nothing in this schema pretends otherwise.';

create unique index contact_grants_one_active_per_pair
  on public.contact_grants (candidate_low, candidate_high)
  where revoked_at is null;

create index contact_grants_low_idx on public.contact_grants (candidate_low) where revoked_at is null;
create index contact_grants_high_idx on public.contact_grants (candidate_high) where revoked_at is null;

create or replace function app.has_contact_grant(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contact_grants g
    where g.candidate_low = least(p_a, p_b)
      and g.candidate_high = greatest(p_a, p_b)
      and g.revoked_at is null
  )
$$;
