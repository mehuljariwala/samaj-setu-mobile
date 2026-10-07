'use server';

import { revalidatePath } from 'next/cache';

import type { Enums, Json } from '@/lib/supabase/database.types';
import { actionResult, type ActionResult } from '@/lib/data/errors';
import * as admin from '@/lib/data/admin';
import { track } from '@/lib/data/activity';

/**
 * Admin actions. Each one re-checks the caller's role through the data access
 * layer, and each underlying RPC checks again in the database — a Server Action
 * is reachable by direct POST, so the page that renders the button is not a
 * guard.
 */

export async function decideRegistrationAction(
  input: Parameters<typeof admin.decideRegistration>[0],
): Promise<ActionResult<{ status: Enums<'application_status'> }>> {
  return actionResult(async () => {
    const status = await admin.decideRegistration(input);
    revalidatePath('/', 'layout');
    return { status };
  });
}

export async function decideBiodataAction(
  input: Parameters<typeof admin.decideBiodata>[0],
): Promise<ActionResult<Awaited<ReturnType<typeof admin.decideBiodata>>>> {
  return actionResult(async () => {
    const result = await admin.decideBiodata(input);
    revalidatePath('/', 'layout');
    return result;
  });
}

export async function setCandidateGenderAction(
  candidateId: string,
  gender: Enums<'gender'>,
): Promise<ActionResult<{ gender: Enums<'gender'>; withdrawn_interests: number }>> {
  return actionResult(async () => {
    const result = await admin.setCandidateGender(candidateId, gender);
    track('admin.gender_moved', { candidateId, detail: { gender } });
    revalidatePath('/', 'layout');
    return result;
  });
}

export async function resolveDuplicateAction(
  id: string,
  status: 'confirmed' | 'not_duplicate',
  note?: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    await admin.resolveDuplicate(id, status, note);
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function decideAccessRequestAction(
  input: Parameters<typeof admin.decideAccessRequest>[0],
): Promise<ActionResult<unknown>> {
  return actionResult(async () => {
    const result = await admin.decideAccessRequest(input);
    revalidatePath('/', 'layout');
    return result;
  });
}

export async function decideMediaAction(
  mediaId: string,
  approve: boolean,
  note?: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    await admin.decideMedia(mediaId, approve, note);
    revalidatePath('/', 'layout');
    return null;
  });
}

/**
 * Claiming is advisory — it stops two reviewers duplicating effort. The check
 * that actually prevents a conflicting decision is `expectedStatus`.
 */
export async function claimReviewAction(
  subject: Enums<'review_subject'>,
  subjectId: string,
): Promise<ActionResult<{ claimed: boolean; held_by_other: boolean }>> {
  return actionResult(() => admin.claimReview(subject, subjectId));
}

export async function releaseReviewAction(
  subject: Enums<'review_subject'>,
  subjectId: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    await admin.releaseReview(subject, subjectId);
    return null;
  });
}

/** Returns a signed URL valid for two minutes, and records who asked. */
export async function certificateUrlAction(
  applicationId: string,
): Promise<ActionResult<{ url: string | null }>> {
  return actionResult(async () => {
    const url = await admin.getCertificateUrl(applicationId);
    track('admin.certificate_viewed', { detail: { application_id: applicationId } });
    return { url };
  });
}

/** Either side of the photo ID; the same two-minute, recorded link. */
export async function documentUrlAction(
  applicationId: string,
  kind: 'identity_front' | 'identity_back',
): Promise<ActionResult<{ url: string | null }>> {
  return actionResult(async () => {
    const url = await admin.getDocumentUrl(applicationId, kind);
    track('admin.document_viewed', { detail: { application_id: applicationId, kind } });
    return { url };
  });
}

/** Enabling a rule ratifies it. Superadmin only, stamped and audited. */
export async function setCommunityRuleAction(
  code: string,
  enabled: boolean,
  definition?: Json,
): Promise<ActionResult> {
  return actionResult(async () => {
    await admin.setCommunityRule(code, enabled, definition);
    track('admin.rule_changed', { detail: { code, enabled } });
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function updateSettingsAction(
  patch: Record<string, unknown>,
): Promise<ActionResult<unknown>> {
  return actionResult(async () => {
    const result = await admin.updateSettings(patch);
    track('admin.settings_changed', { detail: { fields: Object.keys(patch) } });
    revalidatePath('/', 'layout');
    return result;
  });
}

export async function grantRoleAction(
  accountId: string,
  role: Enums<'app_role'>,
): Promise<ActionResult> {
  return actionResult(async () => {
    await admin.grantRole(accountId, role);
    track('admin.role_granted', { detail: { account_id: accountId, role } });
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function revokeRoleAction(
  accountId: string,
  role: Enums<'app_role'>,
): Promise<ActionResult> {
  return actionResult(async () => {
    await admin.revokeRole(accountId, role);
    track('admin.role_revoked', { detail: { account_id: accountId, role } });
    revalidatePath('/', 'layout');
    return null;
  });
}
