'use server';

import { revalidatePath } from 'next/cache';

import type { Enums } from '@/lib/supabase/database.types';
import { actionResult, type ActionResult } from '@/lib/data/errors';
import * as discovery from '@/lib/data/discovery';
import * as interests from '@/lib/data/interests';
import * as media from '@/lib/data/media';
import { track } from '@/lib/data/activity';

/* ------------------------------------------------------------ shortlist --- */

export async function setSavedAction(
  candidateId: string,
  saved: boolean,
): Promise<ActionResult> {
  return actionResult(async () => {
    await discovery.setSaved(candidateId, saved);
    track(saved ? 'discover.saved' : 'discover.unsaved', { targetCandidateId: candidateId });
    revalidatePath('/', 'layout');
    return null;
  });
}

/* ------------------------------------------------------------ interests --- */

/**
 * Fails with `ineligible: <verdict>` when a community rule blocks the pair, and
 * with the same code when the rules could not be checked at all — spec §7 will
 * not let incomplete information stand in for permission.
 */
export async function sendInterestAction(
  fromCandidateId: string,
  toCandidateId: string,
  message?: string,
): Promise<ActionResult<{ interestId: string }>> {
  return actionResult(async () => {
    const interestId = await interests.sendInterest(fromCandidateId, toCandidateId, message);
    track('interest.sent', { candidateId: fromCandidateId, targetCandidateId: toCandidateId, detail: { interest_id: interestId } });
    revalidatePath('/', 'layout');
    return { interestId };
  });
}

/** Accepting releases contact details. Explain that before calling this. */
export async function respondToInterestAction(
  interestId: string,
  accept: boolean,
): Promise<ActionResult<{ status: Enums<'interest_status'> }>> {
  return actionResult(async () => {
    const status = await interests.respondToInterest(interestId, accept);
    track(accept ? 'interest.accepted' : 'interest.declined', { detail: { interest_id: interestId } });
    revalidatePath('/', 'layout');
    return { status };
  });
}

export async function withdrawInterestAction(interestId: string): Promise<ActionResult> {
  return actionResult(async () => {
    await interests.withdrawInterest(interestId);
    track('interest.withdrawn', { detail: { interest_id: interestId } });
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function blockCandidateAction(
  blockerCandidateId: string,
  blockedCandidateId: string,
  reason?: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    await interests.blockCandidate(blockerCandidateId, blockedCandidateId, reason);
    track('candidate.blocked', { candidateId: blockerCandidateId, targetCandidateId: blockedCandidateId });
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function unblockCandidateAction(
  blockerCandidateId: string,
  blockedCandidateId: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    await interests.unblockCandidate(blockerCandidateId, blockedCandidateId);
    track('candidate.unblocked', { candidateId: blockerCandidateId, targetCandidateId: blockedCandidateId });
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function markNotificationsReadAction(ids: string[]): Promise<ActionResult> {
  return actionResult(async () => {
    await interests.markNotificationsRead(ids);
    revalidatePath('/', 'layout');
    return null;
  });
}

/* ---------------------------------------------------------------- media --- */

export async function registerMediaAction(
  input: Parameters<typeof media.registerMedia>[0],
): Promise<ActionResult<{ mediaId: string }>> {
  return actionResult(async () => {
    const mediaId = await media.registerMedia(input);
    track('media.uploaded', { candidateId: input.candidateId, detail: { kind: input.kind } });
    revalidatePath('/', 'layout');
    return { mediaId };
  });
}

export async function setPrimaryPhotoAction(
  candidateId: string,
  mediaId: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    await media.setPrimaryPhoto(candidateId, mediaId);
    track('media.primary_set', { candidateId });
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function removeMediaAction(mediaId: string): Promise<ActionResult> {
  return actionResult(async () => {
    await media.removeMedia(mediaId);
    track('media.removed', { detail: { media_id: mediaId } });
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function requestMediaAccessAction(
  viewerCandidateId: string,
  ownerCandidateId: string,
  kind: Enums<'media_kind'> = 'photo',
  message?: string,
): Promise<ActionResult<{ requestId: string }>> {
  return actionResult(async () => {
    const requestId = await media.requestMediaAccess(
      viewerCandidateId, ownerCandidateId, kind, message);
    track('media.access_requested', { candidateId: viewerCandidateId, targetCandidateId: ownerCandidateId, detail: { kind } });
    revalidatePath('/', 'layout');
    return { requestId };
  });
}

export async function decideMediaAccessAction(
  requestId: string,
  approve: boolean,
): Promise<ActionResult<{ status: Enums<'media_request_status'> }>> {
  return actionResult(async () => {
    const status = await media.decideMediaAccess(requestId, approve);
    track(approve ? 'media.access_approved' : 'media.access_declined', { detail: { request_id: requestId } });
    revalidatePath('/', 'layout');
    return { status };
  });
}

/**
 * Spec §8: this prevents future access and cannot recall an image that has
 * already been fetched. Say so in the confirmation copy.
 */
export async function revokeMediaGrantAction(grantId: string): Promise<ActionResult> {
  return actionResult(async () => {
    await media.revokeMediaGrant(grantId);
    track('media.grant_revoked', { detail: { grant_id: grantId } });
    revalidatePath('/', 'layout');
    return null;
  });
}

/* -------------------------------------------------------------- sharing --- */

/** The token comes back once. There is no way to recover it afterwards. */
export async function createShareLinkAction(
  candidateId: string,
): Promise<ActionResult<{ id: string; token: string; expiresAt: string }>> {
  return actionResult(async () => {
    const link = await discovery.createShareLink(candidateId);
    track('share.created', { candidateId });
    revalidatePath('/', 'layout');
    return link;
  });
}

export async function revokeShareLinkAction(id: string): Promise<ActionResult> {
  return actionResult(async () => {
    await discovery.revokeShareLink(id);
    track('share.revoked', { detail: { share_id: id } });
    revalidatePath('/', 'layout');
    return null;
  });
}
