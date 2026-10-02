-- ---------------------------------------------------------------------------
-- A family can reopen its own rejected application and send it again.
--
-- 20260929000300 let an admin turn a rejection into a request for a fix. That
-- still left the family waiting on a phone call to a volunteer before they
-- could do anything, when what most rejections ask for ("Pic clear nathi") is
-- a better photo and another try.
--
-- So an operator of the candidate may now reopen a rejected application
-- themselves. It goes back to correction_requested, which is the state the
-- registration form already reopens for, and from there the family edits,
-- re-uploads and resubmits through the same screens and the same RPCs. The
-- admin's reason stays on the application, because it is what they are fixing,
-- and the resubmission arrives in the queue with resubmit_count raised, so the
-- reviewer can see it has been here before.
--
-- The family names no fields: the admin did not name any when rejecting, and
-- every field is open to them anyway. A correction asked for by an admin still
-- has to name its fields — admin_decide_registration refuses one that does not
-- — so the table-level rule that said so for every correction is narrowed to
-- the function that owns that decision.
-- ---------------------------------------------------------------------------

alter table public.registration_applications
  drop constraint applications_correction_names_fields;

create or replace function public.reopen_my_registration(p_application_id uuid)
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

  if v_app.status <> 'rejected' then
    raise exception 'conflict: only a rejected application can be reopened (%)', v_app.status
      using errcode = 'P0001';
  end if;

  -- decided_at, decided_by and the reason are left as the admin set them: the
  -- decision on record is still their rejection, and the family is answering it.
  update public.registration_applications
     set status = 'correction_requested', correction_fields = '{}'
   where id = p_application_id;

  update public.candidates set identity_status = 'correction_requested'
   where id = v_app.candidate_id;

  perform app.record_decision(
    'registration', p_application_id, v_app.candidate_id, 'reopen',
    'rejected', 'correction_requested'
  );

  return jsonb_build_object('status', 'correction_requested');
end
$$;

comment on function public.reopen_my_registration(uuid) is
  'An operator reopens their own rejected application to fix it and send it '
  'again. The admin''s reason is kept; nothing is approved by reopening.';

revoke execute on function public.reopen_my_registration(uuid) from public, anon;
grant execute on function public.reopen_my_registration(uuid) to authenticated, service_role;
