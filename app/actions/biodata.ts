'use server';

import { revalidatePath } from 'next/cache';

import type { Enums } from '@/lib/supabase/database.types';
import { actionResult, type ActionResult } from '@/lib/data/errors';
import * as biodata from '@/lib/data/biodata';
import { track } from '@/lib/data/activity';

export async function saveBiodataDraftAction(
  candidateId: string,
  values: biodata.BiodataValues,
): Promise<ActionResult<biodata.SaveDraftResult>> {
  return actionResult(async () => {
    const result = await biodata.saveBiodataDraft(candidateId, values);
    // The database keeps one of these per ten minutes, not one per keystroke.
    track('biodata.draft_saved', { candidateId });
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
    track('biodata.imported', { candidateId });
    revalidatePath('/', 'layout');
    return result;
  });
}

export async function confirmBiodataFieldsAction(
  revisionId: string,
  fields: string[],
): Promise<ActionResult<{ unconfirmedFields: string[] }>> {
  return actionResult(async () => {
    const unconfirmedFields = await biodata.confirmBiodataFields(revisionId, fields);
    track('biodata.fields_confirmed', { detail: { revision_id: revisionId, fields } });
    return { unconfirmedFields };
  });
}

export async function confirmCommunityDetailsAction(
  candidateId: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    await biodata.confirmCommunityDetails(candidateId);
    track('biodata.community_confirmed', { candidateId });
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
    track('biodata.submitted', { detail: { revision_id: revisionId } });
    revalidatePath('/', 'layout');
    return null;
  });
}

/**
 * An approved family starts changing its biodata: a new version opens beside
 * the live one, which families go on seeing until an admin approves.
 */
export async function startBiodataEditAction(candidateId: string): Promise<ActionResult> {
  return actionResult(async () => {
    await biodata.saveBiodataDraft(candidateId, {});
    track('biodata.edit_started', { candidateId });
    revalidatePath('/', 'layout');
    return null;
  });
}

/** Name, date of birth, gender, father's name or city, sent with the new version. */
export async function proposeDetailChangesAction(
  candidateId: string,
  changes: biodata.DetailChanges,
): Promise<ActionResult<biodata.DetailChanges>> {
  return actionResult(async () => {
    const pending = await biodata.proposeDetailChanges(candidateId, changes);
    track('biodata.details_changed', { candidateId, detail: { fields: Object.keys(pending) } });
    revalidatePath('/', 'layout');
    return pending;
  });
}

export async function discardBiodataChangesAction(candidateId: string): Promise<ActionResult> {
  return actionResult(async () => {
    await biodata.discardBiodataChanges(candidateId);
    track('biodata.changes_discarded', { candidateId });
    revalidatePath('/', 'layout');
    return null;
  });
}

/** Spec §4: refused unless the caller is the candidate's own account. */
export async function grantConsentAction(candidateId: string): Promise<ActionResult> {
  return actionResult(async () => {
    await biodata.grantPublicationConsent(candidateId);
    track('consent.granted', { candidateId });
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function withdrawConsentAction(candidateId: string): Promise<ActionResult> {
  return actionResult(async () => {
    await biodata.withdrawPublicationConsent(candidateId);
    track('consent.withdrawn', { candidateId });
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
    track('family.switches_changed', { candidateId, detail: patch });
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
    track('privacy.changed', { candidateId, detail: patch });
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
    track('family.preferences_changed', { candidateId, detail: { fields: Object.keys(patch) } });
    revalidatePath('/', 'layout');
    return null;
  });
}
