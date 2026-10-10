import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { photoUrl, signedUrl } from '@/lib/supabase/admin';
import type { Enums, Json } from '@/lib/supabase/database.types';
import { unwrap } from './errors';
import { requireStaff } from './session';

/**
 * Admin operations.
 *
 * Every function here calls requireStaff() first, and every underlying RPC
 * checks the role again in the database. The duplication is deliberate: the
 * first check produces a usable error and keeps a member off the screen, the
 * second is the one that actually enforces anything.
 */

export type FamilyFilter = 'review' | 'overdue' | 'family' | 'live' | 'all';

/**
 * Every family in one list, each at the stage it has really reached across
 * the identity check and the biodata (see app.family_stages()).
 */
export async function getFamilyQueue(options: { filter: FamilyFilter; query?: string; limit?: number }) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('admin_family_queue', {
      p_filter: options.filter,
      p_query: options.query?.trim() || undefined,
      p_limit: options.limit ?? 50,
    }),
  );
}

export async function getFamilyCounts() {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(await supabase.rpc('admin_family_counts')) as unknown as Record<FamilyFilter | 'duplicates_open', number>;
}

/**
 * The biodata that travels with a registration, for the admin to read beside
 * the documents. The latest version: the one sent, or being fixed.
 */
export async function getLatestBiodata(candidateId: string) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const rows = unwrap(
    await supabase
      .from('biodata_revisions')
      .select('id, version, status, data, correction_fields')
      .eq('candidate_id', candidateId)
      .order('version', { ascending: false })
      .limit(1),
  );
  const row = rows[0];
  return row ? { ...row, data: row.data as Record<string, string> } : null;
}

export async function getRegistrationDetail(applicationId: string) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('admin_registration_detail', { p_application_id: applicationId }),
  ) as unknown as Record<string, Json>;
}

/**
 * Spec §10: "private certificate inspection". The RPC records who looked before
 * it hands back the storage path, and the URL it is turned into lives for two
 * minutes — long enough to read a scan, short enough not to be worth
 * forwarding.
 */
export async function getCertificateUrl(applicationId: string): Promise<string | null> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  const reference = unwrap(
    await supabase.rpc('admin_certificate_reference', { p_application_id: applicationId }),
  ) as unknown as { bucket_id: string; storage_path: string };

  return signedUrl(reference.bucket_id, reference.storage_path, 120);
}

/** The same, for either side of the photo ID. Audited as `document_viewed`. */
export async function getDocumentUrl(
  applicationId: string,
  kind: 'identity_front' | 'identity_back',
): Promise<string | null> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  const reference = unwrap(
    await supabase.rpc('admin_document_reference', { p_application_id: applicationId, p_kind: kind }),
  ) as unknown as { bucket_id: string; storage_path: string };

  return signedUrl(reference.bucket_id, reference.storage_path, 120);
}

/**
 * `expectedStatus` is what the reviewer was shown. If another admin has decided
 * in the meantime the call fails rather than overwriting them (spec §10).
 */
export async function decideRegistration(input: {
  applicationId: string;
  action: 'approve' | 'request_correction' | 'reject';
  expectedStatus: Enums<'application_status'>;
  reason?: string;
  fields?: string[];
  internalNote?: string;
}): Promise<Enums<'application_status'>> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  const result = unwrap(
    await supabase.rpc('admin_decide_registration', {
      p_application_id: input.applicationId,
      p_action: input.action,
      p_expected_status: input.expectedStatus,
      p_reason: input.reason,
      p_fields: input.fields ?? [],
      p_internal_note: input.internalNote,
    }),
  ) as { status: Enums<'application_status'> };

  return result.status;
}

/**
 * A profile's photos for the admin to see while deciding. Staff are not in
 * the members' photo visibility rule, so these are signed with the server key
 * after the database has said this is a staff member (requireStaff, then the
 * candidate_media policy, which lets staff read the rows).
 */
export async function getProfilePhotos(candidateId: string) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const rows = unwrap(
    await supabase
      .from('candidate_media')
      .select('id, bucket_id, storage_path, status, is_primary')
      .eq('candidate_id', candidateId)
      .eq('kind', 'photo')
      .is('deleted_at', null)
      .neq('status', 'rejected')
      .order('is_primary', { ascending: false })
      .order('created_at'),
  );
  return Promise.all(rows.map(async (row) => ({
    id: row.id,
    status: row.status,
    url: await photoUrl(row.storage_path),
  })));
}

/** The registration behind a biodata, so its review can link to the documents. */
export async function getApplicationIdFor(candidateId: string): Promise<string | null> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const rows = unwrap(
    await supabase.from('registration_applications').select('id').eq('candidate_id', candidateId).limit(1),
  );
  return rows[0]?.id ?? null;
}

export async function getBiodataDetail(revisionId: string) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('admin_biodata_detail', { p_revision_id: revisionId }),
  ) as unknown as Record<string, Json>;
}

export async function decideBiodata(input: {
  revisionId: string;
  action: 'approve' | 'request_correction' | 'reject';
  expectedStatus: Enums<'revision_status'>;
  reason?: string;
  /** Field-level issues, in both languages, because the applicant reads them. */
  issues?: { field: string; gu: string; en: string }[];
  internalNote?: string;
}) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  return unwrap(
    await supabase.rpc('admin_decide_biodata', {
      p_revision_id: input.revisionId,
      p_action: input.action,
      p_expected_status: input.expectedStatus,
      p_reason: input.reason,
      p_issues: input.issues ?? [],
      p_internal_note: input.internalNote,
    }),
  ) as unknown as { status: Enums<'revision_status'>; publication_status: Enums<'publication_status'> | null };
}

/**
 * Moves a profile between Boys and Girls when the wrong one was picked at
 * registration. The biodata, a parent's son/daughter and any interests that
 * would now be between two boys or two girls follow in the database.
 */
export async function setCandidateGender(candidateId: string, gender: Enums<'gender'>) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('admin_set_gender', { p_candidate_id: candidateId, p_gender: gender }),
  ) as unknown as { gender: Enums<'gender'>; withdrawn_interests: number };
}

export async function resolveDuplicate(
  id: string,
  status: 'confirmed' | 'not_duplicate',
  note?: string,
): Promise<void> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  unwrap(
    await supabase.rpc('admin_resolve_duplicate', { p_id: id, p_status: status, p_note: note }),
  );
}

export async function listAccessRequests() {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase
      .from('access_requests')
      .select('id, account_id, candidate_id, claimed_relationship, evidence_note, status, created_at')
      .eq('status', 'pending')
      .order('created_at'),
  );
}

export async function decideAccessRequest(input: {
  requestId: string;
  approve: boolean;
  reason?: string;
  role?: Enums<'membership_role'>;
}) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('admin_decide_access_request', {
      p_request_id: input.requestId,
      p_approve: input.approve,
      p_reason: input.reason,
      p_role: input.role ?? 'guardian',
    }),
  );
}

export async function getMemberDetail(candidateId: string) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('admin_member_detail', { p_candidate_id: candidateId }),
  ) as unknown as Record<string, Json>;
}

export async function decideMedia(mediaId: string, approve: boolean, note?: string) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  unwrap(
    await supabase.rpc('admin_decide_media', {
      p_media_id: mediaId,
      p_approve: approve,
      p_note: note,
    }),
  );
}

/* ---------------------------------------------------------------- claims -- */

export async function claimReview(
  subject: Enums<'review_subject'>,
  subjectId: string,
): Promise<{ claimed: boolean; held_by_other: boolean }> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('admin_claim_review', { p_subject: subject, p_subject_id: subjectId }),
  ) as unknown as { claimed: boolean; held_by_other: boolean };
}

export async function releaseReview(
  subject: Enums<'review_subject'>,
  subjectId: string,
): Promise<void> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  unwrap(
    await supabase.rpc('admin_release_review', { p_subject: subject, p_subject_id: subjectId }),
  );
}

/* ------------------------------------------------- rules, roles, settings -- */

export async function listCommunityRules() {
  const supabase = await createSupabaseServerClient();
  return unwrap(await supabase.from('community_rules').select('*').order('scope').order('code'));
}

/** Enabling a rule is the act of ratifying it, and is stamped and audited. */
export async function setCommunityRule(
  code: string,
  enabled: boolean,
  definition?: Json,
): Promise<void> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  unwrap(
    await supabase.rpc('admin_set_community_rule', {
      p_code: code,
      p_enabled: enabled,
      p_definition: definition,
    }),
  );
}

export async function getSettings() {
  const supabase = await createSupabaseServerClient();
  return unwrap(await supabase.from('app_settings').select('*').single());
}

export async function updateSettings(patch: Record<string, unknown>) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(await supabase.rpc('admin_update_settings', { p_patch: patch as Json }));
}

export async function grantRole(accountId: string, role: Enums<'app_role'>): Promise<void> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  unwrap(await supabase.rpc('grant_role', { p_account_id: accountId, p_role: role }));
}

export async function revokeRole(accountId: string, role: Enums<'app_role'>): Promise<void> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  unwrap(await supabase.rpc('revoke_role', { p_account_id: accountId, p_role: role }));
}

/* ----------------------------------------------------------------- audit -- */

export async function listAuditEvents(candidateId: string, limit = 50) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase
      .from('audit_events')
      .select('id, occurred_at, actor_account_id, actor_role, action, subject_table, subject_id, changes')
      .eq('candidate_id', candidateId)
      .order('occurred_at', { ascending: false })
      .limit(limit),
  );
}
