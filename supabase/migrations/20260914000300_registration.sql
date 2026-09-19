-- ---------------------------------------------------------------------------
-- Registration and identity review (spec §3, §4, §10).
--
-- A candidate row is created as soon as a registration draft is started, not on
-- approval. That is what lets duplicate detection, family linking and the
-- biodata draft all hang off a stable id, and what lets the admin "all
-- registrations, including incomplete drafts" queue exist at all. An unverified
-- candidate is inert: `identity_status` gates every read path and
-- `discoverable` stays false.
-- ---------------------------------------------------------------------------

create table public.registration_applications (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references public.candidates(id) on delete cascade,
  account_id        uuid not null references public.accounts(id) on delete cascade,
  operator_relationship public.relationship not null,
  status            public.application_status not null default 'draft',

  -- The exact payload the operator submitted, frozen at submission. The
  -- candidate row may be edited afterwards by a correction; this is the
  -- evidence the admin actually decided on.
  declared          jsonb not null default '{}'::jsonb,

  submitted_at      timestamptz,
  -- Spec §3: a 24-hour *target*, not an SLA and never an auto-approval. Stored
  -- rather than derived so that changing the target later does not silently
  -- rewrite the promise made to applications already in the queue.
  review_due_at     timestamptz,
  review_target_hours integer not null default 24 check (review_target_hours > 0),

  decided_at        timestamptz,
  decided_by_account_id uuid references public.accounts(id) on delete set null,
  -- Applicant-facing only. Internal notes live in review_decisions, which
  -- members cannot read (spec §10: "Keep internal notes separate").
  decision_reason   text,
  correction_fields text[] not null default '{}',

  resubmit_count    integer not null default 0 check (resubmit_count >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint applications_submitted_has_timestamp
    check ((status = 'draft') = (submitted_at is null)),
  constraint applications_due_needs_submission
    check ((review_due_at is null) = (submitted_at is null)),
  constraint applications_decision_is_complete
    check (
      (status in ('approved', 'rejected', 'correction_requested'))
        = (decided_at is not null)
    ),
  constraint applications_refusal_needs_reason
    check (status not in ('rejected', 'correction_requested') or decision_reason is not null),
  constraint applications_correction_names_fields
    check (status <> 'correction_requested' or cardinality(correction_fields) > 0)
);

comment on table public.registration_applications is
  'One identity-verification application per candidate. Re-verification after an '
  'identity change reuses this row and increments resubmit_count.';

create trigger registration_applications_touch
  before update on public.registration_applications
  for each row execute function app.touch_updated_at();

-- Spec §3/§5: one candidate, one canonical application.
create unique index registration_applications_one_per_candidate
  on public.registration_applications (candidate_id);

create index registration_applications_account_idx
  on public.registration_applications (account_id);

-- The admin dashboard's two hot queries: the open queue, and what is overdue.
create index registration_applications_queue_idx
  on public.registration_applications (status, submitted_at)
  where status in ('submitted', 'under_review', 'correction_requested');

create index registration_applications_due_idx
  on public.registration_applications (review_due_at)
  where status in ('submitted', 'under_review');

-- ------------------------------------------------------------- documents ---
-- Spec §8: "Birth certificates are never member-visible." Nothing in this table
-- is readable by a member, including the row that proves their own upload
-- succeeded — for that the client reads `has_certificate` off the application
-- view instead of the document itself.
create table public.application_documents (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid not null references public.registration_applications(id) on delete cascade,
  candidate_id      uuid not null references public.candidates(id) on delete cascade,
  kind              text not null default 'birth_certificate'
                    check (kind in ('birth_certificate', 'supporting')),
  bucket_id         text not null default 'certificates',
  storage_path      text not null unique,
  mime_type         text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes        bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  checksum_sha256   text check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by_account_id uuid references public.accounts(id) on delete set null,
  uploaded_at       timestamptz not null default now(),
  -- Spec §14 lists certificate retention as an unsettled decision. The column
  -- exists so a policy can be applied later without a migration; nothing
  -- currently sets it, and no job deletes on it. Leaving it null is the honest
  -- state: "retention policy not yet decided".
  retention_delete_after date,
  deleted_at        timestamptz
);

comment on column public.application_documents.retention_delete_after is
  'Unset until a certificate retention policy is ratified (spec §14). No job acts on this yet.';

create index application_documents_application_idx
  on public.application_documents (application_id)
  where deleted_at is null;

-- Exactly one live birth certificate per application: it is mandatory for
-- submission (spec §3 step 4) and ambiguous if there are two.
create unique index application_documents_one_certificate
  on public.application_documents (application_id)
  where deleted_at is null and kind = 'birth_certificate';

-- ------------------------------------------------------------ duplicates ---
-- Spec §4: flag for comparison, never auto-merge and never auto-reject.
create table public.duplicate_candidates (
  id                  uuid primary key default gen_random_uuid(),
  application_id      uuid not null references public.registration_applications(id) on delete cascade,
  candidate_id        uuid not null references public.candidates(id) on delete cascade,
  matched_candidate_id uuid not null references public.candidates(id) on delete cascade,
  match_reasons       text[] not null default '{}',
  similarity          numeric(4, 3) check (similarity between 0 and 1),
  status              public.duplicate_status not null default 'open',
  resolved_by_account_id uuid references public.accounts(id) on delete set null,
  resolved_at         timestamptz,
  note                text,
  created_at          timestamptz not null default now(),

  constraint duplicate_candidates_distinct check (candidate_id <> matched_candidate_id),
  constraint duplicate_candidates_resolution_is_complete
    check ((status = 'open') = (resolved_at is null)),
  unique (application_id, matched_candidate_id)
);

comment on table public.duplicate_candidates is
  'Admin-only. A row here is a prompt to compare two records, not a decision '
  'about either of them (spec §4).';

create index duplicate_candidates_open_idx
  on public.duplicate_candidates (created_at)
  where status = 'open';

-- Candidates that plausibly refer to the same person. Name similarity alone is
-- never enough — the birth date must agree too, and even then a human decides.
create or replace function app.find_duplicate_candidates(
  p_candidate_id uuid,
  p_full_name    text,
  p_dob          date
)
returns table (matched_candidate_id uuid, similarity numeric, reasons text[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    round(extensions.similarity(c.full_name_norm, app.normalize_name(p_full_name))::numeric, 3),
    array_remove(array[
      case when c.date_of_birth = p_dob then 'same_date_of_birth' end,
      case when c.full_name_norm = app.normalize_name(p_full_name) then 'identical_name'
           when extensions.similarity(c.full_name_norm, app.normalize_name(p_full_name)) >= 0.6
           then 'similar_name' end
    ], null)
  from public.candidates c
  where c.id <> p_candidate_id
    and c.deleted_at is null
    -- Only records somebody has actually claimed. An abandoned draft is not
    -- evidence that a second registration is a duplicate.
    and c.identity_status in ('pending', 'correction_requested', 'verified')
    and c.date_of_birth = p_dob
    and extensions.similarity(c.full_name_norm, app.normalize_name(p_full_name)) >= 0.6
  order by 2 desc
  limit 20
$$;

comment on function app.find_duplicate_candidates(uuid, text, date) is
  'Candidate pairs worth a human comparison. Requires an exact birth-date match '
  'so that a common surname alone cannot flood the queue.';

-- -------------------------------------------------------- access requests --
-- Spec §4: a confirmed existing profile leads to an access request, not a
-- second profile. The requester must learn nothing about the existing record.
create table public.access_requests (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.accounts(id) on delete cascade,
  candidate_id       uuid not null references public.candidates(id) on delete cascade,
  claimed_relationship public.relationship not null,
  evidence_note      text,
  status             public.access_request_status not null default 'pending',
  decided_at         timestamptz,
  decided_by_account_id uuid references public.accounts(id) on delete set null,
  decision_reason    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint access_requests_decision_is_complete
    check ((status in ('pending', 'withdrawn')) = (decided_at is null)),
  constraint access_requests_rejection_needs_reason
    check (status <> 'rejected' or decision_reason is not null)
);

comment on table public.access_requests is
  'A request to be linked to an existing candidate. RLS deliberately does not '
  'grant the requester any read on the candidate — spec §4 forbids revealing '
  'biodata or the existing operator''s contact details during this process.';

create trigger access_requests_touch
  before update on public.access_requests
  for each row execute function app.touch_updated_at();

create unique index access_requests_one_open_per_pair
  on public.access_requests (account_id, candidate_id)
  where status = 'pending';

create index access_requests_queue_idx
  on public.access_requests (created_at)
  where status = 'pending';

-- ------------------------------------------------------ review decisions ---
-- Spec §10: "Record actor, timestamp, reason, and affected revision for every
-- decision." Append-only: there is no UPDATE or DELETE policy for anyone, and
-- the grants below withhold `internal_note` from members at the column level so
-- that an internal note cannot leak through a `select *`.
create table public.review_decisions (
  id                uuid primary key default gen_random_uuid(),
  subject_type      public.review_subject not null,
  subject_id        uuid not null,
  candidate_id      uuid references public.candidates(id) on delete set null,
  action            public.review_action not null,
  actor_account_id  uuid references public.accounts(id) on delete set null,
  actor_role        public.app_role,
  from_status       text,
  to_status         text,
  fields            text[] not null default '{}',
  reason_applicant  text,
  internal_note     text,
  revision_id       uuid,
  created_at        timestamptz not null default now()
);

comment on column public.review_decisions.internal_note is
  'Admin-only. Members are not granted SELECT on this column (see the RLS migration).';

create index review_decisions_subject_idx
  on public.review_decisions (subject_type, subject_id, created_at desc);

create index review_decisions_candidate_idx
  on public.review_decisions (candidate_id, created_at desc);

-- --------------------------------------------------------- review claims ---
-- Spec §10: "Prevent conflicting concurrent review decisions." A claim is
-- advisory — the authoritative protection is the expected-status check inside
-- each decision RPC — but it stops two admins from wasting effort on the same
-- application, which is the failure that actually happens.
create table public.review_claims (
  subject_type     public.review_subject not null,
  subject_id       uuid not null,
  admin_account_id uuid not null references public.accounts(id) on delete cascade,
  claimed_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  primary key (subject_type, subject_id)
);

create index review_claims_expiry_idx on public.review_claims (expires_at);
