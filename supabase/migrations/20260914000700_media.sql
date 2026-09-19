-- ---------------------------------------------------------------------------
-- Photographs and janmakshar (spec §8).
--
-- "Protect media at the storage and request layers; do not send full images to
-- unauthorized clients and merely blur them." So: private buckets, no public
-- URLs anywhere, and a signed URL minted server-side only after the grant below
-- has been checked. The storage migration re-states the same rule as a
-- storage.objects policy, so an unauthorised read fails even if application
-- code forgets to ask.
-- ---------------------------------------------------------------------------

create table public.candidate_media (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.candidates(id) on delete cascade,
  kind          public.media_kind not null,
  bucket_id     text not null,
  storage_path  text not null unique,
  mime_type     text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  width         integer check (width > 0),
  height        integer check (height > 0),
  is_primary    boolean not null default false,
  -- Media is reviewed alongside the biodata revision it belongs to; an
  -- unreviewed photo is never shown to anyone but the candidate's own operators.
  status        public.media_status not null default 'pending_review',
  review_note   text,
  sort_order    smallint not null default 0,
  uploaded_by_account_id uuid references public.accounts(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint candidate_media_bucket_matches_kind
    check (bucket_id = case kind when 'photo' then 'candidate-photos' else 'kundali' end)
);

create trigger candidate_media_touch
  before update on public.candidate_media
  for each row execute function app.touch_updated_at();

create unique index candidate_media_one_primary_photo
  on public.candidate_media (candidate_id)
  where kind = 'photo' and is_primary and deleted_at is null;

create index candidate_media_candidate_idx
  on public.candidate_media (candidate_id, kind, sort_order)
  where deleted_at is null;

-- ------------------------------------------------------ access requests ----
-- Viewer-specific, and per media kind: spec §8 requires janmakshar visibility to
-- be controlled separately from photographs, and both separately from contact.
create table public.media_access_requests (
  id                   uuid primary key default gen_random_uuid(),
  owner_candidate_id   uuid not null references public.candidates(id) on delete cascade,
  viewer_candidate_id  uuid not null references public.candidates(id) on delete cascade,
  kind                 public.media_kind not null,
  status               public.media_request_status not null default 'pending',
  message              text check (length(message) <= 300),
  requested_by_account_id uuid references public.accounts(id) on delete set null,
  created_at           timestamptz not null default now(),
  decided_at           timestamptz,
  decided_by_account_id uuid references public.accounts(id) on delete set null,

  constraint media_access_requests_distinct
    check (owner_candidate_id <> viewer_candidate_id),
  constraint media_access_requests_decision_is_complete
    check ((status = 'pending') = (decided_at is null))
);

create unique index media_access_requests_one_pending
  on public.media_access_requests (owner_candidate_id, viewer_candidate_id, kind)
  where status = 'pending';

create index media_access_requests_inbox_idx
  on public.media_access_requests (owner_candidate_id, status, created_at desc);

-- --------------------------------------------------------------- grants ----
create table public.media_grants (
  id                  uuid primary key default gen_random_uuid(),
  owner_candidate_id  uuid not null references public.candidates(id) on delete cascade,
  viewer_candidate_id uuid not null references public.candidates(id) on delete cascade,
  kind                public.media_kind not null,
  request_id          uuid references public.media_access_requests(id) on delete set null,
  granted_at          timestamptz not null default now(),
  -- From app_settings.photo_grant_days, which is NULL by default: a grant
  -- stands until revoked unless the community decides otherwise.
  expires_at          timestamptz,
  revoked_at          timestamptz,
  revoked_by_account_id uuid references public.accounts(id) on delete set null,

  constraint media_grants_distinct check (owner_candidate_id <> viewer_candidate_id)
);

create unique index media_grants_one_active
  on public.media_grants (owner_candidate_id, viewer_candidate_id, kind)
  where revoked_at is null;

create index media_grants_viewer_idx
  on public.media_grants (viewer_candidate_id, kind)
  where revoked_at is null;

create or replace function app.has_media_grant(p_owner uuid, p_viewer uuid, p_kind public.media_kind)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.media_grants g
    where g.owner_candidate_id = p_owner
      and g.viewer_candidate_id = p_viewer
      and g.kind = p_kind
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
  )
$$;

comment on function app.has_media_grant(uuid, uuid, public.media_kind) is
  'Explicit viewer-specific grants only. A candidate whose privacy setting is '
  '"members" is handled separately, so that widening a default can never be '
  'mistaken for having granted a named viewer access.';
