-- ---------------------------------------------------------------------------
-- Admin queues and review decisions (spec §10).
--
-- Every decision function follows the same shape:
--   lock the row  →  compare against the status the reviewer was shown  →
--   apply  →  record actor/timestamp/reason  →  notify the family.
--
-- The expected-status argument is what stops the failure spec §10 names:
-- "Prevent conflicting concurrent review decisions." Two admins who both open
-- the same application see the same status; whichever saves second is told the
-- decision has already been made instead of silently overwriting it.
-- ---------------------------------------------------------------------------

create or replace function app.require_staff()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_staff() then
    raise exception 'forbidden: staff only' using errcode = '42501';
  end if;
end
$$;

create or replace function app.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;
end
$$;

-- --------------------------------------------------------------- dashboard -
create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_staff();

  return jsonb_build_object(
    'verification', jsonb_build_object(
      'open', (select count(*) from public.registration_applications
               where status in ('submitted', 'under_review')),
      'overdue', (select count(*) from public.registration_applications
                  where status in ('submitted', 'under_review') and review_due_at < now()),
      'approaching', (select count(*) from public.registration_applications
                      where status in ('submitted', 'under_review')
                        and review_due_at between now() and now() + interval '4 hours'),
      'awaiting_resubmission', (select count(*) from public.registration_applications
                                where status = 'correction_requested'),
      'drafts', (select count(*) from public.registration_applications where status = 'draft')
    ),
    'publication', jsonb_build_object(
      'open', (select count(*) from public.biodata_revisions
               where status in ('submitted', 'under_review')),
      'awaiting_resubmission', (select count(*) from public.biodata_revisions
                                where status = 'correction_requested'),
      -- Approved but not visible, which is almost always "waiting for the
      -- candidate's consent" and is the queue most easily forgotten.
      'awaiting_consent', (select count(*) from public.candidates c
                           where c.published_revision_id is not null
                             and c.identity_status = 'verified'
                             and not app.has_active_consent(c.id))
    ),
    'duplicates_open', (select count(*) from public.duplicate_candidates where status = 'open'),
    'access_requests_open', (select count(*) from public.access_requests where status = 'pending'),
    'media_pending_review', (select count(*) from public.candidate_media
                             where status = 'pending_review' and deleted_at is null),
    'published_candidates', (select count(*) from public.candidates where discoverable)
  );
end
$$;

-- -------------------------------------------------------- registration queue
-- Spec §10: "all registrations, including incomplete drafts; search and filters
-- for status, operator, candidate, and submission time."
create or replace function public.admin_registration_queue(
  p_statuses public.application_status[] default null,
  p_query    text default null,
  p_overdue  boolean default false,
  p_limit    integer default 25,
  p_offset   integer default 0
)
returns table (
  application_id   uuid,
  candidate_id     uuid,
  public_code      text,
  full_name        text,
  date_of_birth    date,
  city             text,
  operator_phone   text,
  relationship     public.relationship,
  status           public.application_status,
  submitted_at     timestamptz,
  review_due_at    timestamptz,
  overdue          boolean,
  resubmit_count   integer,
  has_certificate  boolean,
  open_duplicates  bigint,
  claimed_by       uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_staff();

  return query
  select
    ra.id, c.id, c.public_code, c.full_name, c.date_of_birth, c.city,
    a.phone, ra.operator_relationship, ra.status, ra.submitted_at, ra.review_due_at,
    ra.review_due_at is not null
      and ra.status in ('submitted', 'under_review')
      and ra.review_due_at < now(),
    ra.resubmit_count,
    exists (select 1 from public.application_documents d
            where d.application_id = ra.id and d.kind = 'birth_certificate'
              and d.deleted_at is null),
    (select count(*) from public.duplicate_candidates dc
     where dc.application_id = ra.id and dc.status = 'open'),
    (select rc.admin_account_id from public.review_claims rc
     where rc.subject_type = 'registration' and rc.subject_id = ra.id and rc.expires_at > now())
  from public.registration_applications ra
  join public.candidates c on c.id = ra.candidate_id
  join public.accounts a on a.id = ra.account_id
  where (p_statuses is null or ra.status = any (p_statuses))
    and (not p_overdue or (ra.review_due_at < now()
                           and ra.status in ('submitted', 'under_review')))
    and (
      p_query is null or btrim(p_query) = ''
      or c.full_name_norm like '%' || app.normalize_name(p_query) || '%'
      or c.public_code ilike '%' || btrim(p_query) || '%'
      or a.phone like '%' || regexp_replace(p_query, '\D', '', 'g') || '%'
    )
  order by
    -- Overdue first, then closest to the target. Spec §10's dashboard ordering.
    (ra.review_due_at < now()) desc nulls last,
    ra.review_due_at asc nulls last,
    ra.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
end
$$;

create or replace function public.admin_registration_detail(p_application_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_app public.registration_applications;
begin
  perform app.require_staff();

  select * into v_app from public.registration_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'not_found: no such application' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'application', to_jsonb(v_app),
    'candidate', (select to_jsonb(c) from public.candidates c where c.id = v_app.candidate_id),
    'community', (select to_jsonb(cc) from public.candidate_community cc
                  where cc.candidate_id = v_app.candidate_id),
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_id', a.id, 'phone', a.phone, 'display_name', a.display_name,
        'relationship', m.relationship, 'role', m.role,
        'phone_verified', a.phone_verified_at is not null
      ))
      from public.candidate_memberships m
      join public.accounts a on a.id = m.account_id
      where m.candidate_id = v_app.candidate_id and m.revoked_at is null
    ), '[]'::jsonb),
    -- Metadata only. The file itself is fetched through
    -- admin_certificate_reference(), which records that it was looked at.
    'certificate', (
      select jsonb_build_object('id', d.id, 'mime_type', d.mime_type,
                                'size_bytes', d.size_bytes, 'uploaded_at', d.uploaded_at)
      from public.application_documents d
      where d.application_id = p_application_id
        and d.kind = 'birth_certificate' and d.deleted_at is null
    ),
    'duplicates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', dc.id, 'status', dc.status, 'similarity', dc.similarity,
        'reasons', to_jsonb(dc.match_reasons),
        'candidate', jsonb_build_object(
          'id', mc.id, 'public_code', mc.public_code, 'full_name', mc.full_name,
          'date_of_birth', mc.date_of_birth, 'city', mc.city,
          'identity_status', mc.identity_status
        )
      ))
      from public.duplicate_candidates dc
      join public.candidates mc on mc.id = dc.matched_candidate_id
      where dc.application_id = p_application_id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(to_jsonb(rd) order by rd.created_at desc)
      from public.review_decisions rd
      where rd.subject_type = 'registration' and rd.subject_id = p_application_id
    ), '[]'::jsonb)
  );
end
$$;

-- Spec §10: "private certificate inspection". Volatile, not stable, because
-- looking at a birth certificate is an event worth recording.
create or replace function public.admin_certificate_reference(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.application_documents;
begin
  perform app.require_staff();

  select * into v_doc from public.application_documents
   where application_id = p_application_id and kind = 'birth_certificate' and deleted_at is null;
  if v_doc.id is null then
    raise exception 'not_found: no certificate on this application' using errcode = 'P0002';
  end if;

  insert into public.audit_events
    (actor_account_id, actor_role, action, subject_table, subject_id, candidate_id, changes)
  values (
    app.current_account_id(), 'staff', 'certificate_viewed',
    'application_documents', v_doc.id, v_doc.candidate_id, '{}'::jsonb
  );

  return jsonb_build_object(
    'bucket_id', v_doc.bucket_id, 'storage_path', v_doc.storage_path,
    'mime_type', v_doc.mime_type
  );
end
$$;

comment on function public.admin_certificate_reference(uuid) is
  'Returns storage coordinates for a short-lived signed URL and records the '
  'access. Never returns a URL — a URL outlives the check that produced it.';

-- ------------------------------------------------------ registration decision
create or replace function public.admin_decide_registration(
  p_application_id  uuid,
  p_action          public.review_action,
  p_expected_status public.application_status,
  p_reason          text default null,
  p_fields          text[] default '{}',
  p_internal_note   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app  public.registration_applications;
  v_open bigint;
  v_next public.application_status;
begin
  perform app.require_staff();
  if p_action = 'approve' or p_action = 'reject' then
    perform app.require_admin();   -- moderators may ask for corrections, not decide
  end if;

  select * into v_app from public.registration_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'not_found: no such application' using errcode = 'P0002';
  end if;

  if v_app.status <> p_expected_status then
    raise exception 'conflict: this application is now %, not %', v_app.status, p_expected_status
      using errcode = 'P0001';
  end if;

  if v_app.status not in ('submitted', 'under_review') then
    raise exception 'conflict: only a submitted application can be decided (%)', v_app.status
      using errcode = 'P0001';
  end if;

  if p_action = 'approve' then
    -- Spec §4: possible duplicates are resolved by a human before anything is
    -- approved, so that an approval can never be the thing that creates a
    -- second canonical profile.
    select count(*) into v_open from public.duplicate_candidates
     where application_id = p_application_id and status = 'open';
    if v_open > 0 then
      raise exception 'conflict: % possible duplicate(s) must be resolved first', v_open
        using errcode = 'P0001';
    end if;

    v_next := 'approved';
    update public.registration_applications
       set status = v_next, decided_at = now(),
           decided_by_account_id = app.current_account_id(),
           decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
           correction_fields = '{}'
     where id = p_application_id;

    update public.candidates set identity_status = 'verified' where id = v_app.candidate_id;
    perform app.apply_publication_state(v_app.candidate_id);

  elsif p_action = 'request_correction' then
    if p_fields is null or cardinality(p_fields) = 0 then
      raise exception 'invalid: name the fields that need correcting' using errcode = 'P0001';
    end if;
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception 'invalid: an applicant-facing explanation is required' using errcode = 'P0001';
    end if;

    v_next := 'correction_requested';
    update public.registration_applications
       set status = v_next, decided_at = now(),
           decided_by_account_id = app.current_account_id(),
           decision_reason = btrim(p_reason), correction_fields = p_fields
     where id = p_application_id;

    update public.candidates set identity_status = 'correction_requested'
     where id = v_app.candidate_id;

  elsif p_action = 'reject' then
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception 'invalid: a rejection reason is required' using errcode = 'P0001';
    end if;

    v_next := 'rejected';
    update public.registration_applications
       set status = v_next, decided_at = now(),
           decided_by_account_id = app.current_account_id(),
           decision_reason = btrim(p_reason), correction_fields = '{}'
     where id = p_application_id;

    update public.candidates
       set identity_status = 'rejected',
           publication_status = case when publication_status = 'published'
                                     then 'unpublished' else publication_status end
     where id = v_app.candidate_id;

  else
    raise exception 'invalid: % is not a decision', p_action using errcode = 'P0001';
  end if;

  perform app.record_decision(
    'registration', p_application_id, v_app.candidate_id, p_action,
    v_app.status::text, v_next::text, coalesce(p_fields, '{}'), p_reason, p_internal_note
  );

  delete from public.review_claims
   where subject_type = 'registration' and subject_id = p_application_id;

  -- The notification carries the decision, not the reason: spec §12 keeps
  -- personal detail out of notifications and off the source-of-truth path.
  perform app.notify_operators(
    v_app.candidate_id, 'registration_decided',
    jsonb_build_object('application_id', p_application_id, 'outcome', v_next)
  );

  return jsonb_build_object('status', v_next);
end
$$;

-- --------------------------------------------------------- publication queue
create or replace function public.admin_publication_queue(
  p_statuses public.revision_status[] default null,
  p_limit    integer default 25,
  p_offset   integer default 0
)
returns table (
  revision_id     uuid,
  candidate_id    uuid,
  public_code     text,
  full_name       text,
  version         integer,
  status          public.revision_status,
  completion      integer,
  source          text,
  submitted_at    timestamptz,
  consent_active  boolean,
  unconfirmed     text[],
  claimed_by      uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_staff();

  return query
  select r.id, c.id, c.public_code, c.full_name, r.version, r.status, r.completion,
         r.source, r.submitted_at,
         app.has_active_consent(c.id), r.unconfirmed_fields,
         (select rc.admin_account_id from public.review_claims rc
          where rc.subject_type = 'biodata_revision' and rc.subject_id = r.id
            and rc.expires_at > now())
  from public.biodata_revisions r
  join public.candidates c on c.id = r.candidate_id
  where r.status = any (coalesce(p_statuses, array['submitted', 'under_review']::public.revision_status[]))
  order by r.submitted_at asc nulls last
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
end
$$;

create or replace function public.admin_biodata_detail(p_revision_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rev public.biodata_revisions;
begin
  perform app.require_staff();

  select * into v_rev from public.biodata_revisions where id = p_revision_id;
  if v_rev.id is null then
    raise exception 'not_found: no such revision' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'revision', to_jsonb(v_rev),
    'candidate', (select to_jsonb(c) from public.candidates c where c.id = v_rev.candidate_id),
    'community', (select to_jsonb(cc) from public.candidate_community cc
                  where cc.candidate_id = v_rev.candidate_id),
    -- Spec §10: "active consent evidence".
    'consent', (
      select jsonb_build_object(
        'active', cs.withdrawn_at is null, 'granted_at', cs.granted_at,
        'text_version', cs.consent_text_version,
        'by_candidate_themselves', exists (
          select 1 from public.candidate_memberships m
          where m.candidate_id = cs.candidate_id and m.account_id = cs.granted_by_account_id
            and m.role = 'candidate'
        )
      )
      from public.candidate_consents cs
      where cs.candidate_id = v_rev.candidate_id
      order by cs.granted_at desc limit 1
    ),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'kind', m.kind, 'status', m.status,
        'bucket_id', m.bucket_id, 'storage_path', m.storage_path
      ))
      from public.candidate_media m
      where m.candidate_id = v_rev.candidate_id and m.deleted_at is null
    ), '[]'::jsonb),
    'issues', coalesce((
      select jsonb_agg(to_jsonb(i)) from public.revision_field_issues i
      where i.revision_id = p_revision_id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(to_jsonb(rd) order by rd.created_at desc)
      from public.review_decisions rd
      where rd.subject_type = 'biodata_revision' and rd.subject_id = p_revision_id
    ), '[]'::jsonb)
  );
end
$$;

-- p_issues: [{"field":"mosal","gu":"...","en":"..."}, ...] — spec §10's
-- field-level issues, in both languages because the applicant reads them.
create or replace function public.admin_decide_biodata(
  p_revision_id     uuid,
  p_action          public.review_action,
  p_expected_status public.revision_status,
  p_reason          text default null,
  p_issues          jsonb default '[]'::jsonb,
  p_internal_note   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev    public.biodata_revisions;
  v_next   public.revision_status;
  v_issue  jsonb;
  v_fields text[] := '{}';
  v_pub    public.publication_status;
begin
  perform app.require_staff();
  if p_action in ('approve', 'reject') then
    perform app.require_admin();
  end if;

  select * into v_rev from public.biodata_revisions where id = p_revision_id for update;
  if v_rev.id is null then
    raise exception 'not_found: no such revision' using errcode = 'P0002';
  end if;

  if v_rev.status <> p_expected_status then
    raise exception 'conflict: this revision is now %, not %', v_rev.status, p_expected_status
      using errcode = 'P0001';
  end if;
  if v_rev.status not in ('submitted', 'under_review') then
    raise exception 'conflict: only a submitted revision can be decided (%)', v_rev.status
      using errcode = 'P0001';
  end if;

  if p_action = 'approve' then
    -- Spec §5: publication needs identity approval *and* a second review. This
    -- is the second review; it must not stand in for the first.
    if not exists (select 1 from public.candidates
                   where id = v_rev.candidate_id and identity_status = 'verified') then
      raise exception 'conflict: identity is not verified, so biodata cannot be published'
        using errcode = 'P0001';
    end if;

    v_next := 'approved';

    -- The previously published revision stays readable as history.
    update public.biodata_revisions
       set status = 'superseded', superseded_at = now()
     where candidate_id = v_rev.candidate_id and status = 'approved' and id <> p_revision_id;

    update public.biodata_revisions
       set status = v_next, approved_at = now(), decided_at = now(),
           decided_by_account_id = app.current_account_id(),
           decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
           correction_fields = '{}'
     where id = p_revision_id;

    update public.candidates
       set published_revision_id = p_revision_id,
           -- apply_publication_state decides between published and unpublished
           -- from here; it will hold at unpublished until consent is active.
           publication_status = 'unpublished'
     where id = v_rev.candidate_id;

    -- Contact details move out of the biodata blob and into their own table
    -- at the moment a reviewer approves them.
    perform app.sync_contacts_from_revision(p_revision_id);

    v_pub := app.apply_publication_state(v_rev.candidate_id);

  elsif p_action = 'request_correction' then
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception 'invalid: an applicant-facing explanation is required' using errcode = 'P0001';
    end if;

    delete from public.revision_field_issues where revision_id = p_revision_id;

    for v_issue in select * from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb))
    loop
      insert into public.revision_field_issues
        (revision_id, field_key, message_gu, message_en, created_by_account_id)
      values (p_revision_id, v_issue ->> 'field', v_issue ->> 'gu', v_issue ->> 'en',
              app.current_account_id());
      v_fields := v_fields || (v_issue ->> 'field');
    end loop;

    if cardinality(v_fields) = 0 then
      raise exception 'invalid: name at least one field that needs correcting'
        using errcode = 'P0001';
    end if;

    v_next := 'correction_requested';
    update public.biodata_revisions
       set status = v_next, decided_at = now(),
           decided_by_account_id = app.current_account_id(),
           decision_reason = btrim(p_reason), correction_fields = v_fields
     where id = p_revision_id;

    update public.candidates set publication_status = 'correction_requested'
     where id = v_rev.candidate_id;

  elsif p_action = 'reject' then
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception 'invalid: a rejection reason is required' using errcode = 'P0001';
    end if;

    v_next := 'rejected';
    update public.biodata_revisions
       set status = v_next, decided_at = now(),
           decided_by_account_id = app.current_account_id(),
           decision_reason = btrim(p_reason)
     where id = p_revision_id;

    update public.candidates set publication_status = 'rejected'
     where id = v_rev.candidate_id;

  else
    raise exception 'invalid: % is not a decision', p_action using errcode = 'P0001';
  end if;

  perform app.record_decision(
    'biodata_revision', p_revision_id, v_rev.candidate_id, p_action,
    v_rev.status::text, v_next::text, v_fields, p_reason, p_internal_note, p_revision_id
  );

  delete from public.review_claims
   where subject_type = 'biodata_revision' and subject_id = p_revision_id;

  perform app.notify_operators(
    v_rev.candidate_id, 'biodata_decided',
    jsonb_build_object('revision_id', p_revision_id, 'outcome', v_next)
  );

  return jsonb_build_object('status', v_next, 'publication_status', v_pub);
end
$$;

-- ------------------------------------------------------------- duplicates --
create or replace function public.admin_resolve_duplicate(
  p_id     uuid,
  p_status public.duplicate_status,
  p_note   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dup public.duplicate_candidates;
begin
  perform app.require_admin();

  if p_status = 'open' then
    raise exception 'invalid: resolve to confirmed or not_duplicate' using errcode = 'P0001';
  end if;

  select * into v_dup from public.duplicate_candidates where id = p_id for update;
  if v_dup.id is null then
    raise exception 'not_found: no such duplicate' using errcode = 'P0002';
  end if;

  update public.duplicate_candidates
     set status = p_status, resolved_at = now(),
         resolved_by_account_id = app.current_account_id(), note = p_note
   where id = p_id;

  perform app.record_decision(
    'duplicate', p_id, v_dup.candidate_id,
    (case when p_status = 'confirmed' then 'reject' else 'approve' end)::public.review_action,
    'open', p_status::text, '{}', null, p_note
  );
end
$$;

comment on function public.admin_resolve_duplicate(uuid, public.duplicate_status, text) is
  'Spec §4: resolving a duplicate records a judgement about two records. It '
  'never merges them and never rejects the application on its own.';

-- ---------------------------------------------------------- access requests -
create or replace function public.admin_decide_access_request(
  p_request_id uuid,
  p_approve    boolean,
  p_reason     text default null,
  p_role       public.membership_role default 'guardian'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.access_requests;
begin
  perform app.require_admin();

  select * into v_req from public.access_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'not_found: no such request' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'conflict: this request was already decided (%)', v_req.status
      using errcode = 'P0001';
  end if;
  if not p_approve and btrim(coalesce(p_reason, '')) = '' then
    raise exception 'invalid: a rejection reason is required' using errcode = 'P0001';
  end if;

  update public.access_requests
     set status = (case when p_approve then 'approved' else 'rejected' end)::public.access_request_status,
         decided_at = now(), decided_by_account_id = app.current_account_id(),
         decision_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_request_id;

  if p_approve then
    -- Spec §4: linking creates access to the existing canonical profile. It
    -- never creates a second one.
    insert into public.candidate_memberships
      (candidate_id, account_id, role, relationship, linked_by_account_id)
    values (
      v_req.candidate_id, v_req.account_id,
      (case when v_req.claimed_relationship = 'self' then p_role else 'guardian' end)::public.membership_role,
      v_req.claimed_relationship, app.current_account_id()
    )
    on conflict do nothing;
  end if;

  perform app.record_decision(
    'access_request', p_request_id, v_req.candidate_id,
    (case when p_approve then 'approve' else 'reject' end)::public.review_action,
    'pending', case when p_approve then 'approved' else 'rejected' end,
    '{}', p_reason, null
  );

  perform app.notify(
    v_req.account_id, 'access_request_decided', null,
    jsonb_build_object('request_id', p_request_id, 'approved', p_approve)
  );

  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end);
end
$$;

-- ---------------------------------------------------------------- claims ---
create or replace function public.admin_claim_review(
  p_subject    public.review_subject,
  p_subject_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_holder uuid;
begin
  perform app.require_staff();

  delete from public.review_claims where expires_at < now();

  insert into public.review_claims (subject_type, subject_id, admin_account_id, expires_at)
  values (p_subject, p_subject_id, app.current_account_id(), now() + interval '20 minutes')
  on conflict (subject_type, subject_id) do update
    set admin_account_id = excluded.admin_account_id,
        claimed_at = now(),
        expires_at = excluded.expires_at
    where public.review_claims.admin_account_id = app.current_account_id();

  select admin_account_id into v_holder from public.review_claims
   where subject_type = p_subject and subject_id = p_subject_id;

  return jsonb_build_object(
    'claimed', v_holder = app.current_account_id(),
    'held_by_other', v_holder is distinct from app.current_account_id()
  );
end
$$;

comment on function public.admin_claim_review(public.review_subject, uuid) is
  'Advisory lock for the review UI. The real protection against a conflicting '
  'decision is the expected-status check inside each decide function.';

create or replace function public.admin_release_review(
  p_subject    public.review_subject,
  p_subject_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  delete from public.review_claims
   where subject_type = p_subject and subject_id = p_subject_id
     and admin_account_id = app.current_account_id();
end
$$;

-- ---------------------------------------------------------- member detail --
create or replace function public.admin_member_detail(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_staff();

  if not exists (select 1 from public.candidates where id = p_candidate_id) then
    raise exception 'not_found: no such candidate' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'candidate', (select to_jsonb(c) from public.candidates c where c.id = p_candidate_id),
    'community', (select to_jsonb(cc) from public.candidate_community cc
                  where cc.candidate_id = p_candidate_id),
    'privacy', (select to_jsonb(p) from public.candidate_privacy p
                where p.candidate_id = p_candidate_id),
    'linked_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_id', a.id, 'phone', a.phone, 'display_name', a.display_name,
        'role', m.role, 'relationship', m.relationship,
        'linked_at', m.linked_at, 'revoked_at', m.revoked_at
      ) order by m.linked_at)
      from public.candidate_memberships m
      join public.accounts a on a.id = m.account_id
      where m.candidate_id = p_candidate_id
    ), '[]'::jsonb),
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'version', r.version, 'status', r.status,
        'completion', r.completion, 'submitted_at', r.submitted_at
      ) order by r.version desc)
      from public.biodata_revisions r where r.candidate_id = p_candidate_id
    ), '[]'::jsonb),
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'granted_at', cs.granted_at, 'withdrawn_at', cs.withdrawn_at,
        'text_version', cs.consent_text_version
      ) order by cs.granted_at desc)
      from public.candidate_consents cs where cs.candidate_id = p_candidate_id
    ), '[]'::jsonb),
    'decisions', coalesce((
      select jsonb_agg(to_jsonb(rd) order by rd.created_at desc)
      from public.review_decisions rd where rd.candidate_id = p_candidate_id
    ), '[]'::jsonb)
  );
end
$$;

-- ----------------------------------------------------------------- media ---
create or replace function public.admin_decide_media(
  p_media_id uuid,
  p_approve  boolean,
  p_note     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.candidate_media;
begin
  perform app.require_staff();

  select * into v_media from public.candidate_media where id = p_media_id for update;
  if v_media.id is null then
    raise exception 'not_found: no such media' using errcode = 'P0002';
  end if;

  update public.candidate_media
     set status = (case when p_approve then 'approved' else 'rejected' end)::public.media_status,
         review_note = p_note
   where id = p_media_id;

  perform app.record_decision(
    'media', p_media_id, v_media.candidate_id,
    (case when p_approve then 'approve' else 'reject' end)::public.review_action,
    v_media.status::text, case when p_approve then 'approved' else 'rejected' end,
    '{}', p_note, null
  );
end
$$;

-- ------------------------------------------------------- roles and settings
-- Spec §2: a member cannot grant themselves admin. Only a superadmin can grant
-- anything, and the self-grant is refused explicitly rather than left to the
-- fact that a non-superadmin would have failed the first check anyway.
create or replace function public.grant_role(p_account_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_role('superadmin') then
    raise exception 'forbidden: only a superadmin may grant roles' using errcode = '42501';
  end if;
  if p_account_id = app.current_account_id() then
    raise exception 'forbidden: you cannot change your own roles' using errcode = '42501';
  end if;

  insert into public.account_roles (account_id, role, granted_by)
  values (p_account_id, p_role, app.current_account_id())
  on conflict (account_id, role) do nothing;
end
$$;

create or replace function public.revoke_role(p_account_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_role('superadmin') then
    raise exception 'forbidden: only a superadmin may revoke roles' using errcode = '42501';
  end if;
  if p_account_id = app.current_account_id() then
    raise exception 'forbidden: you cannot change your own roles' using errcode = '42501';
  end if;

  delete from public.account_roles where account_id = p_account_id and role = p_role;
end
$$;

-- Spec §7: ratifying a rule is a recorded act, not a deploy.
create or replace function public.admin_set_community_rule(
  p_code       text,
  p_enabled    boolean,
  p_definition jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_role('superadmin') then
    raise exception 'forbidden: only a superadmin may change community rules'
      using errcode = '42501';
  end if;

  update public.community_rules
     set enabled = p_enabled,
         definition = coalesce(p_definition, definition),
         -- The CHECK constraint refuses to enable an unratified rule, so
         -- enabling one is itself the act of ratification and is stamped here.
         ratified_at = case when p_enabled then coalesce(ratified_at, now()) else ratified_at end,
         ratified_by_account_id = case when p_enabled
                                       then coalesce(ratified_by_account_id, app.current_account_id())
                                       else ratified_by_account_id end
   where code = p_code;

  if not found then
    raise exception 'not_found: no such rule' using errcode = 'P0002';
  end if;
end
$$;

create or replace function public.admin_update_settings(p_patch jsonb)
returns public.app_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.app_settings;
begin
  if not app.has_role('superadmin') then
    raise exception 'forbidden: only a superadmin may change settings' using errcode = '42501';
  end if;

  update public.app_settings s
     set review_target_hours = coalesce((p_patch ->> 'review_target_hours')::integer, s.review_target_hours),
         interest_expiry_days = case when p_patch ? 'interest_expiry_days'
                                     then (p_patch ->> 'interest_expiry_days')::integer
                                     else s.interest_expiry_days end,
         photo_grant_days = case when p_patch ? 'photo_grant_days'
                                 then (p_patch ->> 'photo_grant_days')::integer
                                 else s.photo_grant_days end,
         share_link_days = coalesce((p_patch ->> 'share_link_days')::integer, s.share_link_days),
         consent_text_version = coalesce(p_patch ->> 'consent_text_version', s.consent_text_version),
         certificate_retention_days = case when p_patch ? 'certificate_retention_days'
                                           then (p_patch ->> 'certificate_retention_days')::integer
                                           else s.certificate_retention_days end,
         updated_by_account_id = app.current_account_id()
   where s.id
   returning * into v_row;

  return v_row;
end
$$;

-- ------------------------------------------------------------ maintenance --
-- Spec §14 leaves interest expiry unsettled, so this is a no-op until
-- app_settings.interest_expiry_days is set. Intended to be run from
-- pg_cron or an external scheduler; safe to call repeatedly.
create or replace function public.expire_stale_interests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not app.is_staff() and auth.uid() is not null then
    raise exception 'forbidden: staff only' using errcode = '42501';
  end if;

  with expired as (
    update public.interests
       set status = 'expired'
     where status = 'pending' and expires_at is not null and expires_at < now()
    returning 1
  )
  select count(*) into v_count from expired;

  return v_count;
end
$$;
