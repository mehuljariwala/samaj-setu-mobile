-- ---------------------------------------------------------------------------
-- Notifications and the audit trail (spec §10, §12).
-- ---------------------------------------------------------------------------

-- Spec §12: "Notifications must not leak personal details and must not become
-- the source of truth for approval state."
--
-- The payload therefore carries identifiers and codes only — enough for the
-- client to fetch the real record, which re-runs every authorisation check. The
-- constraint below is a blunt instrument, but it turns "we agreed not to put
-- names in notifications" into something the database enforces.
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  kind          public.notification_kind not null,
  candidate_id  uuid references public.candidates(id) on delete cascade,
  payload       jsonb not null default '{}'::jsonb,
  read_at       timestamptz,
  created_at    timestamptz not null default now(),

  constraint notifications_payload_has_no_personal_details
    check (not (payload ?| array[
      'name', 'full_name', 'candidate_name', 'display_name',
      'phone', 'email', 'address',
      'photo', 'photo_url', 'certificate', 'certificate_url',
      'biodata', 'father_name', 'mother_name'
    ]))
);

create index notifications_inbox_idx
  on public.notifications (account_id, created_at desc);

create index notifications_unread_idx
  on public.notifications (account_id)
  where read_at is null;

-- Outbound SMS / push, once a provider exists. Spec §12 requires external
-- notification setup to be named as an integration requirement rather than
-- simulated: nothing drains this table today, so a row here means "queued",
-- never "delivered".
create table public.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete cascade,
  channel         text not null check (channel in ('sms', 'push', 'email')),
  destination     text not null,
  template        text not null,
  variables       jsonb not null default '{}'::jsonb,
  status          text not null default 'queued'
                  check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts        integer not null default 0 check (attempts >= 0),
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

comment on table public.notification_outbox is
  'Queued outbound messages. No deliverer is configured; see docs/backend/operations.md. '
  'Rows accumulate until an SMS/push provider is chosen and wired up.';

create index notification_outbox_pending_idx
  on public.notification_outbox (created_at)
  where status = 'queued';

-- ----------------------------------------------------------------- audit ---
-- Spec §10: "Record actor, timestamp, reason, and affected revision for every
-- decision." review_decisions covers moderation; this is the catch-all for
-- everything else that touches a protected record.
--
-- Append-only. No UPDATE or DELETE policy exists for any role, and the grants
-- in the RLS migration withhold those privileges even from authenticated.
create table public.audit_events (
  id             bigint generated always as identity primary key,
  occurred_at    timestamptz not null default now(),
  actor_account_id uuid references public.accounts(id) on delete set null,
  actor_role     text,
  action         text not null,
  subject_table  text not null,
  subject_id     uuid,
  candidate_id   uuid references public.candidates(id) on delete set null,
  -- Column names that changed, plus before/after for status-like columns only.
  -- Values are deliberately not copied wholesale: spec §10 forbids sensitive
  -- documents appearing in logs, and an audit table is a log.
  changes        jsonb not null default '{}'::jsonb
);

create index audit_events_subject_idx
  on public.audit_events (subject_table, subject_id, occurred_at desc);

create index audit_events_actor_idx
  on public.audit_events (actor_account_id, occurred_at desc);

create index audit_events_candidate_idx
  on public.audit_events (candidate_id, occurred_at desc);

create or replace function app.audit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old      jsonb := '{}'::jsonb;
  v_new      jsonb := '{}'::jsonb;
  v_changed  text[];
  v_detail   jsonb := '{}'::jsonb;
  v_key      text;
  v_candidate uuid;
begin
  -- IF rather than CASE: PL/pgSQL binds record variables when it prepares an
  -- expression, and OLD is unassigned during INSERT.
  if tg_op <> 'INSERT' then
    v_old := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
  end if;

  select coalesce(array_agg(k order by k), '{}')
    into v_changed
  from (
    select key as k from jsonb_each(v_new)
    where tg_op <> 'UPDATE' or v_old -> key is distinct from v_new -> key
  ) c;

  if tg_op = 'UPDATE' and cardinality(v_changed) = 0 then
    return null;  -- nothing of substance changed; do not write an audit row
  end if;

  -- Only status-shaped columns carry their values into the log.
  foreach v_key in array v_changed loop
    if v_key = 'status' or v_key like '%\_status' or v_key like '%\_at' then
      v_detail := v_detail || jsonb_build_object(
        v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key)
      );
    end if;
  end loop;

  v_candidate := nullif(coalesce(v_new ->> 'candidate_id', v_old ->> 'candidate_id'), '')::uuid;
  if v_candidate is null and tg_table_name = 'candidates' then
    v_candidate := nullif(coalesce(v_new ->> 'id', v_old ->> 'id'), '')::uuid;
  end if;

  insert into public.audit_events
    (actor_account_id, actor_role, action, subject_table, subject_id, candidate_id, changes)
  values (
    app.current_account_id(),
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      current_user
    ),
    lower(tg_op),
    tg_table_name,
    -- Tables keyed by something other than `id` (account_roles) fall back to
    -- their owning account so the row is still findable.
    nullif(coalesce(v_new ->> 'id', v_old ->> 'id',
                    v_new ->> 'account_id', v_old ->> 'account_id'), '')::uuid,
    v_candidate,
    jsonb_build_object('columns', to_jsonb(v_changed)) || v_detail
  );

  return null;  -- AFTER trigger
end
$$;

comment on function app.audit_change() is
  'Generic AFTER trigger. Records which columns changed, and the before/after of '
  'status and timestamp columns only — never document paths, contact details or '
  'biodata values.';

create trigger audit_candidates
  after insert or update or delete on public.candidates
  for each row execute function app.audit_change();

create trigger audit_memberships
  after insert or update or delete on public.candidate_memberships
  for each row execute function app.audit_change();

create trigger audit_applications
  after insert or update or delete on public.registration_applications
  for each row execute function app.audit_change();

create trigger audit_documents
  after insert or update or delete on public.application_documents
  for each row execute function app.audit_change();

create trigger audit_revisions
  after insert or update or delete on public.biodata_revisions
  for each row execute function app.audit_change();

create trigger audit_consents
  after insert or update or delete on public.candidate_consents
  for each row execute function app.audit_change();

create trigger audit_access_requests
  after insert or update or delete on public.access_requests
  for each row execute function app.audit_change();

create trigger audit_roles
  after insert or update or delete on public.account_roles
  for each row execute function app.audit_change();

create trigger audit_media_grants
  after insert or update or delete on public.media_grants
  for each row execute function app.audit_change();

create trigger audit_contact_grants
  after insert or update or delete on public.contact_grants
  for each row execute function app.audit_change();

create trigger audit_share_links
  after insert or update or delete on public.share_links
  for each row execute function app.audit_change();

create trigger audit_community_rules
  after insert or update or delete on public.community_rules
  for each row execute function app.audit_change();
