-- ---------------------------------------------------------------------------
-- A school or college leaving certificate in place of the birth certificate.
--
-- Plenty of families, older candidates most of all, have no birth certificate
-- to photograph, but they do have the leaving certificate their school or
-- college issued. It carries the two facts the admin checks the certificate
-- for, the birth date and the father's name, so the certificate slot now takes
-- either one and records which it is, so the admin knows what they are
-- looking at.
--
-- The kind stays 'birth_certificate'. It names the slot, "the proof of the
-- birth date", in every check that counts documents (submission, the queue,
-- my_context), and renaming it would touch all of them for no change in what
-- they do.
--
-- certificate_type is null on every certificate uploaded before this: those
-- were all birth certificates, and reading null as 'birth' avoids rewriting
-- rows the audit trigger would log as edits.
-- ---------------------------------------------------------------------------

alter table public.application_documents
  add column if not exists certificate_type text
    check (certificate_type in ('birth', 'leaving'));
alter table public.application_documents
  add constraint application_documents_certificate_type_on_certificate
  check (certificate_type is null or kind = 'birth_certificate');

-- ------------------------------------------------------------------ attach --
-- The new argument goes last with a default, so a page loaded before this
-- deploy, which calls without it, still records a birth certificate.
drop function if exists public.attach_certificate(uuid, text, text, bigint, text);

create function public.attach_certificate(
  p_application_id   uuid,
  p_storage_path     text,
  p_mime_type        text,
  p_size_bytes       bigint,
  p_checksum         text default null,
  p_certificate_type text default 'birth'
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
  if p_certificate_type is null or p_certificate_type not in ('birth', 'leaving') then
    raise exception 'invalid: certificate type must be birth or leaving' using errcode = 'P0001';
  end if;

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
    (application_id, candidate_id, kind, certificate_type, bucket_id, storage_path,
     mime_type, size_bytes, checksum_sha256, uploaded_by_account_id)
  values
    (p_application_id, v_app.candidate_id, 'birth_certificate', p_certificate_type, 'certificates',
     p_storage_path, p_mime_type, p_size_bytes, p_checksum, app.current_account_id())
  returning id into v_id;

  return v_id;
end
$$;

-- -------------------------------------------------------- what is attached --
-- As before, plus which certificate it is, so a draft or a correction opens
-- with the same choice ticked.
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
      'certificate',      bool_or(d.kind = 'birth_certificate'),
      'certificate_type', max(case when d.kind = 'birth_certificate'
                               then coalesce(d.certificate_type, 'birth') end),
      'identity_front',   bool_or(d.kind = 'identity_front'),
      'identity_back',    bool_or(d.kind = 'identity_back'),
      'identity_type',    max(d.identity_type)
    )
    from public.application_documents d
    where d.application_id = p_application_id and d.deleted_at is null
  );
end
$$;

-- ------------------------------------------------------------------- admin --
-- Unchanged from 20260928000100 except that the certificate says which one it is.
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
                                'size_bytes', d.size_bytes, 'uploaded_at', d.uploaded_at,
                                'type', coalesce(d.certificate_type, 'birth'))
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

revoke execute on function public.attach_certificate(uuid, text, text, bigint, text, text) from public, anon;
grant execute on function public.attach_certificate(uuid, text, text, bigint, text, text) to authenticated, service_role;
