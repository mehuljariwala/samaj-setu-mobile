-- ---------------------------------------------------------------------------
-- Private storage buckets and their policies (spec §8, §12).
--
-- All three buckets are private. Nothing in this application has a public URL,
-- because a public URL is a permanent grant to whoever it is forwarded to.
-- Files are read through short-lived signed URLs minted server-side, after the
-- same authorisation the request layer applies.
--
-- Path convention, relied on by every policy below:
--     <candidate_id>/<random>.<ext>
-- The first folder segment is the candidate the object belongs to, so a policy
-- can answer "whose file is this?" without a join to a table the storage role
-- may not be able to read.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('certificates', 'certificates', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('candidate-photos', 'candidate-photos', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('kundali', 'kundali', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A malformed path must not raise inside a policy — it must simply fail to
-- match anything.
create or replace function app.storage_candidate_id(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception
  when others then
    return null;
end
$$;

-- ========================================================== certificates ===
-- Spec §8: "Birth certificates are never member-visible." There is no SELECT
-- policy for members at all — not even for their own upload. An operator can
-- put a file in and cannot read one back out.
create policy certificates_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'certificates'
    and (select app.operates_candidate(app.storage_candidate_id(name)))
  );

create policy certificates_read_staff
  on storage.objects for select to authenticated
  using (bucket_id = 'certificates' and (select app.is_staff()));

-- No UPDATE or DELETE policy. Replacing a certificate supersedes the old
-- application_documents row; removing the object itself is an operations task
-- tied to the retention policy that spec §14 leaves unsettled.

-- ======================================================== candidate photos ==
create policy photos_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-photos'
    and (select app.operates_candidate(app.storage_candidate_id(name)))
  );

-- The same predicate the candidate_media policy uses, so the storage layer and
-- the request layer cannot drift apart (spec §8).
create policy photos_read_permitted
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-photos'
    and (select app.can_view_media_of(app.storage_candidate_id(name), 'photo'))
  );

create policy photos_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidate-photos'
    and (select app.operates_candidate(app.storage_candidate_id(name)))
  );

-- ================================================================ kundali ===
-- Spec §8: "Janmakshar visibility is separately controlled" — a separate
-- bucket and a separate grant kind, so a photo grant never implies this one.
create policy kundali_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kundali'
    and (select app.operates_candidate(app.storage_candidate_id(name)))
  );

create policy kundali_read_permitted
  on storage.objects for select to authenticated
  using (
    bucket_id = 'kundali'
    and (select app.can_view_media_of(app.storage_candidate_id(name), 'kundali'))
  );

create policy kundali_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'kundali'
    and (select app.operates_candidate(app.storage_candidate_id(name)))
  );

-- ------------------------------------------------------- register an upload -
-- Records a photo or kundali after the object has been stored. Separate from
-- the upload so a half-finished transfer never appears in a profile.
create or replace function public.register_media(
  p_candidate_id uuid,
  p_kind         public.media_kind,
  p_storage_path text,
  p_mime_type    text,
  p_size_bytes   bigint,
  p_is_primary   boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket text := case p_kind when 'photo' then 'candidate-photos' else 'kundali' end;
  v_id     uuid;
begin
  perform app.require_operator(p_candidate_id);

  if p_storage_path !~ ('^' || p_candidate_id::text || '/') then
    raise exception 'invalid: media path must start with the candidate id' using errcode = 'P0001';
  end if;

  if p_is_primary then
    update public.candidate_media set is_primary = false
     where candidate_id = p_candidate_id and kind = p_kind and deleted_at is null;
  end if;

  insert into public.candidate_media
    (candidate_id, kind, bucket_id, storage_path, mime_type, size_bytes,
     is_primary, status, uploaded_by_account_id)
  values
    (p_candidate_id, p_kind, v_bucket, p_storage_path, p_mime_type, p_size_bytes,
     p_is_primary, 'pending_review', app.current_account_id())
  returning id into v_id;

  return v_id;
end
$$;
