-- ---------------------------------------------------------------------------
-- Assertions over the seeded database.
--
-- These check the properties spec §13 lists as release criteria, plus the
-- invariants that are easy to break by accident later. Written as plain SQL
-- rather than pgTAP so they run against any PostgreSQL 17 server.
--
-- Convention: every check raises on failure and prints nothing on success, so
-- a clean run is a silent run.
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

-- Runs a statement as a given account and reports whether it was refused.
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
    or check_violation or unique_violation then
    return true;
end
$$;

create or replace function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, false);
end
$$;

create or replace function pg_temp.cand(p_code text) returns uuid language sql stable as $$
  select id from public.candidates where public_code = p_code
$$;

do $$
declare
  v_super  uuid := '00000000-0000-4000-8000-000000000001';
  v_admin  uuid := '00000000-0000-4000-8000-000000000002';
  v_rajesh uuid := '00000000-0000-4000-8000-000000000010';
  v_aarav  uuid := '00000000-0000-4000-8000-000000000011';
  v_kavya  uuid := '00000000-0000-4000-8000-000000000012';
  v_riya   uuid := '00000000-0000-4000-8000-000000000013';
  v_nidhi  uuid := '00000000-0000-4000-8000-000000000014';
  v_meena  uuid := '00000000-0000-4000-8000-000000000015';

  c_aarav uuid := pg_temp.cand('SS-1024');
  c_kavya uuid := pg_temp.cand('SS-1025');
  c_riya  uuid := pg_temp.cand('SS-1026');
  c_nidhi uuid := pg_temp.cand('SS-1027');
  c_dhara uuid := pg_temp.cand('SS-1028');

  v_n   bigint;
  v_txt text;
begin
  -- ================================================= §13 access boundaries ==
  perform pg_temp.as_user(v_meena);   -- registered, awaiting review
  perform pg_temp.ok(app.access_state() = 'awaiting_review',
    'a submitted applicant is awaiting_review');
  perform pg_temp.ok(not app.has_member_access(),
    'an unapproved applicant has no member access');
  perform pg_temp.ok(
    pg_temp.denied(v_meena, format('select public.discover(%L)', c_dhara)),
    'an unapproved applicant cannot query the directory');

  perform pg_temp.as_user(v_rajesh);
  perform pg_temp.ok(app.access_state() = 'approved', 'an approved parent has member access');

  -- RLS: the directory is not reachable by reading tables directly.
  set local role authenticated;
  perform pg_temp.as_user(v_rajesh);
  select count(*) into v_n from public.candidates;
  perform pg_temp.ok(v_n = 1, format(
    'a member sees only the candidates they operate through RLS (saw %s)', v_n));

  select count(*) into v_n from public.biodata_revisions;
  perform pg_temp.ok(v_n >= 1, 'a member can read their own biodata revisions');
  perform pg_temp.ok(
    not exists (select 1 from public.biodata_revisions r where r.candidate_id <> c_aarav),
    'a member cannot read another candidate''s biodata revision');

  -- Spec §8: birth certificates are never member-visible.
  select count(*) into v_n from public.application_documents;
  perform pg_temp.ok(v_n = 0, 'a member cannot read any certificate row, including their own');

  -- Spec §10: internal notes are withheld at the column level.
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, 'select internal_note from public.review_decisions limit 1'),
    'a member cannot select review_decisions.internal_note');

  -- Spec §2: a member cannot grant themselves a role.
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format(
      'insert into public.account_roles (account_id, role) values (%L, ''admin'')', v_rajesh)),
    'a member cannot insert their own admin role');
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format('select public.grant_role(%L, ''admin'')', v_rajesh)),
    'a member cannot call grant_role');

  -- A member cannot move their own verification state.
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format(
      'update public.candidates set identity_status = ''verified'' where id = %L', c_dhara)),
    'a member cannot set identity_status directly');

  reset role;

  -- ============================================== §7 community rules =======
  perform pg_temp.as_user(v_rajesh);
  perform pg_temp.ok(
    app.eligibility(c_aarav, c_nidhi) = 'excluded_shared_mosal',
    'a shared mosal is a hard exclusion');
  perform pg_temp.ok(
    app.eligibility(c_aarav, c_kavya) = 'eligible',
    'a different mosal is eligible');
  perform pg_temp.ok(
    app.eligibility(c_kavya, c_riya) = 'excluded_gender',
    'the directory does not introduce candidates of the same gender');
  perform pg_temp.ok(
    app.eligibility(c_aarav, c_aarav) = 'excluded_self',
    'a candidate is not eligible for themselves');

  -- Unknown information is not evidence of eligibility.
  update public.candidate_community set confirmed_at = null where candidate_id = c_kavya;
  perform pg_temp.ok(
    app.eligibility(c_aarav, c_kavya) = 'insufficient_information',
    'an unconfirmed mosal yields insufficient_information, never eligible');
  update public.candidate_community
     set confirmed_at = now() where candidate_id = c_kavya;

  -- ...and an incomplete pair cannot be acted on.
  update public.candidate_community set mosal_family = null where candidate_id = c_riya;
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format('select public.send_interest(%L, %L)', c_aarav, c_riya)),
    'an interest cannot be sent on insufficient information');
  update public.candidate_community
     set mosal_family = 'Desai', confirmed_at = now() where candidate_id = c_riya;

  -- An excluded pair cannot be reached even with the id in hand.
  perform pg_temp.as_user(v_rajesh);
  perform pg_temp.ok(
    (public.get_candidate_profile(c_aarav, c_nidhi) ->> 'full_name') is null,
    'an excluded profile returns a reason and no detail');
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format('select public.send_interest(%L, %L)', c_aarav, c_nidhi)),
    'an interest cannot be sent to an excluded candidate');

  -- ================================================== §8 interests =========
  perform pg_temp.as_user(v_rajesh);
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format('select public.send_interest(%L, %L)', c_aarav, c_kavya)),
    'a duplicate interest between the same pair is refused');

  -- Only the receiving side answers.
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format(
      'select public.respond_interest((select id from public.interests where to_candidate_id = %L), true)',
      c_kavya)),
    'the sender cannot accept their own interest');

  -- Contact details follow the accepted interest, and only that one.
  perform pg_temp.as_user(v_rajesh);
  perform pg_temp.ok(
    jsonb_array_length(public.get_candidate_profile(c_aarav, c_kavya) -> 'contacts') > 0,
    'contact details are released by an accepted interest');
  perform pg_temp.ok(
    jsonb_array_length(public.get_candidate_profile(c_aarav, c_riya) -> 'contacts') = 0,
    'contact details are withheld without an accepted interest');

  -- Withholding at the privacy layer overrides the grant.
  update public.candidate_privacy set reveal_contact_on_accept = false where candidate_id = c_kavya;
  perform pg_temp.ok(
    jsonb_array_length(public.get_candidate_profile(c_aarav, c_kavya) -> 'contacts') = 0,
    'a candidate who withholds contact details is respected despite the grant');
  update public.candidate_privacy set reveal_contact_on_accept = true where candidate_id = c_kavya;

  -- ================================================= §8 photo permissions ==
  perform pg_temp.as_user(v_rajesh);
  perform pg_temp.ok(
    not app.can_view_media_of(c_riya, 'photo'),
    'a pending photo request does not grant access');

  perform pg_temp.as_user(v_riya);
  perform public.decide_media_access(
    (select id from public.media_access_requests
      where owner_candidate_id = c_riya and viewer_candidate_id = c_aarav), true);

  perform pg_temp.as_user(v_rajesh);
  perform pg_temp.ok(
    app.can_view_media_of(c_riya, 'photo'),
    'an approved photo request grants access');
  perform pg_temp.ok(
    not app.can_view_media_of(c_riya, 'kundali'),
    'a photo grant does not imply a janmakshar grant');

  perform pg_temp.as_user(v_riya);
  perform public.revoke_media_grant(
    (select id from public.media_grants
      where owner_candidate_id = c_riya and viewer_candidate_id = c_aarav));
  perform pg_temp.as_user(v_rajesh);
  perform pg_temp.ok(
    not app.can_view_media_of(c_riya, 'photo'),
    'revoking a photo grant removes future access');

  -- ============================================== §4/§5 consent ============
  -- A guardian cannot consent on the candidate's behalf.
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format('select public.grant_publication_consent(%L)', c_aarav)),
    'a parent cannot supply the candidate''s publication consent');

  -- ...not even by writing the row directly.
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format(
      'insert into public.candidate_consents (candidate_id, granted_by_account_id, consent_text_version)
       values (%L, %L, ''x'')', c_aarav, v_rajesh)),
    'the consent trigger refuses a non-candidate grantor');

  -- Withdrawal hides the profile immediately.
  perform pg_temp.as_user(v_kavya);
  perform public.withdraw_publication_consent(c_kavya);
  perform pg_temp.ok(
    not (select discoverable from public.candidates where id = c_kavya),
    'withdrawing consent makes a candidate undiscoverable at once');

  perform public.grant_publication_consent(c_kavya);
  perform pg_temp.ok(
    (select discoverable from public.candidates where id = c_kavya),
    'restoring consent republishes the candidate');

  -- Pause takes effect immediately too.
  update public.candidates set paused = true where id = c_kavya;
  perform pg_temp.ok(
    not (select discoverable from public.candidates where id = c_kavya),
    'pausing hides a candidate from the directory');
  update public.candidates set paused = false where id = c_kavya;

  -- ============================================= §5 identity re-verification
  perform pg_temp.as_user(v_rajesh);
  perform public.request_identity_change(c_aarav, array['full_name'], 'Spelling correction.');
  perform pg_temp.ok(
    (select identity_status from public.candidates where id = c_aarav) = 'correction_requested',
    'an identity change returns the candidate to correction_requested');
  perform pg_temp.ok(
    not (select discoverable from public.candidates where id = c_aarav),
    'an identity change hides the profile until it is resolved');

  -- ...and re-approval restores it without a second consent.
  perform public.submit_registration(
    (select id from public.registration_applications where candidate_id = c_aarav));
  perform pg_temp.as_user(v_admin);
  perform public.admin_decide_registration(
    (select id from public.registration_applications where candidate_id = c_aarav),
    'approve', 'submitted', 'Verified again.');
  perform pg_temp.ok(
    (select discoverable from public.candidates where id = c_aarav),
    're-approval restores discoverability');

  -- ================================================ §10 admin behaviour ====
  perform pg_temp.as_user(v_admin);
  perform pg_temp.ok(
    (public.admin_dashboard() -> 'verification' ->> 'open')::int >= 1,
    'the dashboard reports the open verification queue');

  -- Concurrent decisions: the second reviewer is told, not ignored.
  perform pg_temp.ok(
    pg_temp.denied(v_admin, format(
      'select public.admin_decide_registration(%L, ''approve'', ''under_review'', ''ok'')',
      (select id from public.registration_applications where candidate_id = c_dhara))),
    'a decision against a stale expected status is refused');

  -- Spec §4: duplicates block approval until a human resolves them.
  perform pg_temp.as_user(v_meena);
  select count(*) into v_n from public.registration_applications where candidate_id = c_dhara;
  perform pg_temp.ok(v_n = 1, 'the pending application exists');

  perform pg_temp.as_user(v_admin);
  insert into public.duplicate_candidates
    (application_id, candidate_id, matched_candidate_id, match_reasons, similarity)
  values (
    (select id from public.registration_applications where candidate_id = c_dhara),
    c_dhara, c_kavya, array['same_date_of_birth'], 0.9);

  perform pg_temp.ok(
    pg_temp.denied(v_admin, format(
      'select public.admin_decide_registration(%L, ''approve'', ''submitted'', ''ok'')',
      (select id from public.registration_applications where candidate_id = c_dhara))),
    'an approval is blocked while a possible duplicate is unresolved');

  perform pg_temp.as_user(v_admin);
  perform public.admin_resolve_duplicate(
    (select id from public.duplicate_candidates where candidate_id = c_dhara),
    'not_duplicate', 'Different families.');
  perform public.admin_decide_registration(
    (select id from public.registration_applications where candidate_id = c_dhara),
    'approve', 'submitted', 'Certificate matches.');
  perform pg_temp.ok(
    (select identity_status from public.candidates where id = c_dhara) = 'verified',
    'approval proceeds once the duplicate is resolved');

  -- A moderator may ask for corrections but not approve.
  perform pg_temp.as_user(v_super);
  perform public.grant_role(v_riya, 'moderator');
  perform pg_temp.ok(
    pg_temp.denied(v_riya, format(
      'select public.admin_decide_registration(%L, ''approve'', ''submitted'', ''ok'')',
      (select id from public.registration_applications where candidate_id = pg_temp.cand('SS-1029')))),
    'a moderator cannot approve a registration');
  perform pg_temp.as_user(v_super);
  perform public.revoke_role(v_riya, 'moderator');

  -- A superadmin cannot change their own roles.
  perform pg_temp.ok(
    pg_temp.denied(v_super, format('select public.grant_role(%L, ''admin'')', v_super)),
    'a superadmin cannot grant themselves a role');

  -- ============================================== §12 notification hygiene =
  perform pg_temp.ok(
    pg_temp.denied(v_admin, format(
      'insert into public.notifications (account_id, kind, payload)
       values (%L, ''interest_received'', ''{"full_name":"x"}''::jsonb)', v_rajesh)),
    'a notification carrying a name is rejected');

  -- ================================================== biodata validation ===
  perform pg_temp.ok(
    (select count(*) from app.validate_biodata('{"gender":"martian"}'::jsonb)) = 1,
    'an enum value outside the catalogue is rejected');
  perform pg_temp.ok(
    (select count(*) from app.validate_biodata('{"nonsense":"1"}'::jsonb)) = 1,
    'an unknown biodata key is rejected');
  perform pg_temp.ok(app.biodata_completion('{}'::jsonb) = 0, 'an empty biodata is 0% complete');

  perform pg_temp.as_user(v_rajesh);
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, format(
      'select public.save_biodata_draft(%L, ''{"height":"999"}''::jsonb)', c_aarav)),
    'an out-of-range value is refused at the database, not only in the form');

  -- ===================================================== §9 share links ====
  perform pg_temp.as_user(v_kavya);
  v_txt := public.create_share_link(c_kavya) ->> 'token';
  perform pg_temp.ok(
    not exists (select 1 from public.share_links where token_hash = v_txt),
    'the share token itself is never stored');
  perform pg_temp.ok(
    exists (select 1 from public.share_links where token_hash = app.hash_share_token(v_txt)),
    'the share link is found by the hash of its token');

  -- An unapproved recipient is refused and the attempt is recorded.
  perform pg_temp.ok(
    pg_temp.denied(v_meena, format('select public.resolve_share_link(%L, %L)', v_txt, c_dhara)),
    'a share link does not bypass approval');

  perform pg_temp.as_user(v_rajesh);
  perform pg_temp.ok(
    (public.resolve_share_link(v_txt, c_aarav) ->> 'public_code') = 'SS-1025',
    'an approved, eligible member can open a share link');

  -- ========================================================= audit trail ===
  perform pg_temp.as_user(v_admin);
  select count(*) into v_n from public.audit_events where candidate_id = c_aarav;
  perform pg_temp.ok(v_n > 0, 'candidate changes are audited');

  set local role authenticated;
  perform pg_temp.as_user(v_admin);
  perform pg_temp.ok(
    pg_temp.denied(v_admin, 'delete from public.audit_events'),
    'not even an admin can delete an audit event');
  reset role;

  -- ============================================ deletion and the audit log ==
  -- Regression guard. An AFTER DELETE audit trigger that holds a foreign key
  -- to the row it is describing makes that row undeletable — the delete fails
  -- and the only trace is the error. This was found against a live project,
  -- not here, because nothing in this suite used to delete a candidate.
  perform pg_temp.as_user(v_admin);
  declare
    v_doomed uuid;
    v_before bigint;
  begin
    insert into public.candidates (full_name, date_of_birth, gender, identity_status)
    values ('કાઢી નાખવાનો ઉમેદવાર', date '1995-01-01', 'female', 'unverified')
    returning id into v_doomed;

    select count(*) into v_before from public.audit_events where candidate_id = v_doomed;
    perform pg_temp.ok(v_before > 0, 'creating a candidate is audited');

    delete from public.candidates where id = v_doomed;
    perform pg_temp.ok(
      not exists (select 1 from public.candidates where id = v_doomed),
      'a candidate can actually be deleted');

    perform pg_temp.ok(
      exists (select 1 from public.audit_events where candidate_id = v_doomed
                and action = 'delete'),
      'the audit trail survives the candidate it describes');
  end;

  -- =============================================== §13 signed-out access ===
  -- "Signed-out and unapproved users cannot retrieve directory records or
  -- protected media through direct requests."
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  perform pg_temp.ok(
    pg_temp.denied(null, 'select count(*) from public.candidates'),
    'anon has no privilege on candidates at all');
  perform pg_temp.ok(
    pg_temp.denied(null, 'select count(*) from public.directory_profiles'),
    'anon cannot read the directory view');
  perform pg_temp.ok(
    pg_temp.denied(null, 'select count(*) from public.candidate_contacts'),
    'anon cannot read contact details');
  perform pg_temp.ok(
    pg_temp.denied(null, 'select public.discover(gen_random_uuid())'),
    'anon cannot call discover()');
  reset role;

  -- The directory view is closed to members too: it cannot express a per-viewer
  -- community rule, so reads go through discover() (see the RLS migration).
  set local role authenticated;
  perform pg_temp.as_user(v_rajesh);
  perform pg_temp.ok(
    pg_temp.denied(v_rajesh, 'select count(*) from public.directory_profiles'),
    'an approved member cannot read directory_profiles directly');
  reset role;

  perform set_config('request.jwt.claims', null, false);
  raise notice 'all assertions passed';
end
$$;
