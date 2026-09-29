-- ---------------------------------------------------------------------------
-- User management: an admin can see every account, switch one off or back on,
-- set a new password for someone who has forgotten theirs, and read what each
-- account has done.
--
-- There is no email and no SMS, so "forgot password" is a phone call to a
-- volunteer. The volunteer sets a new password here and tells the family.
--
-- The password and the ban are written straight to auth.users, inside the same
-- transaction that checks the caller's role and records what happened. Doing
-- it through GoTrue's admin API instead would need the service key on the
-- server and would split "may they?", "do it" and "write it down" across two
-- systems, one of which can fail after the other has succeeded.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- activity ----
-- One row per thing an account did, or had done to it. Complements
-- audit_events, which records changes to rows; this records people: sign-ins,
-- screens opened, actions taken, and what staff did to the account itself.
create table public.account_activity (
  id                  bigint generated always as identity primary key,
  -- Whose timeline this belongs on. Not a foreign key, for the same reason as
  -- audit_events.actor_account_id: the history must outlive the account.
  account_id          uuid not null,
  occurred_at         timestamptz not null default now(),
  kind                text not null check (kind ~ '^[a-z]+(\.[a-z_]+)+$'),
  -- Who did it: the account itself, or the admin who acted on it.
  actor_account_id    uuid,
  -- The candidate acted for, and the one acted on (an interest's recipient, a
  -- profile opened in Discover).
  candidate_id        uuid,
  target_candidate_id uuid,
  path                text check (length(path) <= 300),
  -- Codes and flags only. Never a password, a document path or contact
  -- details: this is a log, and spec §10 keeps sensitive values out of logs.
  detail              jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 2048),
  ip                  text check (length(ip) <= 64),
  user_agent          text check (length(user_agent) <= 400)
);

comment on table public.account_activity is
  'Per-account timeline: sign-ins, screens, actions, and staff actions on the account. '
  'Append-only; written by record_activity() and the admin account functions.';

create index account_activity_account_idx
  on public.account_activity (account_id, occurred_at desc);

create index account_activity_actor_idx
  on public.account_activity (actor_account_id, occurred_at desc)
  where actor_account_id is not null;

alter table public.account_activity enable row level security;

grant select on public.account_activity to authenticated;

create policy account_activity_staff_read on public.account_activity
  for select to authenticated using ((select app.is_staff()));

-- As with audit_events: no INSERT, UPDATE or DELETE policy for anyone. Rows
-- arrive through the SECURITY DEFINER functions below.

-- The member's own record of what they did. Kinds under `account.` and
-- `auth.sign_in_failed` are reserved: they describe things done *to* an
-- account, and an account must not be able to write those about itself.
create or replace function public.record_activity(
  p_kind                text,
  p_candidate_id        uuid default null,
  p_target_candidate_id uuid default null,
  p_detail              jsonb default '{}'::jsonb,
  p_path                text default null,
  p_ip                  text default null,
  p_user_agent          text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_account uuid := auth.uid();
  v_kind    text := lower(btrim(coalesce(p_kind, '')));
  v_target  uuid := p_target_candidate_id;
  v_detail  jsonb := coalesce(p_detail, '{}'::jsonb);
  v_window  interval;
begin
  if v_account is null then
    return;  -- nobody to attach it to
  end if;

  if v_kind like 'account.%' or v_kind = 'auth.sign_in_failed' then
    raise exception 'forbidden: % is recorded by the database only', v_kind using errcode = '42501';
  end if;

  -- A profile opened from Discover names who was looked at.
  if v_target is null and p_path ~ '^/discover/[0-9a-f-]{36}$' then
    v_target := substring(p_path from 11)::uuid;
  end if;

  -- A reload, a double tap or an autosave is one event, not five.
  v_window := case when v_kind = 'biodata.draft_saved' then interval '10 minutes' else interval '1 minute' end;
  if exists (
    select 1 from public.account_activity x
    where x.account_id = v_account
      and x.kind = v_kind
      and x.occurred_at > now() - v_window
      and x.path is not distinct from p_path
      and x.candidate_id is not distinct from p_candidate_id
      and x.target_candidate_id is not distinct from v_target
      and x.detail = v_detail
  ) then
    return;
  end if;

  insert into public.account_activity
    (account_id, kind, actor_account_id, candidate_id, target_candidate_id, path, detail, ip, user_agent)
  values
    (v_account, v_kind, v_account, p_candidate_id, v_target,
     left(p_path, 300), v_detail, left(p_ip, 64), left(p_user_agent, 400));
end
$$;

-- A failed sign-in has no session, so it cannot come through record_activity.
-- Service role only: anyone could otherwise fill a stranger's timeline with
-- failures. Unknown numbers are dropped rather than stored.
create or replace function public.record_failed_sign_in(
  p_phone      text,
  p_reason     text default 'wrong_password',
  p_ip         text default null,
  p_user_agent text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_account uuid;
begin
  select a.id into v_account from public.accounts a where a.phone = p_phone;
  if v_account is null then
    return;
  end if;

  insert into public.account_activity (account_id, kind, detail, ip, user_agent)
  values (v_account, 'auth.sign_in_failed', jsonb_build_object('reason', left(p_reason, 40)),
          left(p_ip, 64), left(p_user_agent, 400));
end
$$;

-- ------------------------------------------------- who may manage whom -----
-- Admins manage members. Only the superadmin manages staff, so one admin
-- cannot lock out another. Nobody manages their own account from here: the
-- one mistake that cannot be undone from the screen that made it.
create or replace function app.can_manage_account(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_admin()
     and p_target is distinct from auth.uid()
     and (
       app.has_role('superadmin')
       or not exists (select 1 from public.account_roles r where r.account_id = p_target)
     )
$$;

create or replace function app.require_manage_account(p_target uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'forbidden: only an admin can change accounts' using errcode = '42501';
  end if;
  if not exists (select 1 from public.accounts a where a.id = p_target) then
    raise exception 'not_found: no such account' using errcode = 'P0002';
  end if;
  if p_target = auth.uid() then
    raise exception 'forbidden: you cannot change your own account here' using errcode = '42501';
  end if;
  if not app.can_manage_account(p_target) then
    raise exception 'forbidden: only the superadmin can change a staff account' using errcode = '42501';
  end if;
end
$$;

-- ---------------------------------------------------- directory hiding -----
-- A candidate whose every operator has been switched off leaves the
-- directory. Every, not any: a parent being blocked should not hide a son who
-- runs his own account in good standing.
create or replace function app.set_candidate_discoverability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.discoverable :=
        new.identity_status = 'verified'
    and new.publication_status = 'published'
    and new.published_revision_id is not null
    and not new.paused
    and new.match_found_at is null
    and new.deleted_at is null
    -- Spec §5: withdrawn consent hides the profile immediately.
    and app.has_active_consent(new.id)
    and exists (
      select 1
      from public.candidate_memberships m
      join public.accounts a on a.id = m.account_id
      where m.candidate_id = new.id
        and m.revoked_at is null
        and a.status = 'active'
    );

  return new;
end
$$;

-- ------------------------------------------------------ status changes -----
create or replace function public.admin_set_account_status(
  p_account_id uuid,
  p_status     public.account_status,
  p_reason     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_from   public.account_status;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform app.require_manage_account(p_account_id);

  if p_status not in ('active', 'disabled', 'blocked') then
    raise exception 'invalid: status' using errcode = '22023';
  end if;
  if p_status = 'blocked' and v_reason is null then
    raise exception 'invalid: reason' using errcode = '22023';
  end if;

  select a.status into v_from from public.accounts a where a.id = p_account_id for update;
  if v_from = p_status then
    return jsonb_build_object('status', p_status, 'changed', false);
  end if;

  update public.accounts
     set status = p_status,
         suspension_reason = case when p_status = 'active' then null else v_reason end
   where id = p_account_id;

  -- GoTrue refuses sign-in and token refresh while banned_until is in the
  -- future. A century rather than 'infinity', which its Go time parser rejects.
  update auth.users
     set banned_until = case when p_status = 'active' then null else now() + interval '100 years' end
   where id = p_account_id;

  if p_status <> 'active' then
    -- Ends every session. Refresh tokens cascade from sessions, so nothing can
    -- be renewed; an access token already issued lives out its hour, and the
    -- app's own guard turns that hour away (access_state becomes 'suspended').
    delete from auth.sessions s where s.user_id = p_account_id;
  end if;

  -- Re-evaluate the directory for every candidate this account runs.
  update public.candidates c
     set updated_at = now()
   where c.id in (
     select m.candidate_id from public.candidate_memberships m
     where m.account_id = p_account_id and m.revoked_at is null
   );

  insert into public.account_activity (account_id, kind, actor_account_id, detail)
  values (p_account_id, 'account.status_changed', auth.uid(),
          jsonb_strip_nulls(jsonb_build_object('from', v_from, 'to', p_status, 'reason', left(v_reason, 500))));

  return jsonb_build_object('status', p_status, 'changed', true);
end
$$;

-- ------------------------------------------------------ password reset -----
create or replace function public.admin_reset_password(
  p_account_id uuid,
  p_password   text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_manage_account(p_account_id);

  -- The app's own minimum, and bcrypt's maximum (it ignores bytes past 72).
  if length(coalesce(p_password, '')) < 8 or octet_length(p_password) > 72 then
    raise exception 'invalid: password' using errcode = '22023';
  end if;

  -- Same hash GoTrue writes, so its sign-in check accepts it unchanged.
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = p_account_id;

  -- Whoever held the old password is signed out everywhere.
  delete from auth.sessions s where s.user_id = p_account_id;

  -- Never the password itself.
  insert into public.account_activity (account_id, kind, actor_account_id)
  values (p_account_id, 'account.password_reset', auth.uid());
end
$$;

-- ---------------------------------------------------------------- reads ----
create or replace function app.account_candidates(p_account_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'full_name', c.full_name,
           'public_code', c.public_code,
           'relationship', m.relationship,
           'identity_status', c.identity_status,
           'discoverable', c.discoverable
         ) order by m.linked_at), '[]'::jsonb)
  from public.candidate_memberships m
  join public.candidates c on c.id = m.candidate_id
  where m.account_id = p_account_id
    and m.revoked_at is null
    and c.deleted_at is null
$$;

-- The list, with counts for each tab over the same search. "Disabled" takes in
-- the older `suspended` too, so no switched-off account falls between tabs.
create or replace function public.admin_list_accounts(
  p_query  text default null,
  p_filter text default 'all',
  p_limit  integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query  text := nullif(btrim(coalesce(p_query, '')), '');
  -- As in admin_registration_queue: only compare phones when the query has
  -- digits, or a name search matches every number.
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  v_result jsonb;
begin
  perform app.require_staff();

  with base as (
    select
      a.id, a.phone, a.display_name, a.status, a.created_at,
      u.last_sign_in_at,
      (select max(x.occurred_at) from public.account_activity x where x.account_id = a.id) as last_active_at,
      coalesce((select array_agg(r.role::text order by r.role)
                from public.account_roles r where r.account_id = a.id), '{}') as roles,
      app.account_candidates(a.id) as candidates
    from public.accounts a
    left join auth.users u on u.id = a.id
  ),
  matched as (
    select * from base b
    where v_query is null
       or (length(v_digits) >= 3 and b.phone like '%' || v_digits || '%')
       or b.display_name ilike '%' || v_query || '%'
       or exists (
         select 1 from jsonb_array_elements(b.candidates) c
         where c ->> 'full_name' ilike '%' || v_query || '%'
            or c ->> 'public_code' ilike '%' || v_query || '%'
       )
  ),
  filtered as (
    select * from matched m
    where case p_filter
      when 'active'   then m.status = 'active'
      when 'disabled' then m.status in ('disabled', 'suspended')
      when 'blocked'  then m.status = 'blocked'
      when 'staff'    then cardinality(m.roles) > 0
      else true
    end
  )
  select jsonb_build_object(
    'counts', (
      select jsonb_build_object(
        'all',      count(*),
        'active',   count(*) filter (where m.status = 'active'),
        'disabled', count(*) filter (where m.status in ('disabled', 'suspended')),
        'blocked',  count(*) filter (where m.status = 'blocked'),
        'staff',    count(*) filter (where cardinality(m.roles) > 0)
      )
      from matched m
    ),
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.seen desc nulls last, p.id)
      from (
        select f.id, f.phone, f.display_name, f.status, f.created_at,
               f.last_sign_in_at, f.last_active_at, f.roles, f.candidates,
               greatest(f.last_active_at, f.last_sign_in_at, f.created_at) as seen
        from filtered f
        order by seen desc nulls last, f.id
        limit least(greatest(coalesce(p_limit, 30), 1), 100)
        offset greatest(coalesce(p_offset, 0), 0)
      ) p
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;

create or replace function public.admin_account_detail(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform app.require_staff();

  select jsonb_build_object(
    'id', a.id,
    'phone', a.phone,
    'display_name', a.display_name,
    'status', a.status,
    'status_reason', a.suspension_reason,
    'preferred_language', a.preferred_language,
    'created_at', a.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'rules_version', u.raw_user_meta_data ->> 'rules_version',
    'rules_accepted_at', u.raw_user_meta_data ->> 'rules_accepted_at',
    'roles', coalesce((select jsonb_agg(r.role order by r.role)
                       from public.account_roles r where r.account_id = a.id), '[]'::jsonb),
    'candidates', app.account_candidates(a.id),
    'sign_ins', (select count(*) from public.account_activity x
                 where x.account_id = a.id and x.kind = 'auth.sign_in'),
    'failed_sign_ins_week', (select count(*) from public.account_activity x
                             where x.account_id = a.id and x.kind = 'auth.sign_in_failed'
                               and x.occurred_at > now() - interval '7 days'),
    'last_password_reset_at', (select max(x.occurred_at) from public.account_activity x
                               where x.account_id = a.id and x.kind = 'account.password_reset'),
    'can_manage', app.can_manage_account(a.id)
  )
  into v_result
  from public.accounts a
  left join auth.users u on u.id = a.id
  where a.id = p_account_id;

  if v_result is null then
    raise exception 'not_found: no such account' using errcode = 'P0002';
  end if;

  return v_result;
end
$$;

-- One timeline from four sources:
--   * what the account did, and what was done to it (account_activity);
--   * staff decisions on its applications and biodata (review_decisions);
--   * for staff, the decisions they made and the accounts they changed.
-- Names are resolved at read time, so the log itself holds only identifiers.
create or replace function public.admin_account_activity(
  p_account_id uuid,
  p_before     timestamptz default null,
  p_limit      integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform app.require_staff();

  with mine as (
    -- Revoked links too: history from before a link ended is still theirs.
    select m.candidate_id from public.candidate_memberships m where m.account_id = p_account_id
  ),
  events as (
    select x.id::text as id, x.occurred_at, x.kind, x.actor_account_id, x.candidate_id,
           x.target_candidate_id, null::uuid as subject_account_id,
           x.path, x.detail, x.ip, x.user_agent
    from public.account_activity x
    where x.account_id = p_account_id

    union all

    select 'r' || d.id, d.created_at, 'review.' || d.subject_type || '.' || d.action,
           d.actor_account_id, d.candidate_id, null, null, null,
           jsonb_strip_nulls(jsonb_build_object(
             'from', d.from_status, 'to', d.to_status, 'reason', d.reason_applicant,
             'fields', case when cardinality(d.fields) > 0 then to_jsonb(d.fields) end)),
           null, null
    from public.review_decisions d
    where d.candidate_id in (select candidate_id from mine)
      and d.actor_account_id is distinct from p_account_id
      and d.action not in ('claim', 'release')

    union all

    select 's' || d.id, d.created_at, 'staff.' || d.subject_type || '.' || d.action,
           d.actor_account_id, d.candidate_id, null, null, null,
           jsonb_strip_nulls(jsonb_build_object('from', d.from_status, 'to', d.to_status)),
           null, null
    from public.review_decisions d
    where d.actor_account_id = p_account_id

    union all

    select 'a' || x.id, x.occurred_at, 'staff.' || x.kind, x.actor_account_id, null, null,
           x.account_id, null, x.detail, null, null
    from public.account_activity x
    where x.actor_account_id = p_account_id
      and x.account_id <> p_account_id
  ),
  page as (
    select * from events e
    where p_before is null or e.occurred_at < p_before
    order by e.occurred_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200)
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', e.id,
           'occurred_at', e.occurred_at,
           'kind', e.kind,
           'detail', e.detail,
           'path', e.path,
           'ip', e.ip,
           'user_agent', e.user_agent,
           'by_self', e.actor_account_id = p_account_id,
           'actor', case when e.actor_account_id is not null and e.actor_account_id <> p_account_id
                         then jsonb_build_object('id', actor.id, 'phone', actor.phone, 'name', actor.display_name) end,
           'candidate', case when c.id is not null
                             then jsonb_build_object('id', c.id, 'name', c.full_name, 'code', c.public_code) end,
           'target', case when tc.id is not null
                          then jsonb_build_object('id', tc.id, 'name', tc.full_name, 'code', tc.public_code) end,
           'subject', case when sa.id is not null
                           then jsonb_build_object('id', sa.id, 'phone', sa.phone, 'name', sa.display_name) end
         )) order by e.occurred_at desc), '[]'::jsonb)
  into v_result
  from page e
  left join public.accounts actor on actor.id = e.actor_account_id
  left join public.candidates c on c.id = e.candidate_id
  left join public.candidates tc on tc.id = e.target_candidate_id
  left join public.accounts sa on sa.id = e.subject_account_id;

  return v_result;
end
$$;

-- ---------------------------------------------------------------- grants ---
revoke execute on function public.record_activity(text, uuid, uuid, jsonb, text, text, text) from public, anon;
revoke execute on function public.record_failed_sign_in(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_set_account_status(uuid, public.account_status, text) from public, anon;
revoke execute on function public.admin_reset_password(uuid, text) from public, anon;
revoke execute on function public.admin_list_accounts(text, text, integer, integer) from public, anon;
revoke execute on function public.admin_account_detail(uuid) from public, anon;
revoke execute on function public.admin_account_activity(uuid, timestamptz, integer) from public, anon;

grant execute on function public.record_activity(text, uuid, uuid, jsonb, text, text, text) to authenticated;
grant execute on function public.record_failed_sign_in(text, text, text, text) to service_role;
grant execute on function public.admin_set_account_status(uuid, public.account_status, text) to authenticated;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;
grant execute on function public.admin_list_accounts(text, text, integer, integer) to authenticated;
grant execute on function public.admin_account_detail(uuid) to authenticated;
grant execute on function public.admin_account_activity(uuid, timestamptz, integer) to authenticated;
