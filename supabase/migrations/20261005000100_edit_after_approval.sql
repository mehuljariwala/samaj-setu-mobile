-- ---------------------------------------------------------------------------
-- An approved family edits its own details, and the live profile stays live.
--
-- Once a profile was approved its family could change nothing: the biodata
-- screen was read-only, and the registration details (name, date of birth,
-- gender, father's name, city) could only be changed by asking a volunteer.
-- Now an approved family opens a new version of the biodata, changes what it
-- needs to, registration details included, and sends it. An admin approves it
-- once, and until then every other family keeps seeing the approved version:
--
--   editing and sending       the profile stays live; the open version is the
--                             family's alone
--   community fields          mirrored into candidate_community, which
--                             eligibility reads, when the version is approved,
--                             not while it is typed
--   registration details      kept on the version as detail_changes and
--                             written to the candidate when it is approved
--   sent back or rejected     the approved version stays live; the family
--                             fixes the new one or discards it
--
-- A family not yet approved still changes its details on the registration
-- itself (update_registration), as before.
-- ---------------------------------------------------------------------------

alter table public.biodata_revisions
  add column detail_changes jsonb not null default '{}'::jsonb
  check (jsonb_typeof(detail_changes) = 'object');

comment on column public.biodata_revisions.detail_changes is
  'Registration details an approved family asked to change with this version: '
  'full_name, date_of_birth, gender, father_name, city. Written to the candidate '
  'when the version is approved.';

-- ----------------------------------------------- registration details ------
-- Each call states the values the family wants now; a value put back to what
-- is on file stops being a change. The biodata's own gender follows the
-- candidate's, so the two never disagree.
create or replace function public.propose_detail_changes(
  p_candidate_id  uuid,
  p_full_name     text default null,
  p_date_of_birth date default null,
  p_gender        public.gender default null,
  p_father_name   text default null,
  p_city          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates;
  v_rev       public.biodata_revisions;
  v_wanted    jsonb;
  v_changes   jsonb;
  v_gender    public.gender;
begin
  perform app.require_operator(p_candidate_id);

  select * into v_candidate from public.candidates where id = p_candidate_id and deleted_at is null;
  if v_candidate.id is null then
    raise exception 'not_found: no such candidate' using errcode = 'P0002';
  end if;

  if v_candidate.identity_status <> 'verified' then
    raise exception 'conflict: until the registration is approved, change these on the registration'
      using errcode = 'P0001';
  end if;

  if p_full_name is not null and length(btrim(p_full_name)) not between 2 and 160 then
    raise exception 'invalid: full_name must be 2 to 160 characters' using errcode = 'P0001';
  end if;
  if p_father_name is not null and length(btrim(p_father_name)) not between 2 and 160 then
    raise exception 'invalid: father_name must be 2 to 160 characters' using errcode = 'P0001';
  end if;
  if p_city is not null and length(btrim(p_city)) not between 2 and 80 then
    raise exception 'invalid: city must be 2 to 80 characters' using errcode = 'P0001';
  end if;
  if p_date_of_birth is not null
     and (p_date_of_birth <= date '1900-01-01'
          or p_date_of_birth > (current_date - interval '18 years')::date) then
    raise exception 'invalid: date_of_birth must make the candidate at least 18' using errcode = 'P0001';
  end if;
  if p_gender = 'male' and v_candidate.is_sanatan then
    raise exception 'invalid: a Sanatan daughter is a girl; ask an admin to change this'
      using errcode = 'P0001';
  end if;

  -- Refuses while a version is with an admin.
  v_rev := app.open_revision(p_candidate_id, 'guided');

  v_wanted := v_rev.detail_changes || jsonb_strip_nulls(jsonb_build_object(
    'full_name',     nullif(btrim(p_full_name), ''),
    'date_of_birth', p_date_of_birth,
    'gender',        p_gender,
    'father_name',   nullif(btrim(p_father_name), ''),
    'city',          nullif(btrim(p_city), '')
  ));

  select coalesce(jsonb_object_agg(w.key, w.value), '{}'::jsonb) into v_changes
    from jsonb_each_text(v_wanted) w
   where w.value is distinct from case w.key
           when 'full_name'     then v_candidate.full_name
           when 'date_of_birth' then v_candidate.date_of_birth::text
           when 'gender'        then v_candidate.gender::text
           when 'father_name'   then v_candidate.father_name
           when 'city'          then v_candidate.city
         end;

  v_gender := coalesce((v_changes ->> 'gender')::public.gender, v_candidate.gender);

  update public.biodata_revisions
     set detail_changes = v_changes,
         data = data || jsonb_build_object('gender', v_gender::text)
   where id = v_rev.id
   returning * into v_rev;

  return jsonb_build_object('revision_id', v_rev.id, 'detail_changes', v_rev.detail_changes);
end
$$;

revoke execute on function public.propose_detail_changes(uuid, text, date, public.gender, text, text) from public, anon;
grant execute on function public.propose_detail_changes(uuid, text, date, public.gender, text, text) to authenticated, service_role;

-- ------------------------------------------------- changed their mind ------
-- An approved family drops the version it opened, or one an admin sent back.
-- The approved version was never touched, so there is nothing to restore.
create or replace function public.discard_biodata_changes(p_candidate_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_operator(p_candidate_id);

  if not exists (select 1 from public.candidates
                  where id = p_candidate_id and published_revision_id is not null) then
    raise exception 'conflict: only changes to an approved biodata can be discarded'
      using errcode = 'P0001';
  end if;

  delete from public.biodata_revisions
   where candidate_id = p_candidate_id and status in ('draft', 'correction_requested');
end
$$;

revoke execute on function public.discard_biodata_changes(uuid) from public, anon;
grant execute on function public.discard_biodata_changes(uuid) to authenticated, service_role;

-- --------------------------------------------- written on approval --------
create or replace function app.apply_detail_changes(p_rev public.biodata_revisions)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_rev.detail_changes = '{}'::jsonb then
    return;
  end if;

  update public.candidates c
     set full_name     = coalesce(p_rev.detail_changes ->> 'full_name', c.full_name),
         date_of_birth = coalesce((p_rev.detail_changes ->> 'date_of_birth')::date, c.date_of_birth),
         gender        = coalesce((p_rev.detail_changes ->> 'gender')::public.gender, c.gender),
         father_name   = coalesce(p_rev.detail_changes ->> 'father_name', c.father_name),
         city          = coalesce(p_rev.detail_changes ->> 'city', c.city)
   where c.id = p_rev.candidate_id;
end
$$;

-- The four community attributes, from an approved version into the table
-- eligibility reads. The family confirmed them by sending the version, as
-- submit_biodata already treats sending a typed-in form.
create or replace function app.sync_community_from_revision(p_rev public.biodata_revisions)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.candidate_community cc
     set sub_community    = nullif(p_rev.data ->> 'community', ''),
         sect             = nullif(p_rev.data ->> 'sect', ''),
         paternal_surname = nullif(p_rev.data ->> 'surname', ''),
         mosal_family     = nullif(p_rev.data ->> 'mosal', ''),
         confirmed_at     = now(),
         confirmed_by_account_id = coalesce(p_rev.created_by_account_id, cc.confirmed_by_account_id),
         source           = 'biodata'
   where cc.candidate_id = p_rev.candidate_id
     and (   cc.sub_community    is distinct from nullif(p_rev.data ->> 'community', '')
          or cc.sect             is distinct from nullif(p_rev.data ->> 'sect', '')
          or cc.paternal_surname is distinct from nullif(p_rev.data ->> 'surname', '')
          or cc.mosal_family     is distinct from nullif(p_rev.data ->> 'mosal', ''));
end
$$;

revoke execute on function app.apply_detail_changes(public.biodata_revisions) from public, anon, authenticated;
revoke execute on function app.sync_community_from_revision(public.biodata_revisions) from public, anon, authenticated;

-- ---------------------------------------------- typing, not publishing ----
-- Same as 20261004000400, except that an approved profile's community
-- attributes are not mirrored while its new version is typed: other families
-- go on being matched against the approved ones until an admin approves. And
-- a pending gender change keeps the biodata's gender with it.
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

  -- A gender change waiting with this version holds the biodata's own gender,
  -- so a late autosave of the old answer cannot pull the two apart.
  if v_rev.detail_changes ? 'gender' then
    v_merged := v_merged || jsonb_build_object('gender', v_rev.detail_changes ->> 'gender');
  end if;

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

  -- An approved profile keeps its approved community details until the new
  -- version is approved (app.sync_community_from_revision).
  if exists (select 1 from public.candidates
              where id = p_candidate_id and published_revision_id is not null) then
    return jsonb_build_object(
      'revision_id', v_rev.id,
      'version', v_rev.version,
      'status', v_rev.status,
      'completion', v_rev.completion,
      'unconfirmed_fields', to_jsonb(v_rev.unconfirmed_fields)
    );
  end if;

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

-- ------------------------------------------------ sent, and still live ----
-- Same as 20261004000400, except that sending changes to an approved profile
-- leaves it published: the revision's own status says it is with an admin.
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
   where id = v_rev.candidate_id and published_revision_id is null;

  perform app.record_decision(
    'biodata_revision', p_revision_id, v_rev.candidate_id, 'reopen',
    v_rev.status::text, 'submitted', '{}', null, 'submitted by operator', p_revision_id
  );

  return jsonb_build_object('status', 'submitted', 'revision_id', p_revision_id);
end
$$;

-- ---------------------------------------------- decided, still live -------
-- Same as 20261004000400, except:
--   approve             also writes the registration details the family
--                       changed, and the community attributes, which were
--                       held back while the version was typed
--   send back, reject   leave an approved profile published, so the version
--                       families see stays up while the new one is fixed
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

    perform app.apply_detail_changes(v_rev);
    perform app.sync_community_from_revision(v_rev);

    update public.candidates
       set published_revision_id = p_revision_id,
           -- apply_publication_state decides between published and unpublished
           -- from here.
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
     where id = v_rev.candidate_id and published_revision_id is null;

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
     where id = v_rev.candidate_id and published_revision_id is null;

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

-- ------------------------------------------ what the admin compares -------
-- Same as 20260914001600, plus the version families see now, so the review
-- screen can show what this one changes.
create or replace function public.admin_biodata_detail(p_revision_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rev public.biodata_revisions;
begin
  perform app.require_staff();

  select * into v_rev from public.biodata_revisions where id = p_revision_id;
  if v_rev.id is null then
    raise exception 'not_found: no such revision' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'revision', to_jsonb(v_rev),
    'candidate', (select to_jsonb(c) from public.candidates c where c.id = v_rev.candidate_id),
    'community', (select to_jsonb(cc) from public.candidate_community cc
                  where cc.candidate_id = v_rev.candidate_id),
    'published', (
      select jsonb_build_object('id', r.id, 'version', r.version, 'data', r.data)
      from public.biodata_revisions r
      join public.candidates c on c.published_revision_id = r.id
      where c.id = v_rev.candidate_id and r.id <> v_rev.id
    ),
    -- Spec §10: "active consent evidence".
    'consent', (
      select jsonb_build_object(
        'active', cs.withdrawn_at is null, 'granted_at', cs.granted_at,
        'text_version', cs.consent_text_version,
        'by_candidate_themselves', exists (
          select 1 from public.candidate_memberships m
          where m.candidate_id = cs.candidate_id and m.account_id = cs.granted_by_account_id
            and m.role = 'candidate'
        )
      )
      from public.candidate_consents cs
      where cs.candidate_id = v_rev.candidate_id
      order by cs.granted_at desc limit 1
    ),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'kind', m.kind, 'status', m.status,
        'bucket_id', m.bucket_id, 'storage_path', m.storage_path
      ))
      from public.candidate_media m
      where m.candidate_id = v_rev.candidate_id and m.deleted_at is null
    ), '[]'::jsonb),
    'issues', coalesce((
      select jsonb_agg(to_jsonb(i)) from public.revision_field_issues i
      where i.revision_id = p_revision_id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(to_jsonb(rd) order by rd.created_at desc)
      from public.review_decisions rd
      where rd.subject_type = 'biodata_revision' and rd.subject_id = p_revision_id
    ), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------- a rejected edit, live -----
-- Same as 20261004000300, except that a rejected change to an approved
-- profile leaves it where it was, live or hidden, rather than "rejected".
create or replace function app.family_stages()
returns table (
  candidate_id          uuid,
  public_code           text,
  full_name             text,
  full_name_norm        text,
  city                  text,
  operator_phone        text,
  relationship          public.relationship,
  stage                 text,
  application_id        uuid,
  application_status    public.application_status,
  submitted_at          timestamptz,
  review_due_at         timestamptz,
  overdue               boolean,
  resubmit_count        integer,
  has_certificate       boolean,
  open_duplicates       bigint,
  revision_id           uuid,
  revision_status       public.revision_status,
  revision_submitted_at timestamptz,
  published_revision_id uuid,
  sort_due              timestamptz,
  last_change           timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select
      c.id, c.public_code, c.full_name, c.full_name_norm, c.city, c.identity_status,
      c.discoverable, c.published_revision_id, c.created_at as candidate_created,
      a.phone, ra.operator_relationship,
      ra.id as application_id, ra.status as app_status, ra.submitted_at, ra.review_due_at,
      ra.resubmit_count, ra.updated_at as app_updated,
      r.id as revision_id, r.status as rev_status, r.submitted_at as rev_submitted,
      r.updated_at as rev_updated
    from public.candidates c
    left join public.registration_applications ra on ra.candidate_id = c.id
    left join public.accounts a on a.id = ra.account_id
    left join lateral (
      select r.id, r.status, r.submitted_at, r.updated_at
        from public.biodata_revisions r
       where r.candidate_id = c.id
       order by r.version desc
       limit 1
    ) r on true
    where c.deleted_at is null
  ),
  staged as (
    select b.*,
      case
        when b.app_status in ('submitted', 'under_review') then 'identity_review'
        when b.app_status = 'correction_requested' then 'identity_fix'
        when b.app_status = 'rejected' then 'identity_rejected'
        when b.app_status is distinct from 'approved' or b.identity_status <> 'verified' then 'not_sent'
        when b.rev_status in ('submitted', 'under_review') then 'biodata_review'
        when b.rev_status = 'correction_requested' then 'biodata_fix'
        when b.rev_status = 'rejected' and b.published_revision_id is null then 'biodata_rejected'
        when b.discoverable then 'live'
        when b.published_revision_id is not null then 'hidden'
        else 'biodata_pending'
      end as stage
    from base b
  )
  select
    s.id, s.public_code, s.full_name, s.full_name_norm, s.city, s.phone, s.operator_relationship,
    s.stage, s.application_id, s.app_status, s.submitted_at, s.review_due_at,
    s.stage = 'identity_review' and s.review_due_at < now(),
    s.resubmit_count,
    exists (select 1 from public.application_documents d
             where d.application_id = s.application_id and d.kind = 'birth_certificate'
               and d.deleted_at is null),
    (select count(*) from public.duplicate_candidates dc
      where dc.application_id = s.application_id and dc.status = 'open'),
    s.revision_id, s.rev_status, s.rev_submitted, s.published_revision_id,
    case s.stage
      when 'identity_review' then s.review_due_at
      when 'biodata_review' then s.rev_submitted + interval '24 hours'
    end,
    greatest(s.app_updated, s.rev_updated, s.candidate_created)
  from staged s
$$;

revoke execute on function app.family_stages() from public, anon, authenticated;
