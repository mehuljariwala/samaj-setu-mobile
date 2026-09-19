import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { signedUrl } from '@/lib/supabase/admin';
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

export async function getDashboard() {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(await supabase.rpc('admin_dashboard')) as unknown as {
    verification: {
      open: number;
      overdue: number;
      approaching: number;
      awaiting_resubmission: number;
      drafts: number;
    };
    publication: { open: number; awaiting_resubmission: number; awaiting_consent: number };
    duplicates_open: number;
    access_requests_open: number;
    media_pending_review: number;
    published_candidates: number;
  };
}

export async function getRegistrationQueue(options: {
  statuses?: Enums<'application_status'>[];
  query?: string;
  overdueOnly?: boolean;
  limit?: number;
  offset?: number;
} = {}) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  return unwrap(
    await supabase.rpc('admin_registration_queue', {
      p_statuses: options.statuses,
      p_query: options.query?.trim() || undefined,
      p_overdue: options.overdueOnly ?? false,
      p_limit: options.limit ?? 25,
      p_offset: options.offset ?? 0,
    }),
  );
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

export async function getPublicationQueue(options: {
  statuses?: Enums<'revision_status'>[];
  limit?: number;
  offset?: number;
} = {}) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  return unwrap(
    await supabase.rpc('admin_publication_queue', {
      p_statuses: options.statuses,
      p_limit: options.limit ?? 25,
      p_offset: options.offset ?? 0,
    }),
  );
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
