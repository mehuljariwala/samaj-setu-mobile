-- ---------------------------------------------------------------------------
-- A rejection can be turned into a request for a fix.
--
-- A rejection is final: the family cannot edit or resend, and there is one
-- application per candidate, so there is no second attempt either. That is
-- right for a real refusal, but a reviewer who presses "Reject" for something
-- the family could have fixed (a blurred photo, a wrong date) leaves them with
-- no way forward at all.
--
-- So an admin may now send a rejected application back as a correction. It is
-- the only decision allowed on a rejected application, and it needs an admin,
-- because it overturns an admin's decision. Everything else about a correction
-- is unchanged: it names the fields, carries a message, and the family edits
-- and resubmits through the same screens.
-- ---------------------------------------------------------------------------

create or replace function public.admin_decide_registration(
  p_application_id  uuid,
  p_action          public.review_action,
  p_expected_status public.application_status,
  p_reason          text default null,
  p_fields          text[] default '{}',
  p_internal_note   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app  public.registration_applications;
  v_open bigint;
  v_next public.application_status;
begin
  perform app.require_staff();
  if p_action = 'approve' or p_action = 'reject' then
    perform app.require_admin();   -- moderators may ask for corrections, not decide
  end if;

  select * into v_app from public.registration_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'not_found: no such application' using errcode = 'P0002';
  end if;

  if v_app.status <> p_expected_status then
    raise exception 'conflict: this application is now %, not %', v_app.status, p_expected_status
      using errcode = 'P0001';
  end if;

  if v_app.status = 'rejected' then
    if p_action <> 'request_correction' then
      raise exception 'conflict: a rejected application can only be sent back for a fix'
        using errcode = 'P0001';
    end if;
    perform app.require_admin();   -- overturning a refusal is an admin's call
  elsif v_app.status not in ('submitted', 'under_review') then
    raise exception 'conflict: only a submitted application can be decided (%)', v_app.status
      using errcode = 'P0001';
  end if;

  if p_action = 'approve' then
    -- Spec §4: possible duplicates are resolved by a human before anything is
    -- approved, so that an approval can never be the thing that creates a
    -- second canonical profile.
    select count(*) into v_open from public.duplicate_candidates
     where application_id = p_application_id and status = 'open';
    if v_open > 0 then
      raise exception 'conflict: % possible duplicate(s) must be resolved first', v_open
        using errcode = 'P0001';
    end if;

    v_next := 'approved';
    update public.registration_applications
       set status = v_next, decided_at = now(),
           decided_by_account_id = app.current_account_id(),
           decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
           correction_fields = '{}'
     where id = p_application_id;

    update public.candidates set identity_status = 'verified' where id = v_app.candidate_id;
    perform app.apply_publication_state(v_app.candidate_id);

  elsif p_action = 'request_correction' then
    if p_fields is null or cardinality(p_fields) = 0 then
      raise exception 'invalid: name the fields that need correcting' using errcode = 'P0001';
    end if;
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception 'invalid: an applicant-facing explanation is required' using errcode = 'P0001';
    end if;

    v_next := 'correction_requested';
    update public.registration_applications
       set status = v_next, decided_at = now(),
           decided_by_account_id = app.current_account_id(),
           decision_reason = btrim(p_reason), correction_fields = p_fields
     where id = p_application_id;

    update public.candidates set identity_status = 'correction_requested'
     where id = v_app.candidate_id;

  elsif p_action = 'reject' then
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception 'invalid: a rejection reason is required' using errcode = 'P0001';
    end if;

    v_next := 'rejected';
    update public.registration_applications
       set status = v_next, decided_at = now(),
           decided_by_account_id = app.current_account_id(),
           decision_reason = btrim(p_reason), correction_fields = '{}'
     where id = p_application_id;

    update public.candidates
       set identity_status = 'rejected',
           publication_status = case when publication_status = 'published'
                                     then 'unpublished' else publication_status end
     where id = v_app.candidate_id;

  else
    raise exception 'invalid: % is not a decision', p_action using errcode = 'P0001';
  end if;

  perform app.record_decision(
    'registration', p_application_id, v_app.candidate_id, p_action,
    v_app.status::text, v_next::text, coalesce(p_fields, '{}'), p_reason, p_internal_note
  );

  delete from public.review_claims
   where subject_type = 'registration' and subject_id = p_application_id;

  -- The notification carries the decision, not the reason: spec §12 keeps
  -- personal detail out of notifications and off the source-of-truth path.
  perform app.notify_operators(
    v_app.candidate_id, 'registration_decided',
    jsonb_build_object('application_id', p_application_id, 'outcome', v_next)
  );

  return jsonb_build_object('status', v_next);
end
$$;
