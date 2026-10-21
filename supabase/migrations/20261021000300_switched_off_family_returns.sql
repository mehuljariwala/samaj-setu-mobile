-- ---------------------------------------------------------------------------
-- A family an admin switched off can come back on the same number.
--
-- The samaj asked on 2026-10-21: "આપણી તરફથી જે નંબર બંધ કર્યું હોય તે
-- નંબરથી ફરીવાર બધા ડેટા અપડેટ કરે તો એ નંબરથી અપડેટ થવું જોઈએ". A family is
-- most often switched off once its son or daughter is married through the
-- bureau (rule 5); if that changes, it should not need a new number or a
-- volunteer to begin again.
--
-- So a switched-off (`disabled`) family account may sign in again. Its access
-- state is still `suspended`, so it cannot browse, send interest or see anyone;
-- the app lets it open only its own biodata, update it and send it for
-- approval. When an admin approves a biodata version, every switched-off
-- account that runs that candidate is switched back on, and the profile
-- returns to the directory as approval always returns it.
--
-- `blocked` is unchanged: no sign-in at all. Staff accounts switched off stay
-- locked out too.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------ status changes -----
-- Same as 20260929000200, except that only a blocked account, or a staff
-- account switched off, is banned from signing in.
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
  -- A family that is only switched off may still sign in, to update its
  -- biodata and send it back (see the header); a blocked account and a
  -- switched-off staff account may not.
  update auth.users
     set banned_until = case
           when p_status = 'blocked'
             or (p_status = 'disabled'
                 and exists (select 1 from public.account_roles r where r.account_id = p_account_id))
           then now() + interval '100 years'
         end
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

-- Families switched off before today may sign in from now on.
update auth.users u
   set banned_until = null
  from public.accounts a
 where a.id = u.id
   and a.status = 'disabled'
   and not exists (select 1 from public.account_roles r where r.account_id = a.id);

-- ------------------------------------------- approval switches it back on --
create or replace function app.switch_family_back_on()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  with back_on as (
    update public.accounts a
       set status = 'active', suspension_reason = null
     where a.status = 'disabled'
       and not exists (select 1 from public.account_roles r where r.account_id = a.id)
       and a.id in (
         select m.account_id from public.candidate_memberships m
          where m.candidate_id = new.candidate_id and m.revoked_at is null
       )
    returning a.id
  )
  insert into public.account_activity (account_id, kind, actor_account_id, candidate_id, detail)
  select b.id, 'account.status_changed', auth.uid(), new.candidate_id,
         jsonb_build_object('from', 'disabled', 'to', 'active', 'reason', 'biodata_approved')
    from back_on b;

  return new;
end
$$;

-- After the row is written, so the approval itself is settled first; the
-- candidate row the approval updates next then sees an active operator and
-- comes back to the directory.
create trigger biodata_approval_switches_family_back_on
  after update of status on public.biodata_revisions
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function app.switch_family_back_on();
