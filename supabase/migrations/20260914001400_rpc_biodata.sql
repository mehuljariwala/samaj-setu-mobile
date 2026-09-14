-- ---------------------------------------------------------------------------
-- Biodata and consent RPCs (spec §5, §7).
--
-- Publication needs two independent things to be true at once: an admin has
-- approved the completed biodata, and the candidate's own consent is active.
-- Neither implies the other, and either can be withdrawn without the other.
-- Both `approve_biodata` and `grant_publication_consent` therefore end by
-- asking the same question — "are both true now?" — through
-- app.apply_publication_state(), so the two paths cannot disagree.
-- ---------------------------------------------------------------------------

create or replace function app.apply_publication_state(p_candidate_id uuid)
returns public.publication_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates;
  v_next      public.publication_status;
begin
  select * into v_candidate from public.candidates where id = p_candidate_id for update;
  if v_candidate.id is null then
    raise exception 'not_found: no such candidate' using errcode = 'P0002';
  end if;

  -- A revision under review, a correction outstanding or a rejection all own
  -- the status; publication is not in question yet.
  if v_candidate.publication_status in ('not_started', 'draft', 'in_review',
                                        'correction_requested', 'rejected') then
    return v_candidate.publication_status;
  end if;

  v_next := case
    when v_candidate.identity_status <> 'verified' then 'unpublished'
    when v_candidate.published_revision_id is null then 'unpublished'
    when not app.has_active_consent(p_candidate_id) then 'unpublished'
    else 'published'
  end;

  if v_next is distinct from v_candidate.publication_status then
    update public.candidates set publication_status = v_next where id = p_candidate_id;
  else
    -- Still touch the row so the discoverability trigger re-evaluates: pause,
    -- consent and match-found all change the answer without changing status.
    update public.candidates set updated_at = now() where id = p_candidate_id;
  end if;

  return v_next;
end
$$;

-- ------------------------------------------------------ open a revision ----
-- The single place that decides whether to reuse the in-flight revision or
-- start a new version. Reusing matters: a member editing a draft across three
-- sessions should not create three versions, but editing an *approved* profile
-- must create a new one so the approved copy stays visible (spec §5).
create or replace function app.open_revision(p_candidate_id uuid, p_source text)
returns public.biodata_revisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev     public.biodata_revisions;
  v_next    integer;
  v_current public.biodata_revisions;
begin
  select * into v_rev from public.biodata_revisions
   where candidate_id = p_candidate_id
     and status in ('draft', 'correction_requested')
   limit 1;

  if v_rev.id is not null then
    return v_rev;
  end if;

  if exists (
    select 1 from public.biodata_revisions
    where candidate_id = p_candidate_id and status in ('submitted', 'under_review')
  ) then
    raise exception 'conflict: this biodata is under review and cannot be edited'
      using errcode = 'P0001';
  end if;

  select coalesce(max(version), 0) + 1 into v_next
    from public.biodata_revisions where candidate_id = p_candidate_id;

  -- Start from the approved copy when there is one, so editing a published
  -- profile means changing a field rather than retyping twenty-five.
  select * into v_current from public.biodata_revisions r
   join public.candidates c on c.published_revision_id = r.id
  where c.id = p_candidate_id;

  insert into public.biodata_revisions
    (candidate_id, version, status, data, source, created_by_account_id)
  values
    (p_candidate_id, v_next, 'draft', coalesce(v_current.data, '{}'::jsonb),
     p_source, app.current_account_id())
  returning * into v_rev;

  update public.candidates
     set publication_status = case
           when publication_status = 'not_started' then 'draft'
           else publication_status
         end
   where id = p_candidate_id;

  return v_rev;
end
$$;

-- ---------------------------------------------------------- save a draft ---
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

  -- Spec §2: biodata completion unlocks on verification approval.
  if not exists (
    select 1 from public.candidates
    where id = p_candidate_id and identity_status = 'verified'
  ) then
    raise exception 'forbidden: this candidate is not verified yet' using errcode = '42501';
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
           -- candidate_community records *where the value came from*, which is
           -- a coarser question than which editor produced the revision.
           source           = case when p_source in ('pasted', 'imported')
                                   then 'import' else 'biodata' end
     where candidate_id = p_candidate_id;

    -- Community details feed eligibility, so a change has to be re-evaluated
    -- against publication immediately.
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

comment on function public.save_biodata_draft(uuid, jsonb, text) is
  'Autosave target. Merges the supplied keys into the open revision; the trigger '
  'on biodata_revisions rejects unknown keys and recomputes completion.';

-- -------------------------------------------------- staged pasted biodata --
-- Spec §5/§12: pasted biodata is untrusted input that lands in a draft and must
-- be reviewed field by field. Parsing happens outside the database — this entry
-- point takes the already-extracted keys and marks every one of them
-- unconfirmed, so the UI has something to flag and submission is blocked until
-- a human has been through them.
create or replace function public.stage_imported_biodata(
  p_candidate_id uuid,
  p_data         jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev  public.biodata_revisions;
  v_keys text[];
begin
  perform app.require_operator(p_candidate_id);

  select coalesce(array_agg(key), '{}') into v_keys
  from jsonb_each(coalesce(p_data, '{}'::jsonb))
  where btrim(coalesce(value #>> '{}', '')) <> '';

  perform public.save_biodata_draft(p_candidate_id, p_data, 'pasted');

  select * into v_rev from public.biodata_revisions
   where candidate_id = p_candidate_id and status in ('draft', 'correction_requested')
   limit 1;

  update public.biodata_revisions
     set unconfirmed_fields = v_keys, source = 'pasted'
   where id = v_rev.id
   returning * into v_rev;

  return jsonb_build_object(
    'revision_id', v_rev.id,
    'completion', v_rev.completion,
    'unconfirmed_fields', to_jsonb(v_rev.unconfirmed_fields),
    'needs_review', cardinality(v_rev.unconfirmed_fields) > 0
  );
end
$$;

create or replace function public.confirm_biodata_fields(
  p_revision_id uuid,
  p_fields      text[]
)
returns jsonb
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
  perform app.require_operator(v_rev.candidate_id);

  update public.biodata_revisions
     set unconfirmed_fields = (
       select coalesce(array_agg(f), '{}')
       from unnest(unconfirmed_fields) f
       where not (f = any (coalesce(p_fields, '{}')))
     )
   where id = p_revision_id
   returning * into v_rev;

  return jsonb_build_object('unconfirmed_fields', to_jsonb(v_rev.unconfirmed_fields));
end
$$;

-- ----------------------------------------------- confirm community details -
create or replace function public.confirm_community_details(p_candidate_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cc public.candidate_community;
begin
  perform app.require_operator(p_candidate_id);

  select * into v_cc from public.candidate_community where candidate_id = p_candidate_id;

  if v_cc.mosal_family is null or v_cc.paternal_surname is null
     or v_cc.sub_community is null or v_cc.sect is null then
    raise exception 'incomplete: community,sect,surname,mosal' using errcode = 'P0001';
  end if;

  update public.candidate_community
     set confirmed_at = now(), confirmed_by_account_id = app.current_account_id()
   where candidate_id = p_candidate_id;

  perform app.apply_publication_state(p_candidate_id);
end
$$;

comment on function public.confirm_community_details(uuid) is
  'Separate from saving the values on purpose: spec §7 asks for confirmation of '
  'imported values, and a confirmation supplied by the same request that '
  'supplied the value would confirm nothing.';

-- -------------------------------------------------------- submit biodata ---
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
      -- Typed in by hand, field by field, by someone acting for the candidate.
      -- That act is the confirmation spec §7 asks for.
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

-- -------------------------------------------------- contacts from biodata --
-- The form collects the contact person and number as biodata fields, but
-- contact details need a structured home of their own: they are the one thing
-- released by an accepted interest rather than by publication, and
-- directory_profiles strips them out of the biodata payload entirely.
--
-- Called when a revision is approved, so the released numbers are always the
-- ones a reviewer actually saw.
create or replace function app.sync_contacts_from_revision(p_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev   public.biodata_revisions;
  v_kind  public.contact_kind;
  v_phone text;
  v_extra text;
begin
  select * into v_rev from public.biodata_revisions where id = p_revision_id;
  if v_rev.id is null then
    return;
  end if;

  v_kind  := coalesce(nullif(v_rev.data ->> 'contactKind', ''), 'self')::public.contact_kind;
  v_phone := nullif(btrim(coalesce(v_rev.data ->> 'phone', '')), '');
  v_extra := nullif(btrim(coalesce(v_rev.data ->> 'extraPhone', '')), '');

  if v_phone is null then
    return;
  end if;

  delete from public.candidate_contacts where candidate_id = v_rev.candidate_id;

  insert into public.candidate_contacts (candidate_id, contact_kind, phone, is_primary)
  values (v_rev.candidate_id, v_kind, v_phone, true);

  if v_extra is not null and v_extra <> v_phone then
    insert into public.candidate_contacts (candidate_id, contact_kind, phone, is_primary)
    values (v_rev.candidate_id, v_kind, v_extra, false)
    on conflict do nothing;
  end if;
end
$$;

-- --------------------------------------------------------------- consent ---
-- Spec §4: only the candidate's own account. The trigger on candidate_consents
-- enforces the same rule independently, so this check is the friendly error
-- rather than the security boundary.
create or replace function public.grant_publication_consent(p_candidate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text;
  v_rev     uuid;
  v_status  public.publication_status;
begin
  if not app.is_candidate_self(p_candidate_id) then
    raise exception
      'forbidden: only the candidate''s own account may give publication consent'
      using errcode = '42501';
  end if;

  select consent_text_version into v_version from public.app_settings where id;
  select published_revision_id into v_rev from public.candidates where id = p_candidate_id;

  insert into public.candidate_consents
    (candidate_id, revision_id, granted_by_account_id, consent_text_version)
  values (p_candidate_id, v_rev, app.current_account_id(), v_version)
  on conflict do nothing;

  v_status := app.apply_publication_state(p_candidate_id);

  return jsonb_build_object('consent_active', true, 'publication_status', v_status);
end
$$;

create or replace function public.withdraw_publication_consent(p_candidate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.publication_status;
begin
  -- Withdrawal is deliberately wider than granting: a guardian who sees a
  -- reason to take a profile down should not have to find the candidate first.
  perform app.require_operator(p_candidate_id);

  update public.candidate_consents
     set withdrawn_at = now(), withdrawn_by_account_id = app.current_account_id()
   where candidate_id = p_candidate_id and withdrawn_at is null;

  -- Spec §5: consent withdrawal takes effect immediately.
  v_status := app.apply_publication_state(p_candidate_id);

  return jsonb_build_object('consent_active', false, 'publication_status', v_status);
end
$$;

comment on function public.withdraw_publication_consent(uuid) is
  'Any operator may withdraw; only the candidate may grant (spec §4). Asymmetric '
  'on purpose — the risk of a wrongly published profile outweighs the '
  'inconvenience of a wrongly withdrawn one.';
