-- ---------------------------------------------------------------------------
-- User management: who may switch accounts off, reset passwords and read the
-- activity log, and what each of those actually does.
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

create or replace function pg_temp.denied(p_user uuid, p_sql text)
returns boolean
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  execute p_sql;
  return false;
exception
  when insufficient_privilege or raise_exception or no_data_found
    or check_violation or invalid_parameter_value then
    return true;
end
$$;

create or replace function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end
$$;

do $$
declare
  v_super   uuid := '00000000-0000-4000-8000-000000000001';
  v_admin   uuid := '00000000-0000-4000-8000-000000000002';
  v_rajesh  uuid := '00000000-0000-4000-8000-000000000010';
  v_member  uuid;
  v_cand    uuid;
  v_list    jsonb;
  v_hash    text;
  v_rows    jsonb;
  v_count   integer;
begin
  -- A published candidate with exactly one operator, so switching that
  -- operator off must take the profile out of the directory.
  select c.id, m.account_id into v_cand, v_member
  from public.candidates c
  join public.candidate_memberships m on m.candidate_id = c.id and m.revoked_at is null
  where c.discoverable
    and (select count(*) from public.candidate_memberships m2
         where m2.candidate_id = c.id and m2.revoked_at is null) = 1
    and not exists (select 1 from public.account_roles r where r.account_id = m.account_id)
  limit 1;
  perform pg_temp.ok(v_cand is not null, 'the seed has a discoverable single-operator candidate');

  -- ------------------------------------------------------------ members ---
  set local role authenticated;
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, 'select public.admin_list_accounts()'),
    'a member cannot list accounts');
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format('select public.admin_account_activity(%L)', v_member)),
    'a member cannot read another account''s activity');
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format('select public.admin_set_account_status(%L, ''blocked'', ''x'')', v_member)),
    'a member cannot block an account');
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format('select public.admin_reset_password(%L, ''new-password-1'')', v_member)),
    'a member cannot reset a password');
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, 'select public.record_failed_sign_in(''9876543210'')'),
    'a member cannot record failed sign-ins against someone else');
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, 'select public.record_activity(''account.password_reset'')'),
    'a member cannot write reserved account.* events about themselves');
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, 'select count(*) from public.account_activity')
      or (select count(*) from public.account_activity) = 0,
    'a member reads no activity rows');

  -- ------------------------------------------------------ own activity ----
  perform pg_temp.as_user(v_rajesh);
  perform public.record_activity('page.view', p_path => '/discover/' || v_cand::text);
  perform public.record_activity('page.view', p_path => '/discover/' || v_cand::text);
  reset role;
  select count(*) into v_count from public.account_activity
  where account_id = v_rajesh and kind = 'page.view';
  perform pg_temp.ok(v_count = 1, 'a repeated page view within a minute is recorded once');
  perform pg_temp.ok(
    (select target_candidate_id from public.account_activity
     where account_id = v_rajesh and kind = 'page.view') = v_cand,
    'a Discover profile view records whose profile was opened');

  -- ------------------------------------------------------------- admins ---
  set local role authenticated;
  perform pg_temp.as_user(v_admin);
  v_list := public.admin_list_accounts('Rajesh');
  perform pg_temp.ok(
    (v_list -> 'counts' ->> 'all')::int < (public.admin_list_accounts() -> 'counts' ->> 'all')::int,
    'a name search does not match every phone number');

  perform pg_temp.ok(
    pg_temp.denied(v_admin, format('select public.admin_set_account_status(%L, ''disabled'')', v_admin)),
    'an admin cannot switch off their own account');
  perform pg_temp.ok(
    pg_temp.denied(v_admin, format('select public.admin_set_account_status(%L, ''disabled'')', v_super)),
    'an admin cannot switch off the superadmin');
  perform pg_temp.ok(
    pg_temp.denied(v_admin, format('select public.admin_reset_password(%L, ''new-password-1'')', v_super)),
    'an admin cannot reset a staff password');
  perform pg_temp.ok(
    pg_temp.denied(v_admin, format('select public.admin_set_account_status(%L, ''blocked'')', v_member)),
    'blocking needs a reason');
  perform pg_temp.ok(
    pg_temp.denied(v_admin, format('select public.admin_reset_password(%L, ''short'')', v_member)),
    'a reset password needs eight characters');
  reset role;

  -- --------------------------------------------------------------- block --
  insert into auth.sessions (user_id) values (v_member), (v_member);

  set local role authenticated;
  perform pg_temp.as_user(v_admin);
  perform public.admin_set_account_status(v_member, 'blocked', 'Fake profile reported by two families');
  reset role;

  perform pg_temp.ok((select status from public.accounts where id = v_member) = 'blocked',
    'blocking sets the account status');
  perform pg_temp.ok((select banned_until from auth.users where id = v_member) > now() + interval '50 years',
    'blocking bans the auth user, so GoTrue refuses sign-in');
  perform pg_temp.ok(not exists (select 1 from auth.sessions where user_id = v_member),
    'blocking ends every session');
  perform pg_temp.ok(not (select discoverable from public.candidates where id = v_cand),
    'a blocked operator''s only candidate leaves the directory');

  set local role authenticated;
  perform pg_temp.as_user(v_member);
  perform pg_temp.ok(app.access_state() = 'suspended',
    'a blocked account''s still-valid token resolves to suspended');
  reset role;

  -- -------------------------------------------------------------- enable --
  set local role authenticated;
  perform pg_temp.as_user(v_admin);
  perform public.admin_set_account_status(v_member, 'active');
  reset role;

  perform pg_temp.ok((select banned_until from auth.users where id = v_member) is null,
    'enabling lifts the ban');
  perform pg_temp.ok((select suspension_reason from public.accounts where id = v_member) is null,
    'enabling clears the reason');
  perform pg_temp.ok((select discoverable from public.candidates where id = v_cand),
    'enabling brings the candidate back to the directory');

  -- ------------------------------------------------------ password reset --
  insert into auth.sessions (user_id) values (v_member);

  set local role authenticated;
  perform pg_temp.as_user(v_admin);
  perform public.admin_reset_password(v_member, 'Samaj-4829-new');
  reset role;

  select encrypted_password into v_hash from auth.users where id = v_member;
  perform pg_temp.ok(v_hash = extensions.crypt('Samaj-4829-new', v_hash),
    'the new password verifies against the stored bcrypt hash');
  perform pg_temp.ok(not exists (select 1 from auth.sessions where user_id = v_member),
    'a password reset signs the account out everywhere');
  perform pg_temp.ok(not exists (
      select 1 from public.account_activity
      where detail::text like '%Samaj-4829%' or coalesce(path, '') like '%Samaj-4829%'),
    'the password never reaches the activity log');

  -- ------------------------------------------------------------ timeline --
  set local role authenticated;
  perform pg_temp.as_user(v_admin);
  v_rows := public.admin_account_activity(v_member);
  perform pg_temp.ok(
    exists (select 1 from jsonb_array_elements(v_rows) r
            where r ->> 'kind' = 'account.status_changed'
              and r -> 'detail' ->> 'to' = 'blocked'
              and r -> 'actor' ->> 'id' = v_admin::text),
    'the member''s timeline shows who blocked them');
  perform pg_temp.ok(
    exists (select 1 from jsonb_array_elements(v_rows) r where r ->> 'kind' = 'account.password_reset'),
    'the member''s timeline shows the password reset');

  v_rows := public.admin_account_activity(v_admin);
  perform pg_temp.ok(
    exists (select 1 from jsonb_array_elements(v_rows) r
            where r ->> 'kind' = 'staff.account.password_reset'
              and r -> 'subject' ->> 'id' = v_member::text),
    'the admin''s own timeline shows whose password they reset');

  perform pg_temp.ok((public.admin_account_detail(v_member) ->> 'can_manage')::boolean,
    'an admin may manage a member');
  perform pg_temp.ok(not (public.admin_account_detail(v_super) ->> 'can_manage')::boolean,
    'an admin may not manage the superadmin');
  reset role;

  -- ---------------------------------------------------------- superadmin --
  set local role authenticated;
  perform pg_temp.as_user(v_super);
  perform public.admin_set_account_status(v_admin, 'disabled');
  perform public.admin_set_account_status(v_admin, 'active');
  reset role;
  perform pg_temp.ok((select status from public.accounts where id = v_admin) = 'active',
    'the superadmin can switch an admin off and on again');

  perform set_config('request.jwt.claims', null, false);
  raise notice 'user management assertions passed';
end
$$;
