-- ---------------------------------------------------------------------------
-- Saved profiles and protected sharing (spec §6, §9).
-- ---------------------------------------------------------------------------

-- A bookmark is personal to the account, not to a selected candidate: a parent
-- shortlisting for one child is still the same person's shortlist. Interests,
-- which do depend on who is acting, are candidate-scoped instead.
create table public.saved_profiles (
  account_id   uuid not null references public.accounts(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  note         text check (length(note) <= 500),
  created_at   timestamptz not null default now(),
  primary key (account_id, candidate_id)
);

create index saved_profiles_candidate_idx on public.saved_profiles (candidate_id);

-- ----------------------------------------------------------- share links ---
-- Spec §9: "Do not embed candidate names, photos, contact details, or biodata
-- in publicly accessible cards or link previews. Recipients must authenticate
-- and be approved before viewing permitted profile information."
--
-- The token is never stored. Only its SHA-256 is, so a database disclosure
-- cannot be turned into working links — the same reason a password is hashed.
create table public.share_links (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  candidate_id  uuid not null references public.candidates(id) on delete cascade,
  created_by_account_id uuid not null references public.accounts(id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  revoked_by_account_id uuid references public.accounts(id) on delete set null,
  max_uses      integer check (max_uses > 0),
  use_count     integer not null default 0 check (use_count >= 0),

  constraint share_links_expiry_is_future check (expires_at > created_at)
);

comment on table public.share_links is
  'A share link is a pointer, not a capability: resolving one still requires an '
  'authenticated, approved member, and still runs the same eligibility and '
  'visibility checks as the directory (spec §9).';

create index share_links_candidate_idx
  on public.share_links (candidate_id)
  where revoked_at is null;

-- Who actually opened a shared link. Useful when a family asks where their
-- profile was seen, and the only way to notice a link being passed around.
create table public.share_link_uses (
  id            uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.share_links(id) on delete cascade,
  account_id    uuid references public.accounts(id) on delete set null,
  outcome       text not null check (outcome in ('opened', 'denied_not_approved', 'denied_expired', 'denied_not_eligible')),
  used_at       timestamptz not null default now()
);

create index share_link_uses_link_idx on public.share_link_uses (share_link_id, used_at desc);

create or replace function app.hash_share_token(p_token text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;
