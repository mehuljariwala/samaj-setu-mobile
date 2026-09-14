'use server';

import { revalidatePath } from 'next/cache';

import type { Enums } from '@/lib/supabase/database.types';
import { actionResult, type ActionResult } from '@/lib/data/errors';
import * as biodata from '@/lib/data/biodata';

export async function saveBiodataDraftAction(
  candidateId: string,
  values: biodata.BiodataValues,
): Promise<ActionResult<biodata.SaveDraftResult>> {
  return actionResult(async () => {
    const result = await biodata.saveBiodataDraft(candidateId, values);
    // No revalidate: this is the autosave path and fires on every pause in
    // typing. The form already holds the answer it needs.
    return result;
  });
}

export async function stageImportedBiodataAction(
  candidateId: string,
  values: biodata.BiodataValues,
): Promise<ActionResult<Awaited<ReturnType<typeof biodata.stageImportedBiodata>>>> {
  return actionResult(async () => {
    const result = await biodata.stageImportedBiodata(candidateId, values);
    revalidatePath('/', 'layout');
    return result;
  });
}

export async function confirmBiodataFieldsAction(
  revisionId: string,
  fields: string[],
): Promise<ActionResult<{ unconfirmedFields: string[] }>> {
  return actionResult(async () => ({
    unconfirmedFields: await biodata.confirmBiodataFields(revisionId, fields),
  }));
}

export async function confirmCommunityDetailsAction(
  candidateId: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    await biodata.confirmCommunityDetails(candidateId);
    revalidatePath('/', 'layout');
    return null;
  });
}

/**
 * Fails with `incomplete: <field keys>` or `unconfirmed: <field keys>` rather
 * than a generic message, so the form can scroll to the first offending field.
 */
export async function submitBiodataAction(revisionId: string): Promise<ActionResult> {
  return actionResult(async () => {
    await biodata.submitBiodata(revisionId);
    revalidatePath('/', 'layout');
    return null;
  });
}

/** Spec §4: refused unless the caller is the candidate's own account. */
export async function grantConsentAction(candidateId: string): Promise<ActionResult> {
  return actionResult(async () => {
    await biodata.grantPublicationConsent(candidateId);
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function withdrawConsentAction(candidateId: string): Promise<ActionResult> {
  return actionResult(async () => {
    await biodata.withdrawPublicationConsent(candidateId);
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function setCandidateSwitchesAction(
  candidateId: string,
  patch: { paused?: boolean; matchFound?: boolean; requestDeletion?: boolean },
): Promise<ActionResult> {
  return actionResult(async () => {
    await biodata.setCandidateSwitches(candidateId, patch);
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function setPrivacyAction(
  candidateId: string,
  patch: {
    photo_visibility?: Enums<'media_visibility'>;
    kundali_visibility?: Enums<'media_visibility'>;
    reveal_contact_on_accept?: boolean;
  },
): Promise<ActionResult> {
  return actionResult(async () => {
    await biodata.setPrivacy(candidateId, patch);
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function setFamilyPreferencesAction(
  candidateId: string,
  patch: Parameters<typeof biodata.setFamilyPreferences>[1],
): Promise<ActionResult> {
  return actionResult(async () => {
    await biodata.setFamilyPreferences(candidateId, patch);
    revalidatePath('/', 'layout');
    return null;
  });
}
