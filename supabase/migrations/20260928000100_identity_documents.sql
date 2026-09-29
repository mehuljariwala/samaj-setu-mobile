-- ---------------------------------------------------------------------------
-- Photo ID alongside the birth certificate.
--
-- The certificate proves a birth date and a father's name; it says nothing
-- about whether the person registering is who they claim to be. So every
-- application now also carries both sides of one government photo ID — an
-- Aadhaar card or a voter ID — and the admin reviews all three together.
--
-- Same privacy rules as the certificate (spec §8): members may insert, never
-- read; staff reads are audited; replacing a file supersedes the old row.
-- ---------------------------------------------------------------------------

alter table public.application_documents
  drop constraint if exists application_documents_kind_check;
alter table public.application_documents
  add constraint application_documents_kind_check
  check (kind in ('birth_certificate', 'supporting', 'identity_front', 'identity_back'));

alter table public.application_documents
  add column if not exists identity_type text
    check (identity_type in ('aadhaar', 'voter_id'));
alter table public.application_documents
  add constraint application_documents_identity_type_present
  check ((kind in ('identity_front', 'identity_back')) = (identity_type is not null));

-- One live front and one live back per application.
create unique index if not exists application_documents_one_identity_side
  on public.application_documents (application_id, kind)
  where deleted_at is null and kind in ('identity_front', 'identity_back');

-- ------------------------------------------------------------------ attach --
create or replace function public.attach_identity_document(
  p_application_id uuid,
  p_side           text,
  p_identity_type  text,
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
  v_app  public.registration_applications;
  v_kind text;
  v_id   uuid;
begin
  if p_side not in ('front', 'back') then
    raise exception 'invalid: side must be front or back' using errcode = 'P0001';
  end if;
  if p_identity_type not in ('aadhaar', 'voter_id') then
    raise exception 'invalid: identity type must be aadhaar or voter_id' using errcode = 'P0001';
  end if;
  v_kind := 'identity_' || p_side;

  select * into v_app from public.registration_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'not_found: no such application' using errcode = 'P0002';
  end if;
  perform app.require_operator(v_app.candidate_id);

  if v_app.status not in ('draft', 'correction_requested') then
    raise exception 'conflict: this application is not open for editing (%)', v_app.status
      using errcode = 'P0001';
  end if;

  if p_storage_path !~ ('^' || v_app.candidate_id::text || '/') then
    raise exception 'invalid: document path must start with the candidate id'
      using errcode = 'P0001';
  end if;

  -- Supersede this side, and the other side too if it belongs to a different
  -- kind of ID: an Aadhaar front with a voter ID back proves nothing.
  update public.application_documents
     set deleted_at = now()
   where application_id = p_application_id
     and deleted_at is null
     and (kind = v_kind
          or (kind in ('identity_front', 'identity_back') and identity_type <> p_identity_type));

  insert into public.application_documents
    (application_id, candidate_id, kind, identity_type, bucket_id, storage_path,
     mime_type, size_bytes, checksum_sha256, uploaded_by_account_id)
  values
    (p_application_id, v_app.candidate_id, v_kind, p_identity_type, 'certificates', p_storage_path,
     p_mime_type, p_size_bytes, p_checksum, app.current_account_id())
  returning id into v_id;

  return v_id;
end
$$;

-- -------------------------------------------------------- what is attached --
-- Members cannot read application_documents, so this is how the join flow
-- learns which files a draft or correction already has. Booleans and the ID
-- type only; never a path.
create or replace function public.my_application_documents(p_application_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_app public.registration_applications;
begin
  select * into v_app from public.registration_applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'not_found: no such application' using errcode = 'P0002';
  end if;
  perform app.require_operator(v_app.candidate_id);

  return (
    select jsonb_build_object(
      'certificate',    bool_or(d.kind = 'birth_certificate'),
      'identity_front', bool_or(d.kind = 'identity_front'),
      'identity_back',  bool_or(d.kind = 'identity_back'),
      'identity_type',  max(d.identity_type)
    )
    from public.application_documents d
    where d.application_id = p_application_id and d.deleted_at is null
  );
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

  if btrim(coalesce(v_candidate.full_name, '')) = '' then v_missing := array_append(v_missing, 'full_name'); end if;
  if v_candidate.date_of_birth is null                then v_missing := array_append(v_missing, 'date_of_birth'); end if;
  if btrim(coalesce(v_candidate.father_name, '')) = '' then v_missing := array_append(v_missing, 'father_name'); end if;
  if btrim(coalesce(v_candidate.city, '')) = ''        then v_missing := array_append(v_missing, 'city'); end if;

  -- Spec §3 step 4: the certificate is mandatory for submission.
  if not exists (
    select 1 from public.application_documents d
    where d.application_id = p_application_id
      and d.kind = 'birth_certificate' and d.deleted_at is null
  ) then
    v_missing := array_append(v_missing, 'birth_certificate');
  end if;

  -- Both sides of one photo ID, of the same kind, alongside the certificate.
  if not exists (
    select 1 from public.application_documents d
    where d.application_id = p_application_id
      and d.kind = 'identity_front' and d.deleted_at is null
  ) then
    v_missing := array_append(v_missing, 'identity_front');
  end if;
  if not exists (
    select 1 from public.application_documents d
    where d.application_id = p_application_id
      and d.kind = 'identity_back' and d.deleted_at is null
  ) then
    v_missing := array_append(v_missing, 'identity_back');
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

-- ------------------------------------------------------------------- admin --
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
    -- Metadata only, like the certificate; see admin_document_reference().
    'identity', (
      select jsonb_build_object(
        'type', max(d.identity_type),
        'front', max(case when d.kind = 'identity_front' then jsonb_build_object(
                   'id', d.id, 'mime_type', d.mime_type, 'size_bytes', d.size_bytes,
                   'uploaded_at', d.uploaded_at)::text end)::jsonb,
        'back',  max(case when d.kind = 'identity_back' then jsonb_build_object(
                   'id', d.id, 'mime_type', d.mime_type, 'size_bytes', d.size_bytes,
                   'uploaded_at', d.uploaded_at)::text end)::jsonb
      )
      from public.application_documents d
      where d.application_id = p_application_id
        and d.kind in ('identity_front', 'identity_back') and d.deleted_at is null
      having count(*) > 0
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

-- Opening an ID is recorded exactly like opening a certificate.
create or replace function public.admin_document_reference(p_application_id uuid, p_kind text)
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
   where application_id = p_application_id and kind = p_kind and deleted_at is null;
  if v_doc.id is null then
    raise exception 'not_found: no such document on this application' using errcode = 'P0002';
  end if;

  insert into public.audit_events
    (actor_account_id, actor_role, action, subject_table, subject_id, candidate_id, changes)
  values (
    app.current_account_id(), 'staff', 'document_viewed',
    'application_documents', v_doc.id, v_doc.candidate_id, jsonb_build_object('kind', p_kind)
  );

  return jsonb_build_object(
    'bucket_id', v_doc.bucket_id, 'storage_path', v_doc.storage_path,
    'mime_type', v_doc.mime_type
  );
end
$$;

revoke execute on function public.attach_identity_document(uuid, text, text, text, text, bigint, text) from public, anon;
revoke execute on function public.my_application_documents(uuid) from public, anon;
revoke execute on function public.admin_document_reference(uuid, text) from public, anon;
grant execute on function public.attach_identity_document(uuid, text, text, text, text, bigint, text) to authenticated, service_role;
grant execute on function public.my_application_documents(uuid) to authenticated, service_role;
grant execute on function public.admin_document_reference(uuid, text) to authenticated, service_role;
