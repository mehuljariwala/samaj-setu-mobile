-- ---------------------------------------------------------------------------
-- Daily upkeep, and a usage summary for admins, so the platform can stay on
-- Supabase's free plan for good.
--
-- The free plan's limits are 5 GB of egress a month, 1 GB of file storage and
-- 500 MB of database, and a free project that sees no requests for a week is
-- paused. A trust with no budget cannot pay its way past any of them, so:
--
--   * run_maintenance(), called once a day by the Vercel cron in vercel.json
--     (app/api/maintenance/route.ts), drops page-view records older than 90
--     days, the one table that grows with every screen opened, and lists the
--     stored files that nothing refers to any more so the route can delete
--     them. Its daily call is also the request that keeps the project awake.
--   * admin_usage() tells the admin home how close each limit is, so someone
--     notices long before Supabase switches the project off.
--
-- A file is kept while a row refers to it: a photo or janmakshar in
-- candidate_media (a photo's card-sized copy goes with it), or a document in
-- application_documents. A row removed in the app (deleted_at) keeps its file
-- for 30 days in case it was a mistake. A file with no row at all — an upload
-- the browser never finished recording, or one whose candidate was deleted —
-- is kept for 7 days, so an upload still in progress is never touched.
-- ---------------------------------------------------------------------------

create table app.maintenance_runs (
  id                  bigint generated always as identity primary key,
  ran_at              timestamptz not null default now(),
  page_views_deleted  integer not null default 0,
  files_listed        integer not null default 0,
  file_bytes_listed   bigint not null default 0
);

comment on table app.maintenance_runs is
  'One row per run of public.run_maintenance(). Kept for 90 days.';

-- ------------------------------------------------------- unused files ------
create or replace function app.unused_files(p_limit integer default 500)
returns table (bucket_id text, name text, bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name, coalesce((o.metadata ->> 'size')::bigint, 0)
    from storage.objects o
   where o.bucket_id in ('candidate-photos', 'kundali', 'certificates')
     and o.created_at < now() - interval '7 days'
     and not exists (
       select 1
         from public.candidate_media m
        where m.bucket_id = o.bucket_id
          and (m.deleted_at is null or m.deleted_at > now() - interval '30 days')
          and (
            m.storage_path = o.name
            or (o.name like '%.thumb.jpg'
                and regexp_replace(m.storage_path, '\.[a-z0-9]*$', '') || '.thumb.jpg' = o.name)
          )
     )
     and not exists (
       select 1
         from public.application_documents d
        where d.bucket_id = o.bucket_id
          and d.storage_path = o.name
          and (d.deleted_at is null or d.deleted_at > now() - interval '30 days')
     )
   order by o.created_at
   limit greatest(1, least(coalesce(p_limit, 500), 1000))
$$;

-- --------------------------------------------------------- the daily run ---
-- Returns the files to delete; storage refuses deletes made in SQL, so the
-- route removes them through the Storage API. Runs at most once in 20 hours
-- whoever calls it, so calling the route again does nothing.
create or replace function public.run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last  timestamptz;
  v_views integer;
  v_files jsonb;
  v_bytes bigint;
begin
  select max(r.ran_at) into v_last from app.maintenance_runs r;
  if v_last > now() - interval '20 hours' then
    return jsonb_build_object('skipped', true, 'last_run_at', v_last);
  end if;

  delete from public.account_activity
   where kind = 'page.view'
     and occurred_at < now() - interval '90 days';
  get diagnostics v_views = row_count;

  select coalesce(jsonb_agg(jsonb_build_object('bucket', f.bucket_id, 'name', f.name)), '[]'::jsonb),
         coalesce(sum(f.bytes), 0)
    into v_files, v_bytes
    from app.unused_files() f;

  insert into app.maintenance_runs (page_views_deleted, files_listed, file_bytes_listed)
  values (v_views, jsonb_array_length(v_files), v_bytes);
  delete from app.maintenance_runs where ran_at < now() - interval '90 days';

  return jsonb_build_object('skipped', false, 'page_views_deleted', v_views, 'files', v_files);
end
$$;

comment on function public.run_maintenance() is
  'Daily upkeep for the free plan: prunes old page views, lists unused files. Service role only.';

-- ------------------------------------------------------------ the summary --
create or replace function public.admin_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform app.require_staff();

  return jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'storage_bytes', (
      select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
        from storage.objects o
    ),
    'photo_bytes_today', (select coalesce(sum(e.bytes), 0) from app.file_egress e where e.day = v_today),
    'photo_bytes_30_days', (
      select coalesce(sum(e.bytes), 0) from app.file_egress e where e.day > v_today - 30
    ),
    'last_maintenance', (
      select jsonb_build_object('ran_at', r.ran_at, 'files', r.files_listed, 'file_bytes', r.file_bytes_listed)
        from app.maintenance_runs r
       order by r.ran_at desc
       limit 1
    )
  );
end
$$;

comment on function public.admin_usage() is
  'How close the platform is to the free plan''s limits, for the admin home. Staff only.';

revoke execute on function app.unused_files(integer) from public, anon, authenticated;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;
revoke execute on function public.admin_usage() from public, anon;
grant execute on function public.admin_usage() to authenticated, service_role;
