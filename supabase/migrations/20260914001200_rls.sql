-- ---------------------------------------------------------------------------
-- Row level security and grants.
--
-- The rule this schema follows, stated once so every policy below can be read
-- against it:
--
--   * RLS answers "may this account touch its own records, and may staff touch
--     the queues?" Nothing more.
--   * Every cross-member read — the directory, someone else's profile, their
--     photographs, their contact details — goes through a SECURITY DEFINER RPC
--     that applies consent, community rules and grants before returning a row.
--
-- Splitting it that way means a policy never has to encode an expensive
-- per-pair rule, and a member poking at PostgREST directly gets their own data
-- and nothing else. Spec §2: "Enforce permissions on the server for every
-- record and media request, not merely through navigation."
--
-- `anon` is granted nothing anywhere in this file. A signed-out visitor can
-- read no application table at all.
-- ---------------------------------------------------------------------------

-- Supabase grants ALL on new public tables to anon and authenticated by
-- default. Start from zero and hand privileges back deliberately.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;

-- Policy expressions call these, so the executing role needs EXECUTE. The `app`
-- schema is absent from config.toml's db.schemas, so PostgREST will not expose
-- them as callable endpoints.
grant usage on schema app to anon, authenticated, service_role;
revoke all on all functions in schema app from public;
grant execute on all functions in schema app to anon, authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings', 'accounts', 'account_roles', 'candidates',
    'candidate_memberships', 'candidate_community', 'candidate_privacy',
    'candidate_contacts', 'registration_applications', 'application_documents',
    'duplicate_candidates', 'access_requests', 'review_decisions', 'review_claims',
    'biodata_fields', 'biodata_revisions', 'revision_field_issues',
    'candidate_consents', 'community_rules', 'family_preferences',
    'candidate_blocks', 'interests', 'contact_grants', 'candidate_media',
    'media_access_requests', 'media_grants', 'saved_profiles', 'share_links',
    'share_link_uses', 'notifications', 'notification_outbox', 'audit_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end
$$;

-- ============================================================== settings ===
-- Review targets and consent wording are shown to members; they are not secret.
grant select on public.app_settings to authenticated;
create policy app_settings_read on public.app_settings
  for select to authenticated using (true);

-- ============================================================== accounts ===
grant select on public.accounts to authenticated;
-- Only these two columns. Status, suspension and phone are deliberately absent:
-- an account must not be able to unsuspend itself or move its own identifier.
grant update (display_name, preferred_language) on public.accounts to authenticated;

create policy accounts_read_own on public.accounts
  for select to authenticated
  using (id = (select auth.uid()) or (select app.is_staff()));

create policy accounts_update_own on public.accounts
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No INSERT policy: rows come from the auth.users trigger.
-- No DELETE policy: deletion is a support operation with retention consequences.

-- ========================================================= elevated roles ===
grant select on public.account_roles to authenticated;

create policy account_roles_read on public.account_roles
  for select to authenticated
  using (account_id = (select auth.uid()) or (select app.is_staff()));

-- Deliberately no write policy for any authenticated role. Spec §2: a member
-- cannot grant themselves admin. Granting happens through
-- public.grant_role(), which is superadmin-only, or the service role.

-- ============================================================ candidates ===
grant select on public.candidates to authenticated;
-- Member-controlled switches only. Name, birth date and parentage are
-- identity-verified (spec §5) and change only via request_identity_change().
grant update (paused, match_found_at, deletion_requested_at) on public.candidates to authenticated;

create policy candidates_read_own on public.candidates
  for select to authenticated
  using ((select app.operates_candidate(id)) or (select app.is_staff()));

create policy candidates_update_own on public.candidates
  for update to authenticated
  using ((select app.operates_candidate(id)) and deleted_at is null)
  with check ((select app.operates_candidate(id)) and deleted_at is null);

-- =========================================================== memberships ===
grant select on public.candidate_memberships to authenticated;

-- A parent sees the other accounts linked to their child, because spec §6's
-- Family screen lists them. Nobody sees a link they are not part of.
create policy candidate_memberships_read on public.candidate_memberships
  for select to authenticated
  using (
    account_id = (select auth.uid())
    or (select app.operates_candidate(candidate_id))
    or (select app.is_staff())
  );

-- Linking is an admin decision (spec §4), so there is no member write policy.

-- ===================================================== community details ===
grant select on public.candidate_community to authenticated;

create policy candidate_community_read on public.candidate_community
  for select to authenticated
  using ((select app.operates_candidate(candidate_id)) or (select app.is_staff()));

-- Writes go through save_biodata_draft()/confirm_community_details() so that
-- `confirmed_at` cannot be set by the same request that supplies the value.

-- ============================================================== privacy ====
grant select, update on public.candidate_privacy to authenticated;

create policy candidate_privacy_read on public.candidate_privacy
  for select to authenticated
  using ((select app.operates_candidate(candidate_id)) or (select app.is_staff()));

-- Spec §5: "Privacy restrictions, pause, and consent withdrawal take effect
-- immediately" — so this is a direct write, not a reviewed one.
create policy candidate_privacy_update on public.candidate_privacy
  for update to authenticated
  using ((select app.operates_candidate(candidate_id)))
  with check ((select app.operates_candidate(candidate_id)));

-- ============================================================== contacts ===
grant select, insert, update, delete on public.candidate_contacts to authenticated;

-- Spec §8: acceptance grants the authorised parties access to the configured
-- contact details. This is the only read path that is not "mine or staff".
create policy candidate_contacts_read on public.candidate_contacts
  for select to authenticated
  using (
    (select app.operates_candidate(candidate_id))
    or (select app.shares_contact_with(candidate_id))
    or (select app.is_staff())
  );

create policy candidate_contacts_write on public.candidate_contacts
  for all to authenticated
  using ((select app.operates_candidate(candidate_id)))
  with check ((select app.operates_candidate(candidate_id)));

-- ========================================================== registration ===
grant select on public.registration_applications to authenticated;

create policy registration_applications_read on public.registration_applications
  for select to authenticated
  using (
    account_id = (select auth.uid())
    or (select app.operates_candidate(candidate_id))
    or (select app.is_staff())
  );

-- Submission and every decision are RPCs; there is no direct member write.

-- ------------------------------------------------------------- documents ---
-- Spec §8: "Birth certificates are never member-visible." Not even to the
-- person who uploaded one — INSERT without SELECT is exactly the privilege an
-- uploader needs. The client learns the upload worked from the RPC's return
-- value, not by reading the row back.
grant insert on public.application_documents to authenticated;
grant select on public.application_documents to authenticated;

create policy application_documents_read_staff on public.application_documents
  for select to authenticated
  using ((select app.is_staff()));

create policy application_documents_insert on public.application_documents
  for insert to authenticated
  with check (
    (select app.operates_candidate(candidate_id))
    and uploaded_by_account_id = (select auth.uid())
  );

-- ------------------------------------------------------------ duplicates ---
grant select on public.duplicate_candidates to authenticated;

create policy duplicate_candidates_staff on public.duplicate_candidates
  for select to authenticated using ((select app.is_staff()));

-- ------------------------------------------------------- access requests ---
grant select, insert on public.access_requests to authenticated;

-- Spec §4: "Reveal no biodata or existing operator contact information during
-- this process." The requester can read their own request — which carries no
-- information about the candidate beyond the fact that they asked — and has no
-- policy granting them any read on the candidate itself.
create policy access_requests_read_own on public.access_requests
  for select to authenticated
  using (account_id = (select auth.uid()) or (select app.is_staff()));

create policy access_requests_insert on public.access_requests
  for insert to authenticated
  with check (
    account_id = (select auth.uid())
    and status = 'pending'
    and (select app.account_is_active())
  );

-- ====================================================== review decisions ===
-- Column-level grant: `internal_note` and `actor_account_id` are omitted, so a
-- member's `select *` fails rather than succeeding with an internal note in it.
-- Spec §10: "Keep internal notes separate from applicant messages."
grant select (
  id, subject_type, subject_id, candidate_id, action, actor_role,
  from_status, to_status, fields, reason_applicant, revision_id, created_at
) on public.review_decisions to authenticated;

create policy review_decisions_read_own on public.review_decisions
  for select to authenticated
  using (
    (select app.is_staff())
    or (candidate_id is not null and (select app.operates_candidate(candidate_id)))
  );

grant select on public.review_claims to authenticated;
create policy review_claims_staff on public.review_claims
  for select to authenticated using ((select app.is_staff()));

-- ============================================================== biodata ====
grant select on public.biodata_fields to authenticated;
create policy biodata_fields_read on public.biodata_fields
  for select to authenticated using (true);

grant select on public.biodata_revisions to authenticated;

-- Only the candidate's own operators and staff. Everyone else reads the
-- published biodata through discover()/get_candidate_profile(), which strip
-- the contact fields out of the payload first.
create policy biodata_revisions_read on public.biodata_revisions
  for select to authenticated
  using ((select app.operates_candidate(candidate_id)) or (select app.is_staff()));

grant select on public.revision_field_issues to authenticated;

create policy revision_field_issues_read on public.revision_field_issues
  for select to authenticated
  using (
    (select app.is_staff())
    or exists (
      select 1 from public.biodata_revisions r
      where r.id = revision_id and (select app.operates_candidate(r.candidate_id))
    )
  );

-- ============================================================== consent ====
grant select on public.candidate_consents to authenticated;

create policy candidate_consents_read on public.candidate_consents
  for select to authenticated
  using ((select app.operates_candidate(candidate_id)) or (select app.is_staff()));

-- Granting and withdrawing are RPCs; the "must be the candidate themselves"
-- trigger backs them up regardless of the path taken.

-- ====================================================== community rules ====
grant select on public.community_rules to authenticated;
create policy community_rules_read on public.community_rules
  for select to authenticated using (true);

grant select, insert, update on public.family_preferences to authenticated;

create policy family_preferences_read on public.family_preferences
  for select to authenticated
  using ((select app.operates_candidate(candidate_id)) or (select app.is_staff()));

create policy family_preferences_write on public.family_preferences
  for insert to authenticated
  with check ((select app.operates_candidate(candidate_id)));

create policy family_preferences_update on public.family_preferences
  for update to authenticated
  using ((select app.operates_candidate(candidate_id)))
  with check ((select app.operates_candidate(candidate_id)));

-- ================================================= blocks and interests ====
grant select, insert, delete on public.candidate_blocks to authenticated;

create policy candidate_blocks_read on public.candidate_blocks
  for select to authenticated
  using ((select app.operates_candidate(blocker_candidate_id)) or (select app.is_staff()));

create policy candidate_blocks_insert on public.candidate_blocks
  for insert to authenticated
  with check (
    (select app.operates_candidate(blocker_candidate_id))
    and created_by_account_id = (select auth.uid())
  );

create policy candidate_blocks_delete on public.candidate_blocks
  for delete to authenticated
  using ((select app.operates_candidate(blocker_candidate_id)));

grant select on public.interests to authenticated;

create policy interests_read on public.interests
  for select to authenticated
  using (
    (select app.operates_candidate(from_candidate_id))
    or (select app.operates_candidate(to_candidate_id))
    or (select app.is_staff())
  );

grant select on public.contact_grants to authenticated;

create policy contact_grants_read on public.contact_grants
  for select to authenticated
  using (
    (select app.operates_candidate(candidate_low))
    or (select app.operates_candidate(candidate_high))
    or (select app.is_staff())
  );

-- ================================================================ media ====
grant select, insert on public.candidate_media to authenticated;
-- Not `status`: a candidate reordering their own photographs must not be able
-- to mark one approved. Review is staff-only (see approve_media()).
grant update (is_primary, sort_order, deleted_at) on public.candidate_media to authenticated;

-- Listing someone else's photographs goes through get_candidate_media(), which
-- consults app.can_view_media_of(). This policy is only about one's own.
create policy candidate_media_read_own on public.candidate_media
  for select to authenticated
  using ((select app.operates_candidate(candidate_id)) or (select app.is_staff()));

create policy candidate_media_insert on public.candidate_media
  for insert to authenticated
  with check (
    (select app.operates_candidate(candidate_id))
    and uploaded_by_account_id = (select auth.uid())
    and status = 'pending_review'
  );

create policy candidate_media_update_own on public.candidate_media
  for update to authenticated
  using ((select app.operates_candidate(candidate_id)))
  with check ((select app.operates_candidate(candidate_id)));

grant select on public.media_access_requests to authenticated;

create policy media_access_requests_read on public.media_access_requests
  for select to authenticated
  using (
    (select app.operates_candidate(owner_candidate_id))
    or (select app.operates_candidate(viewer_candidate_id))
    or (select app.is_staff())
  );

grant select on public.media_grants to authenticated;

create policy media_grants_read on public.media_grants
  for select to authenticated
  using (
    (select app.operates_candidate(owner_candidate_id))
    or (select app.operates_candidate(viewer_candidate_id))
    or (select app.is_staff())
  );

-- ============================================================ discovery ====
grant select, insert, update, delete on public.saved_profiles to authenticated;

create policy saved_profiles_own on public.saved_profiles
  for all to authenticated
  using (account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));

grant select on public.share_links to authenticated;

create policy share_links_read on public.share_links
  for select to authenticated
  using (
    created_by_account_id = (select auth.uid())
    or (select app.operates_candidate(candidate_id))
    or (select app.is_staff())
  );

grant select on public.share_link_uses to authenticated;
create policy share_link_uses_staff on public.share_link_uses
  for select to authenticated using ((select app.is_staff()));

-- ======================================================== notifications ====
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_read_own on public.notifications
  for select to authenticated using (account_id = (select auth.uid()));

create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));

-- notification_outbox: no grant, no policy. Service role only.

-- ================================================================ audit ====
grant select on public.audit_events to authenticated;

create policy audit_events_staff_read on public.audit_events
  for select to authenticated using ((select app.is_staff()));

-- No INSERT, UPDATE or DELETE policy for anyone. The audit trigger runs
-- SECURITY DEFINER as the table owner, which is how rows get in; there is no
-- path by which a client can add, alter or remove one.

-- ======================================================= directory view ====
-- Not reachable from a client. discover() and get_candidate_profile() are
-- SECURITY DEFINER and read it on the member's behalf after resolving
-- eligibility, which a view cannot express per-viewer.
revoke all on public.directory_profiles from anon, authenticated;
grant select on public.directory_profiles to service_role;

comment on view public.directory_profiles is
  'Internal projection. Revoked from anon and authenticated on purpose — a view '
  'cannot apply per-viewer community rules, so reads go through discover().';
