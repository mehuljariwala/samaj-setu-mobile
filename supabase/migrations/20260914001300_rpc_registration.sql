-- ---------------------------------------------------------------------------
-- Registration RPCs (spec §3, §4).
--
-- Every state transition in the product is a function here rather than an
-- UPDATE policy. Three reasons, all of which bit the prototype:
--   * a transition touches several tables and must be all-or-nothing;
--   * the invariants are about *pairs* of states, which a CHECK on one row
--     cannot express;
--   * "who may do this" and "what may change" are different questions, and RLS
--     only answers the first.
--
-- Error convention, chosen so PostgREST maps it to a sensible status:
--   42501 insufficient_privilege → 403   caller may not do this
--   P0002 no_data_found          → 404   subject does not exist
--   P0001 raise_exception        → 400   the request is not valid right now
-- The message always begins with a stable machine-readable token before the
-- colon, so the client can branch without parsing prose.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------- shared internals --
create or replace function app.record_decision(
  p_subject      public.review_subject,
  p_subject_id   uuid,
  p_candidate_id uuid,
  p_action       public.review_action,
  p_from         text,
  p_to           text,
  p_fields       text[] default '{}',
  p_reason       text default null,
  p_internal     text default null,
  p_revision_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.review_decisions (
    subject_type, subject_id, candidate_id, action, actor_account_id, actor_role,
    from_status, to_status, fields, reason_applicant, internal_note, revision_id
  )
  values (
    p_subject, p_subject_id, p_candidate_id, p_action, app.current_account_id(),
    case
      when app.has_role('superadmin') then 'superadmin'::public.app_role
      when app.has_role('admin')      then 'admin'::public.app_role
      when app.has_role('moderator')  then 'moderator'::public.app_role
    end,
    p_from, p_to, coalesce(p_fields, '{}'), p_reason, p_internal, p_revision_id
  )
  returning id into v_id;

  return v_id;
end
$$;

create or replace function app.notify(
  p_account_id   uuid,
  p_kind         public.notification_kind,
  p_candidate_id uuid default null,
  p_payload      jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_account_id is null then
    return;
  end if;
  -- The payload constraint on public.notifications rejects personal-detail keys
  -- (spec §12); a caller that tries to include one fails loudly here.
  insert into public.notifications (account_id, kind, candidate_id, payload)
  values (p_account_id, p_kind, p_candidate_id, coalesce(p_payload, '{}'::jsonb));
end
$$;

-- Notify every account that operates a candidate — a decision concerns the
-- whole family, not only whoever happened to submit.
create or replace function app.notify_operators(
  p_candidate_id uuid,
  p_kind         public.notification_kind,
  p_payload      jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
begin
  for v_account in
    select m.account_id from public.candidate_memberships m
    where m.candidate_id = p_candidate_id and m.revoked_at is null
  loop
    perform app.notify(v_account, p_kind, p_candidate_id, p_payload);
  end loop;
end
$$;

create or replace function app.require_operator(p_candidate_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.operates_candidate(p_candidate_id) then
    raise exception 'forbidden: you do not act for that candidate'
      using errcode = '42501';
  end if;
end
$$;

-- ---------------------------------------------------- start a registration --
-- Creates the candidate, links the operator, opens a draft application, and
-- records any candidate worth comparing against (spec §3 step 5, §4).
create or replace function public.start_registration(
  p_relationship   public.relationship,
  p_full_name      text,
  p_date_of_birth  date,
  p_gender         public.gender,
  p_father_name    text default null,
  p_mother_name    text default null,
  p_city           text default null,
  p_native_place   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account     uuid := app.current_account_id();
  v_candidate   uuid;
  v_application uuid;
  v_dup         record;
  v_duplicates  jsonb := '[]'::jsonb;
begin
  if v_account is null then
    raise exception 'unauthenticated: sign in first' using errcode = '42501';
  end if;
  if not app.account_is_active() then
    raise exception 'forbidden: this account is not active' using errcode = '42501';
  end if;
  if btrim(coalesce(p_full_name, '')) = '' then
    raise exception 'invalid: full_name is required' using errcode = 'P0001';
  end if;

  insert into public.candidates (
    full_name, date_of_birth, gender, father_name, mother_name,
    city, native_place, identity_status, created_by_account_id
  )
  values (
    btrim(p_full_name), p_date_of_birth, p_gender,
    nullif(btrim(coalesce(p_father_name, '')), ''),
    nullif(btrim(coalesce(p_mother_name, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_native_place, '')), ''),
    'unverified', v_account
  )
  returning id into v_candidate;

  insert into public.candidate_memberships
    (candidate_id, account_id, role, relationship, linked_by_account_id)
  values (
    v_candidate, v_account,
    (case when p_relationship = 'self' then 'candidate' else 'guardian' end)::public.membership_role,
    p_relationship, v_account
  );

  insert into public.registration_applications
    (candidate_id, account_id, operator_relationship, status, review_target_hours)
  values (
    v_candidate, v_account, p_relationship, 'draft',
    (select review_target_hours from public.app_settings where id)
  )
  returning id into v_application;

  -- Spec §4: flag, never merge. These rows are admin-only; the operator is told
  -- how many were flagged and nothing about who they are.
  for v_dup in
    select * from app.find_duplicate_candidates(v_candidate, p_full_name, p_date_of_birth)
  loop
    insert into public.duplicate_candidates
      (application_id, candidate_id, matched_candidate_id, match_reasons, similarity)
    values (v_application, v_candidate, v_dup.matched_candidate_id, v_dup.reasons, v_dup.similarity)
    on conflict do nothing;
    v_duplicates := v_duplicates || jsonb_build_object('similarity', v_dup.similarity);
  end loop;

  return jsonb_build_object(
    'candidate_id', v_candidate,
    'application_id', v_application,
    'public_code', (select public_code from public.candidates where id = v_candidate),
    -- A count, not a list. Spec §4 forbids revealing anything about the
    -- existing record during this process.
    'possible_duplicates', jsonb_array_length(v_duplicates)
  );
end
$$;

-- -------------------------------------------------- edit a draft or fix one --
create or replace function public.update_registration(
  p_application_id uuid,
  p_full_name      text default null,
  p_date_of_birth  date default null,
  p_gender         public.gender default null,
  p_father_name    text default null,
  p_mother_name    text default null,
  p_city           text default null,
  p_native_place   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.registration_applications;
begin
  select * into v_app from public.registration_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'not_found: no such application' using errcode = 'P0002';
  end if;
  perform app.require_operator(v_app.candidate_id);

  -- Spec §2: "Correction requested" is the only state besides draft in which
  -- the form reopens. A submitted application is evidence and must not move
  -- under the reviewer.
  if v_app.status not in ('draft', 'correction_requested') then
    raise exception 'conflict: this application is not open for editing (%)', v_app.status
      using errcode = 'P0001';
  end if;

  update public.candidates c
     set full_name     = coalesce(nullif(btrim(coalesce(p_full_name, '')), ''), c.full_name),
         date_of_birth = coalesce(p_date_of_birth, c.date_of_birth),
         gender        = coalesce(p_gender, c.gender),
         father_name   = coalesce(nullif(btrim(coalesce(p_father_name, '')), ''), c.father_name),
         mother_name   = coalesce(nullif(btrim(coalesce(p_mother_name, '')), ''), c.mother_name),
         city          = coalesce(nullif(btrim(coalesce(p_city, '')), ''), c.city),
         native_place  = coalesce(nullif(btrim(coalesce(p_native_place, '')), ''), c.native_place)
   where c.id = v_app.candidate_id;
end
$$;

-- ------------------------------------------------------- attach certificate --
-- Called after the file itself has been uploaded to the private `certificates`
-- bucket. Recording the object is separate from storing it so that a partial
-- upload never leaves an application looking complete.
create or replace function public.attach_certificate(
  p_application_id uuid,
  p_storage_path   text,
  p_mime_type      text,
  p_size_bytes     bigint,
  p_checksum       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.registration_applications;
  v_id  uuid;
begin
  select * into v_app from public.registration_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'not_found: no such application' using errcode = 'P0002';
  end if;
  perform app.require_operator(v_app.candidate_id);

  if v_app.status not in ('draft', 'correction_requested') then
    raise exception 'conflict: this application is not open for editing (%)', v_app.status
      using errcode = 'P0001';
  end if;

  -- The path must sit under this candidate's folder, which is the same rule the
  -- storage policy enforces. Checking it here too means a mismatch is a clear
  -- error rather than an opaque storage failure later.
  if p_storage_path !~ ('^' || v_app.candidate_id::text || '/') then
    raise exception 'invalid: certificate path must start with the candidate id'
      using errcode = 'P0001';
  end if;

  -- Replacing a certificate supersedes the previous one rather than deleting
  -- the record of it: an admin may already have looked at the old file.
  update public.application_documents
     set deleted_at = now()
   where application_id = p_application_id
     and kind = 'birth_certificate'
     and deleted_at is null;

  insert into public.application_documents
    (application_id, candidate_id, kind, bucket_id, storage_path,
     mime_type, size_bytes, checksum_sha256, uploaded_by_account_id)
  values
    (p_application_id, v_app.candidate_id, 'birth_certificate', 'certificates', p_storage_path,
     p_mime_type, p_size_bytes, p_checksum, app.current_account_id())
  returning id into v_id;

  return v_id;
end
$$;

-- ------------------------------------------------------------------ submit --
create or replace function public.submit_registration(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app       public.registration_applications;
  v_candidate public.candidates;
  v_missing   text[] := '{}';
  v_hours     integer;
  v_due       timestamptz;
begin
  select * into v_app from public.registration_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'not_found: no such application' using errcode = 'P0002';
  end if;
  perform app.require_operator(v_app.candidate_id);

  if v_app.status not in ('draft', 'correction_requested') then
    raise exception 'conflict: this application has already been submitted (%)', v_app.status
      using errcode = 'P0001';
  end if;

  select * into v_candidate from public.candidates where id = v_app.candidate_id;

  if btrim(coalesce(v_candidate.full_name, '')) = '' then v_missing := v_missing || 'full_name'; end if;
  if v_candidate.date_of_birth is null                then v_missing := v_missing || 'date_of_birth'; end if;
  if btrim(coalesce(v_candidate.father_name, '')) = '' then v_missing := v_missing || 'father_name'; end if;
  if btrim(coalesce(v_candidate.city, '')) = ''        then v_missing := v_missing || 'city'; end if;

  -- Spec §3 step 4: the certificate is mandatory for submission.
  if not exists (
    select 1 from public.application_documents d
    where d.application_id = p_application_id
      and d.kind = 'birth_certificate' and d.deleted_at is null
  ) then
    v_missing := v_missing || 'birth_certificate';
  end if;

  if cardinality(v_missing) > 0 then
    raise exception 'incomplete: %', array_to_string(v_missing, ',') using errcode = 'P0001';
  end if;

  -- Spec §3: the 24-hour target starts at *complete* submission, which is here
  -- and not at the moment the draft was created.
  v_hours := coalesce(v_app.review_target_hours, 24);
  v_due   := now() + make_interval(hours => v_hours);

  update public.registration_applications
     set status            = 'submitted',
         submitted_at      = now(),
         review_due_at     = v_due,
         decided_at        = null,
         decided_by_account_id = null,
         decision_reason   = null,
         correction_fields = '{}',
         resubmit_count    = resubmit_count + (case when v_app.status = 'correction_requested' then 1 else 0 end),
         declared          = jsonb_build_object(
           'full_name',     v_candidate.full_name,
           'date_of_birth', v_candidate.date_of_birth,
           'gender',        v_candidate.gender,
           'father_name',   v_candidate.father_name,
           'mother_name',   v_candidate.mother_name,
           'city',          v_candidate.city,
           'native_place',  v_candidate.native_place,
           'relationship',  v_app.operator_relationship
         )
   where id = p_application_id;

  update public.candidates set identity_status = 'pending' where id = v_app.candidate_id;

  perform app.record_decision(
    'registration', p_application_id, v_app.candidate_id, 'reopen',
    v_app.status::text, 'submitted', '{}', null, 'submitted by operator'
  );

  perform app.notify_operators(
    v_app.candidate_id, 'registration_submitted',
    jsonb_build_object('application_id', p_application_id, 'review_due_at', v_due)
  );

  return jsonb_build_object('status', 'submitted', 'review_due_at', v_due, 'target_hours', v_hours);
end
$$;

comment on function public.submit_registration(uuid) is
  'Spec §3: shows "under review, allow up to 24 hours". review_due_at is a '
  'target for the admin queue, and nothing in this schema approves on expiry.';

-- -------------------------------------------------------------- withdraw ----
create or replace function public.withdraw_registration(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.registration_applications;
begin
  select * into v_app from public.registration_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'not_found: no such application' using errcode = 'P0002';
  end if;
  perform app.require_operator(v_app.candidate_id);

  if v_app.status in ('approved', 'rejected') then
    raise exception 'conflict: a decided application cannot be withdrawn' using errcode = 'P0001';
  end if;

  update public.registration_applications
     set status = 'withdrawn', decided_at = now(), decision_reason = 'Withdrawn by the applicant.'
   where id = p_application_id;

  update public.candidates set identity_status = 'unverified' where id = v_app.candidate_id;

  perform app.record_decision(
    'registration', p_application_id, v_app.candidate_id, 'release',
    v_app.status::text, 'withdrawn', '{}', 'Withdrawn by the applicant.', null
  );
end
$$;

-- --------------------------------------------------- identity change ------
-- Spec §5: "Changes to identity-verified fields trigger re-verification."
-- A member asking to change their name or birth date drops back to the
-- correction state, which is also the only state that reopens the form, and
-- the candidate stops being discoverable until an admin looks again.
create or replace function public.request_identity_change(
  p_candidate_id uuid,
  p_fields       text[],
  p_reason       text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.registration_applications;
begin
  perform app.require_operator(p_candidate_id);

  if p_fields is null or cardinality(p_fields) = 0 then
    raise exception 'invalid: name at least one field to change' using errcode = 'P0001';
  end if;

  select * into v_app from public.registration_applications
   where candidate_id = p_candidate_id for update;
  if v_app.id is null then
    raise exception 'not_found: this candidate has no application' using errcode = 'P0002';
  end if;

  update public.registration_applications
     set status            = 'correction_requested',
         decided_at        = now(),
         decision_reason   = coalesce(nullif(btrim(p_reason), ''),
                                      'You asked to change your verified details.'),
         correction_fields = p_fields
   where id = v_app.id;

  update public.candidates
     set identity_status = 'correction_requested',
         -- Spec §5: identity changes hide the profile until resolved.
         publication_status = case when publication_status = 'published'
                                   then 'unpublished' else publication_status end
   where id = p_candidate_id;

  perform app.record_decision(
    'registration', v_app.id, p_candidate_id, 'reopen',
    v_app.status::text, 'correction_requested', p_fields,
    'You asked to change your verified details.', 'member-initiated identity change'
  );
end
$$;

-- -------------------------------------------------- request account access --
-- Spec §4: a confirmed existing profile leads here, not to a second profile.
create or replace function public.request_candidate_access(
  p_public_code  text,
  p_relationship public.relationship,
  p_note         text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate uuid;
  v_id        uuid;
begin
  if app.current_account_id() is null then
    raise exception 'unauthenticated: sign in first' using errcode = '42501';
  end if;

  select id into v_candidate from public.candidates
   where public_code = btrim(upper(p_public_code)) and deleted_at is null;

  -- Deliberately the same error whether the code is wrong or the candidate is
  -- unavailable: a probe must not be able to enumerate valid codes.
  if v_candidate is null then
    raise exception 'not_found: no candidate matches that code' using errcode = 'P0002';
  end if;

  if app.operates_candidate(v_candidate) then
    raise exception 'conflict: you already act for that candidate' using errcode = 'P0001';
  end if;

  insert into public.access_requests
    (account_id, candidate_id, claimed_relationship, evidence_note)
  values (app.current_account_id(), v_candidate, p_relationship, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'conflict: you already have a pending request for that candidate'
      using errcode = 'P0001';
  end if;

  return v_id;
end
$$;

comment on function public.request_candidate_access(text, public.relationship, text) is
  'Returns only a request id. No candidate detail is revealed at any point — '
  'spec §4 requires an admin to verify the relationship before any linking.';

-- ------------------------------------------------------------- my context --
-- One round trip for the app shell: who am I, what may I see, and which
-- candidates am I acting for. Everything the guarded navigation in the
-- prototype derived client-side, derived on the server instead.
create or replace function public.my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account uuid := app.current_account_id();
begin
  if v_account is null then
    return jsonb_build_object('access_state', 'signed_out', 'candidates', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'account', (
      select jsonb_build_object(
        'id', a.id, 'phone', a.phone, 'display_name', a.display_name,
        'preferred_language', a.preferred_language, 'status', a.status,
        'phone_verified', a.phone_verified_at is not null
      )
      from public.accounts a where a.id = v_account
    ),
    'access_state', app.access_state(),
    'roles', coalesce((
      select jsonb_agg(r.role) from public.account_roles r where r.account_id = v_account
    ), '[]'::jsonb),
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'public_code', c.public_code,
        'full_name', c.full_name,
        'gender', c.gender,
        'relationship', m.relationship,
        'is_self', m.role = 'candidate',
        'identity_status', c.identity_status,
        'publication_status', c.publication_status,
        'discoverable', c.discoverable,
        'paused', c.paused,
        'consent_active', app.has_active_consent(c.id),
        'application', (
          select jsonb_build_object(
            'id', ra.id, 'status', ra.status, 'submitted_at', ra.submitted_at,
            'review_due_at', ra.review_due_at,
            'overdue', ra.review_due_at is not null
                       and ra.status in ('submitted', 'under_review')
                       and ra.review_due_at < now(),
            'decision_reason', ra.decision_reason,
            'correction_fields', to_jsonb(ra.correction_fields),
            'has_certificate', exists (
              select 1 from public.application_documents d
              where d.application_id = ra.id and d.kind = 'birth_certificate' and d.deleted_at is null
            )
          )
          from public.registration_applications ra where ra.candidate_id = c.id
        ),
        'biodata', (
          select jsonb_build_object(
            'revision_id', r.id, 'status', r.status, 'completion', r.completion,
            'decision_reason', r.decision_reason,
            'correction_fields', to_jsonb(r.correction_fields)
          )
          from public.biodata_revisions r
          where r.candidate_id = c.id
          order by r.version desc limit 1
        ),
        'pending_interests', (
          select count(*) from public.interests i
          where i.to_candidate_id = c.id and i.status = 'pending'
        ),
        'pending_photo_requests', (
          select count(*) from public.media_access_requests mr
          where mr.owner_candidate_id = c.id and mr.status = 'pending'
        )
      ) order by c.created_at)
      from public.candidate_memberships m
      join public.candidates c on c.id = m.candidate_id
      where m.account_id = v_account and m.revoked_at is null and c.deleted_at is null
    ), '[]'::jsonb),
    'unread_notifications', (
      select count(*) from public.notifications n
      where n.account_id = v_account and n.read_at is null
    )
  );
end
$$;
