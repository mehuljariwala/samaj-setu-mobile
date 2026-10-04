-- ---------------------------------------------------------------------------
-- A family can take back an application that is waiting for review, change
-- it, and send it again.
--
-- Families find out after sending that something should be different — most
-- often that they meant to send the school leaving certificate rather than
-- the birth certificate. A submitted application was frozen until an admin
-- decided, so they had to wait out the review only to be asked for the fix.
--
-- Taking it back returns it to draft, which is the state the registration
-- form already opens for. That also takes it out of the review queue, so a
-- reviewer is never looking at details that are changing underneath them; if
-- one already had it open, their decision fails the expected-status check
-- rather than landing on the edited version. Sending it again starts a fresh
-- 24-hour target, because the target runs from a complete submission (spec §3)
-- and the edited application is a new one to check.
--
-- The earlier submission is not lost: review_decisions keeps the send and the
-- taking back, and `declared` keeps what was sent until the next send
-- replaces it.
-- ---------------------------------------------------------------------------

create or replace function public.edit_my_registration(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.registration_applications;
begin
  select * into v_app from public.registration_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'not_found: no such application' using errcode = 'P0002';
  end if;
  perform app.require_operator(v_app.candidate_id);

  if not app.account_is_active() then
    raise exception 'forbidden: this account is not active' using errcode = '42501';
  end if;

  if v_app.status not in ('submitted', 'under_review') then
    raise exception 'conflict: only an application waiting for review can be taken back (%)', v_app.status
      using errcode = 'P0001';
  end if;

  update public.registration_applications
     set status = 'draft', submitted_at = null, review_due_at = null
   where id = p_application_id;

  update public.candidates set identity_status = 'unverified'
   where id = v_app.candidate_id;

  delete from public.review_claims
   where subject_type = 'registration' and subject_id = p_application_id;

  perform app.record_decision(
    'registration', p_application_id, v_app.candidate_id, 'reopen',
    v_app.status::text, 'draft'
  );

  return jsonb_build_object('status', 'draft');
end
$$;

comment on function public.edit_my_registration(uuid) is
  'An operator takes back their application while it waits for review, to '
  'change it and send it again. It leaves the queue until it is resent.';

revoke execute on function public.edit_my_registration(uuid) from public, anon;
grant execute on function public.edit_my_registration(uuid) to authenticated, service_role;
