-- ---------------------------------------------------------------------------
-- One approval: the family sends documents and biodata together, an admin
-- approves once, and the profile is live.
--
-- It used to take three rounds: an admin approved the identity, then the
-- family filled the biodata, then an admin approved that, then the candidate
-- consented (removed in 20261004000200). Every round was a wait, and each
-- correction doubled it. Now the biodata is filled in before the registration
-- is sent and travels with it:
--
--   registration sent            the biodata must be complete, and is sent too
--   registration approved        the biodata is approved and published
--   sent back for a fix          the biodata goes back too, with any biodata
--                                fields the admin named marked for fixing
--   rejected                     the biodata is refused with it
--   reopened after a rejection   the biodata reopens with it
--   taken back to change         the biodata goes back to draft
--
-- A trigger keeps the two in step rather than each RPC doing it, because the
-- registration moves through six functions (send, decide, reopen, take back,
-- identity change, admin send-back) and every one must carry the biodata the
-- same way. A family already verified before this change has no registration
-- left to send: their biodata still goes through admin_decide_biodata, whose
-- approval now publishes it at once. That is their one approval.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------- publish a revision -------
-- What admin_decide_biodata's approve branch does, for the registration's
-- approval to reuse.
create or replace function app.publish_revision(p_revision_id uuid, p_actor uuid)
returns public.publication_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev public.biodata_revisions;
begin
  select * into v_rev from public.biodata_revisions where id = p_revision_id for update;
  if v_rev.id is null then
    raise exception 'not_found: no such revision' using errcode = 'P0002';
  end if;

  update public.biodata_revisions
     set status = 'superseded', superseded_at = now()
   where candidate_id = v_rev.candidate_id and status = 'approved' and id <> p_revision_id;

  update public.biodata_revisions
     set status = 'approved', submitted_at = coalesce(submitted_at, now()),
         approved_at = now(), decided_at = now(), decided_by_account_id = p_actor,
         decision_reason = null, correction_fields = '{}'
   where id = p_revision_id;

  update public.revision_field_issues set resolved_at = now()
   where revision_id = p_revision_id and resolved_at is null;

  update public.candidates
     set published_revision_id = p_revision_id, publication_status = 'unpublished'
   where id = v_rev.candidate_id;

  perform app.sync_contacts_from_revision(p_revision_id);

  perform app.record_decision(
    'biodata_revision', p_revision_id, v_rev.candidate_id, 'approve',
    v_rev.status::text, 'approved', '{}', null, 'approved with the registration', p_revision_id
  );

  -- Unpublished until the identity is verified, which the registration's
  -- approval does next and then publishes.
  return app.apply_publication_state(v_rev.candidate_id);
end
$$;

-- ------------------------------------------- the biodata follows along ------
create or replace function app.carry_biodata_with_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev      public.biodata_revisions;
  v_cc       public.candidate_community;
  v_problems text;
  v_fields   text[];
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select * into v_rev from public.biodata_revisions
   where candidate_id = new.candidate_id
   order by version desc
   limit 1
   for update;

  if new.status = 'submitted' then
    if v_rev.id is null or v_rev.status not in ('draft', 'correction_requested') then
      -- Nothing open to send. A live member re-checking an identity change
      -- already has a published biodata; anyone else must send one with it.
      if not exists (select 1 from public.candidates
                      where id = new.candidate_id and published_revision_id is not null) then
        raise exception 'incomplete: biodata' using errcode = 'P0001';
      end if;
      return new;
    end if;

    select string_agg(field_key, ',' order by field_key) into v_problems
      from app.validate_biodata(v_rev.data, true);
    if v_problems is not null then
      raise exception 'incomplete: biodata,%', v_problems using errcode = 'P0001';
    end if;

    if cardinality(v_rev.unconfirmed_fields) > 0 then
      raise exception 'unconfirmed: %', array_to_string(v_rev.unconfirmed_fields, ',')
        using errcode = 'P0001';
    end if;

    -- As in submit_biodata: typing the form in by hand confirms the
    -- community details spec §7 asks to be confirmed.
    select * into v_cc from public.candidate_community where candidate_id = new.candidate_id;
    if v_cc.confirmed_at is null then
      if v_rev.source = 'guided' then
        update public.candidate_community
           set confirmed_at = now(), confirmed_by_account_id = app.current_account_id()
         where candidate_id = new.candidate_id;
      else
        raise exception 'unconfirmed: community_details' using errcode = 'P0001';
      end if;
    end if;

    update public.biodata_revisions
       set status = 'submitted', submitted_at = now(),
           decided_at = null, decided_by_account_id = null,
           decision_reason = null, correction_fields = '{}'
     where id = v_rev.id;

    update public.candidates set publication_status = 'in_review' where id = new.candidate_id;

    perform app.record_decision(
      'biodata_revision', v_rev.id, new.candidate_id, 'reopen',
      v_rev.status::text, 'submitted', '{}', null, 'sent with the registration', v_rev.id
    );

  elsif new.status = 'approved' then
    if v_rev.status in ('submitted', 'under_review') then
      perform app.publish_revision(v_rev.id, new.decided_by_account_id);
    end if;

  elsif new.status = 'correction_requested' then
    if v_rev.status in ('submitted', 'under_review', 'rejected') then
      -- The fields an admin names may be the registration's or the biodata's;
      -- the biodata keeps its own, and the form highlights them.
      v_fields := array(
        select f from unnest(new.correction_fields) f
         where exists (select 1 from public.biodata_fields b where b.key = f)
      );

      update public.biodata_revisions
         set status = 'correction_requested', decided_at = now(),
             decided_by_account_id = new.decided_by_account_id,
             decision_reason = coalesce(new.decision_reason, 'Please check and send again.'),
             correction_fields = v_fields
       where id = v_rev.id;

      delete from public.revision_field_issues where revision_id = v_rev.id;
      insert into public.revision_field_issues
        (revision_id, field_key, message_gu, message_en, created_by_account_id)
      select v_rev.id, f, coalesce(new.decision_reason, ''), coalesce(new.decision_reason, ''),
             new.decided_by_account_id
        from unnest(v_fields) f;

      update public.candidates set publication_status = 'correction_requested'
       where id = new.candidate_id;
    end if;

  elsif new.status = 'rejected' then
    if v_rev.status in ('submitted', 'under_review') then
      update public.biodata_revisions
         set status = 'rejected', decided_at = now(),
             decided_by_account_id = new.decided_by_account_id,
             decision_reason = coalesce(new.decision_reason, 'Not approved.')
       where id = v_rev.id;
      update public.candidates set publication_status = 'rejected' where id = new.candidate_id;
    end if;

  elsif new.status = 'draft' then
    if v_rev.status in ('submitted', 'under_review') then
      update public.biodata_revisions set status = 'draft', submitted_at = null where id = v_rev.id;
      update public.candidates set publication_status = 'draft' where id = new.candidate_id;
    end if;
  end if;

  return new;
end
$$;

create trigger registration_carries_biodata
  after update of status on public.registration_applications
  for each row execute function app.carry_biodata_with_registration();

-- ------------------------------------- the biodata opens with registration --
-- Same as 20260914001400, except for who may write: a family preparing or
-- fixing its registration fills the biodata too, so it no longer waits for
-- verification. While the registration is with an admin it stays closed.
create or replace function public.save_biodata_draft(
  p_candidate_id uuid,
  p_data         jsonb,
  p_source       text default 'guided'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev      public.biodata_revisions;
  v_merged   jsonb;
  v_cc       public.candidate_community;
  v_changed  boolean;
begin
  perform app.require_operator(p_candidate_id);

  if not exists (
    select 1 from public.candidates c
     where c.id = p_candidate_id
       and (c.identity_status = 'verified'
            or exists (select 1 from public.registration_applications ra
                        where ra.candidate_id = c.id
                          and ra.status in ('draft', 'correction_requested')))
  ) then
    raise exception 'forbidden: the biodata cannot change while an admin is checking the registration'
      using errcode = '42501';
  end if;

  v_rev := app.open_revision(p_candidate_id, coalesce(p_source, 'guided'));

  -- Partial save: the client sends the fields it touched, not the whole form.
  v_merged := v_rev.data || coalesce(p_data, '{}'::jsonb);

  update public.biodata_revisions
     set data = v_merged,
         -- Anything the operator has now typed over is confirmed by that act.
         unconfirmed_fields = (
           select coalesce(array_agg(f), '{}')
           from unnest(v_rev.unconfirmed_fields) f
           where not (coalesce(p_data, '{}'::jsonb) ? f)
         )
   where id = v_rev.id
   returning * into v_rev;

  -- Mirror the four community attributes into their structured home, because
  -- that is what eligibility reads. Changing one un-confirms the set: spec §7
  -- will not let an unconfirmed value clear anybody.
  select * into v_cc from public.candidate_community where candidate_id = p_candidate_id;

  v_changed :=
       v_cc.sub_community    is distinct from nullif(v_merged ->> 'community', '')
    or v_cc.sect             is distinct from nullif(v_merged ->> 'sect', '')
    or v_cc.paternal_surname is distinct from nullif(v_merged ->> 'surname', '')
    or v_cc.mosal_family     is distinct from nullif(v_merged ->> 'mosal', '');

  if v_changed then
    update public.candidate_community
       set sub_community    = nullif(v_merged ->> 'community', ''),
           sect             = nullif(v_merged ->> 'sect', ''),
           paternal_surname = nullif(v_merged ->> 'surname', ''),
           mosal_family     = nullif(v_merged ->> 'mosal', ''),
           confirmed_at     = null,
           confirmed_by_account_id = null,
           source           = case when p_source in ('pasted', 'imported')
                                   then 'import' else 'biodata' end
     where candidate_id = p_candidate_id;

    perform app.apply_publication_state(p_candidate_id);
  end if;

  return jsonb_build_object(
    'revision_id', v_rev.id,
    'version', v_rev.version,
    'status', v_rev.status,
    'completion', v_rev.completion,
    'unconfirmed_fields', to_jsonb(v_rev.unconfirmed_fields)
  );
end
$$;

-- ------------------------------------------ one way to send, not two -------
-- Same as 20260914001400, except that a family not yet verified sends the
-- biodata by sending the registration; sending it on its own would start the
-- second review this migration removes.
create or replace function public.submit_biodata(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev      public.biodata_revisions;
  v_cc       public.candidate_community;
  v_problems text;
begin
  select * into v_rev from public.biodata_revisions where id = p_revision_id for update;
  if v_rev.id is null then
    raise exception 'not_found: no such revision' using errcode = 'P0002';
  end if;
  perform app.require_operator(v_rev.candidate_id);

  if not exists (select 1 from public.candidates
                  where id = v_rev.candidate_id and identity_status = 'verified') then
    raise exception 'conflict: send the biodata with the registration' using errcode = 'P0001';
  end if;

  if v_rev.status not in ('draft', 'correction_requested') then
    raise exception 'conflict: this revision is not open for submission (%)', v_rev.status
      using errcode = 'P0001';
  end if;

  select string_agg(field_key, ',' order by field_key) into v_problems
  from app.validate_biodata(v_rev.data, true);

  if v_problems is not null then
    raise exception 'incomplete: %', v_problems using errcode = 'P0001';
  end if;

  if cardinality(v_rev.unconfirmed_fields) > 0 then
    raise exception 'unconfirmed: %', array_to_string(v_rev.unconfirmed_fields, ',')
      using errcode = 'P0001';
  end if;

  select * into v_cc from public.candidate_community where candidate_id = v_rev.candidate_id;

  if v_cc.confirmed_at is null then
    if v_rev.source = 'guided' then
      update public.candidate_community
         set confirmed_at = now(), confirmed_by_account_id = app.current_account_id()
       where candidate_id = v_rev.candidate_id;
    else
      raise exception 'unconfirmed: community_details' using errcode = 'P0001';
    end if;
  end if;

  update public.biodata_revisions
     set status = 'submitted', submitted_at = now(),
         decided_at = null, decided_by_account_id = null,
         decision_reason = null, correction_fields = '{}'
   where id = p_revision_id;

  update public.candidates set publication_status = 'in_review'
   where id = v_rev.candidate_id;

  perform app.record_decision(
    'biodata_revision', p_revision_id, v_rev.candidate_id, 'reopen',
    v_rev.status::text, 'submitted', '{}', null, 'submitted by operator', p_revision_id
  );

  return jsonb_build_object('status', 'submitted', 'revision_id', p_revision_id);
end
$$;

-- ---------------------------------------- decided with its registration -----
-- Same as 20260914001600, except that a biodata sent with a registration is
-- refused here: the registration's decision covers it.
create or replace function public.admin_decide_biodata(
  p_revision_id     uuid,
  p_action          public.review_action,
  p_expected_status public.revision_status,
  p_reason          text default null,
  p_issues          jsonb default '[]'::jsonb,
  p_internal_note   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev    public.biodata_revisions;
  v_next   public.revision_status;
  v_issue  jsonb;
  v_fields text[] := '{}';
  v_pub    public.publication_status;
begin
  perform app.require_staff();
  if p_action in ('approve', 'reject') then
    perform app.require_admin();
  end if;

  select * into v_rev from public.biodata_revisions where id = p_revision_id for update;
  if v_rev.id is null then
    raise exception 'not_found: no such revision' using errcode = 'P0002';
  end if;

  if v_rev.status <> p_expected_status then
    raise exception 'conflict: this revision is now %, not %', v_rev.status, p_expected_status
      using errcode = 'P0001';
  end if;
  if v_rev.status not in ('submitted', 'under_review') then
    raise exception 'conflict: only a submitted revision can be decided (%)', v_rev.status
      using errcode = 'P0001';
  end if;

  -- Before verification the biodata travels with the registration and is
  -- decided there; deciding it alone would leave the family with a biodata
  -- to fix that it cannot open while the registration waits.
  if not exists (select 1 from public.candidates
                  where id = v_rev.candidate_id and identity_status = 'verified') then
    raise exception 'conflict: this biodata is decided with its registration'
      using errcode = 'P0001';
  end if;

  if p_action = 'approve' then
    -- Spec §5: publication needs identity approval *and* a second review. This
    -- is the second review; it must not stand in for the first.
    if not exists (select 1 from public.candidates
                   where id = v_rev.candidate_id and identity_status = 'verified') then
      raise exception 'conflict: identity is not verified, so biodata cannot be published'
        using errcode = 'P0001';
    end if;

    v_next := 'approved';

    -- The previously published revision stays readable as history.
    update public.biodata_revisions
       set status = 'superseded', superseded_at = now()
     where candidate_id = v_rev.candidate_id and status = 'approved' and id <> p_revision_id;

    update public.biodata_revisions
       set status = v_next, approved_at = now(), decided_at = now(),
           decided_by_account_id = app.current_account_id(),
           decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
           correction_fields = '{}'
     where id = p_revision_id;

    update public.candidates
       set published_revision_id = p_revision_id,
           -- apply_publication_state decides between published and unpublished
           -- from here; it will hold at unpublished until consent is active.
           publication_status = 'unpublished'
     where id = v_rev.candidate_id;

    -- Contact details move out of the biodata blob and into their own table
    -- at the moment a reviewer approves them.
    perform app.sync_contacts_from_revision(p_revision_id);

    v_pub := app.apply_publication_state(v_rev.candidate_id);

  elsif p_action = 'request_correction' then
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception 'invalid: an applicant-facing explanation is required' using errcode = 'P0001';
    end if;

    delete from public.revision_field_issues where revision_id = p_revision_id;

    for v_issue in select * from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb))
    loop
      insert into public.revision_field_issues
        (revision_id, field_key, message_gu, message_en, created_by_account_id)
      values (p_revision_id, v_issue ->> 'field', v_issue ->> 'gu', v_issue ->> 'en',
              app.current_account_id());
      v_fields := v_fields || (v_issue ->> 'field');
    end loop;

    if cardinality(v_fields) = 0 then
      raise exception 'invalid: name at least one field that needs correcting'
        using errcode = 'P0001';
    end if;

    v_next := 'correction_requested';
    update public.biodata_revisions
       set status = v_next, decided_at = now(),
           decided_by_account_id = app.current_account_id(),
           decision_reason = btrim(p_reason), correction_fields = v_fields
     where id = p_revision_id;

    update public.candidates set publication_status = 'correction_requested'
     where id = v_rev.candidate_id;

  elsif p_action = 'reject' then
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception 'invalid: a rejection reason is required' using errcode = 'P0001';
    end if;

    v_next := 'rejected';
    update public.biodata_revisions
       set status = v_next, decided_at = now(),
           decided_by_account_id = app.current_account_id(),
           decision_reason = btrim(p_reason)
     where id = p_revision_id;

    update public.candidates set publication_status = 'rejected'
     where id = v_rev.candidate_id;

  else
    raise exception 'invalid: % is not a decision', p_action using errcode = 'P0001';
  end if;

  perform app.record_decision(
    'biodata_revision', p_revision_id, v_rev.candidate_id, p_action,
    v_rev.status::text, v_next::text, v_fields, p_reason, p_internal_note, p_revision_id
  );

  delete from public.review_claims
   where subject_type = 'biodata_revision' and subject_id = p_revision_id;

  perform app.notify_operators(
    v_rev.candidate_id, 'biodata_decided',
    jsonb_build_object('revision_id', p_revision_id, 'outcome', v_next)
  );

  return jsonb_build_object('status', v_next, 'publication_status', v_pub);
end
$$;
