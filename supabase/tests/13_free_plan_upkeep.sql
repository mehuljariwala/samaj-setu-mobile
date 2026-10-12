-- ---------------------------------------------------------------------------
-- Daily upkeep (run_maintenance) and the admin usage summary (admin_usage).
--
-- Same conventions as 01_assertions.sql: raise on failure, silent on success.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_condition boolean, p_what text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_what;
  end if;
end
$$;

do $$
declare
  v_admin  uuid := '00000000-0000-4000-8000-000000000002';
  v_member uuid := '00000000-0000-4000-8000-000000000010';
  v_app    uuid;
  v_cand   uuid;
  v_result jsonb;
  v_listed text[];
  v_usage  jsonb;
  v_refused boolean;
begin
  select id, candidate_id into v_app, v_cand from public.registration_applications limit 1;
  delete from app.maintenance_runs;
  delete from app.file_egress;

  -- Rows: a live photo, one removed 40 days ago, one removed 5 days ago, a
  -- live janmakshar, a live document and one replaced 40 days ago.
  insert into public.candidate_media (candidate_id, kind, bucket_id, storage_path, mime_type, size_bytes, deleted_at)
  values
    (v_cand, 'photo',   'candidate-photos', v_cand || '/live.png',  'image/png',  1000, null),
    (v_cand, 'photo',   'candidate-photos', v_cand || '/gone.jpg',  'image/jpeg', 1000, now() - interval '40 days'),
    (v_cand, 'photo',   'candidate-photos', v_cand || '/recent.jpg','image/jpeg', 1000, now() - interval '5 days'),
    (v_cand, 'kundali', 'kundali',          v_cand || '/chart.jpg', 'image/jpeg', 1000, null);
  insert into public.application_documents (application_id, candidate_id, kind, bucket_id, storage_path, mime_type, size_bytes, deleted_at)
  values
    (v_app, v_cand, 'supporting', 'certificates', v_cand || '/doc.jpg',     'image/jpeg', 1000, null),
    (v_app, v_cand, 'supporting', 'certificates', v_cand || '/old-doc.jpg', 'image/jpeg', 1000, now() - interval '40 days');

  -- The files, all old enough to be judged except the fresh upload.
  insert into storage.objects (bucket_id, name, metadata, created_at)
  select bucket, v_cand || '/' || file, jsonb_build_object('size', 2048), created
    from (values
      ('candidate-photos', 'live.png',          now() - interval '60 days'),
      ('candidate-photos', 'live.thumb.jpg',    now() - interval '60 days'),
      ('candidate-photos', 'gone.jpg',          now() - interval '60 days'),
      ('candidate-photos', 'gone.thumb.jpg',    now() - interval '60 days'),
      ('candidate-photos', 'recent.jpg',        now() - interval '60 days'),
      ('candidate-photos', 'abandoned.jpg',     now() - interval '10 days'),
      ('candidate-photos', 'uploading.jpg',     now() - interval '1 day'),
      ('kundali',          'chart.jpg',         now() - interval '60 days'),
      ('kundali',          'stray.pdf',         now() - interval '60 days'),
      ('certificates',     'doc.jpg',           now() - interval '60 days'),
      ('certificates',     'old-doc.jpg',       now() - interval '60 days')
    ) as f(bucket, file, created);

  insert into public.account_activity (account_id, kind, path, occurred_at)
  values
    (v_member, 'page.view',      '/home', now() - interval '100 days'),
    (v_member, 'page.view',      '/home', now() - interval '10 days'),
    (v_member, 'account.sign_in', null,   now() - interval '100 days');

  set local role service_role;
  v_result := public.run_maintenance();
  reset role;

  select array_agg(file order by file)
    into v_listed
    from (select f ->> 'bucket' || ':' || split_part(f ->> 'name', '/', 2) as file
            from jsonb_array_elements(v_result -> 'files') f) listed;

  perform pg_temp.ok(v_listed = array[
    'candidate-photos:abandoned.jpg', 'candidate-photos:gone.jpg', 'candidate-photos:gone.thumb.jpg',
    'certificates:old-doc.jpg', 'kundali:stray.pdf'
  ], 'lists exactly the unused files: ' || coalesce(array_to_string(v_listed, ', '), 'none'));

  perform pg_temp.ok((v_result ->> 'page_views_deleted')::int = 1, 'drops page views older than 90 days');
  perform pg_temp.ok(
    (select count(*) from public.account_activity where account_id = v_member and occurred_at < now() - interval '90 days') = 1,
    'keeps older records that are not page views');

  set local role service_role;
  perform pg_temp.ok((public.run_maintenance() ->> 'skipped')::boolean, 'a second run the same day does nothing');
  reset role;

  -- A member cannot run it, or read the usage summary.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_member::text, 'role', 'authenticated')::text, true);
    perform public.run_maintenance();
    v_refused := false;
  exception when insufficient_privilege then
    v_refused := true;
  end;
  reset role;
  perform pg_temp.ok(v_refused, 'a member cannot run maintenance');

  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_member::text, 'role', 'authenticated')::text, true);
    perform public.admin_usage();
    v_refused := false;
  exception when insufficient_privilege or raise_exception then
    v_refused := true;
  end;
  reset role;
  perform pg_temp.ok(v_refused, 'a member cannot read the usage summary');

  insert into app.file_egress (day, bytes) values ((now() at time zone 'Asia/Kolkata')::date, 5000);
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  v_usage := public.admin_usage();
  reset role;

  perform pg_temp.ok((v_usage ->> 'storage_bytes')::bigint = 11 * 2048, 'counts every stored file');
  perform pg_temp.ok((v_usage -> 'last_maintenance' ->> 'files')::int = 5, 'reports how many unused files the last run found');
  perform pg_temp.ok((v_usage -> 'last_maintenance' ->> 'file_bytes')::bigint = 5 * 2048, 'and their size');
  perform pg_temp.ok((v_usage ->> 'photo_bytes_today')::bigint = 5000, 'reports today''s photo bytes');
  perform pg_temp.ok((v_usage ->> 'database_bytes')::bigint > 0, 'reports the database size');
  perform pg_temp.ok(v_usage -> 'last_maintenance' ->> 'ran_at' is not null, 'reports when the last run was');

  delete from storage.objects where name like v_cand || '/%';
  delete from public.candidate_media where storage_path like v_cand || '/%' and storage_path ~ '/(live|gone|recent|chart)\.';
  delete from public.application_documents where storage_path in (v_cand || '/doc.jpg', v_cand || '/old-doc.jpg');
  delete from app.maintenance_runs;
  delete from app.file_egress;
end
$$;
