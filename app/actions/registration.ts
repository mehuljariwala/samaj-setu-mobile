'use server';

import { revalidatePath } from 'next/cache';

import type { Enums } from '@/lib/supabase/database.types';
import { actionResult, type ActionResult } from '@/lib/data/errors';
import { track } from '@/lib/data/activity';
import { enumField, trimmedField } from '@/lib/data/form';
import * as registration from '@/lib/data/registration';
import { resolveActingCandidate } from '@/lib/data/session';

/**
 * Thin wrappers over lib/data/registration. Authorisation is not repeated here
 * on purpose — it lives in the data access layer and, decisively, in the
 * database. A Server Action is a public POST endpoint, so anything it enforces
 * itself would be the only thing enforcing it.
 */

// A <select> is a suggestion; the POST can carry anything. These are the
// values the database enums actually accept.
const RELATIONSHIPS = [
  'self', 'son', 'daughter', 'brother', 'sister', 'ward', 'other',
] as const satisfies readonly Enums<'relationship'>[];

const GENDERS = ['male', 'female'] as const satisfies readonly Enums<'gender'>[];

export async function startRegistrationAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionResult<registration.StartRegistrationResult>> {
  return actionResult(async () => {
    const relationship = enumField(formData, 'relationship', RELATIONSHIPS, 'self');
    const result = await registration.startRegistration({
      relationship,
      fullName: trimmedField(formData, 'fullName'),
      dateOfBirth: trimmedField(formData, 'dateOfBirth'),
      gender: enumField(formData, 'gender', GENDERS, 'female'),
      fatherName: trimmedField(formData, 'fatherName'),
      motherName: trimmedField(formData, 'motherName'),
      city: trimmedField(formData, 'city'),
      nativePlace: trimmedField(formData, 'nativePlace'),
    });

    track('registration.started', {
      candidateId: result.candidateId,
      detail: { relationship, possible_duplicates: result.possibleDuplicates },
    });
    revalidatePath('/', 'layout');
    return result;
  });
}

export async function updateRegistrationAction(
  applicationId: string,
  patch: Parameters<typeof registration.updateRegistration>[1],
): Promise<ActionResult> {
  return actionResult(async () => {
    await registration.updateRegistration(applicationId, patch);
    track('registration.updated', { detail: { application_id: applicationId, fields: Object.keys(patch) } });
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function attachCertificateAction(
  input: Parameters<typeof registration.attachCertificate>[0],
): Promise<ActionResult<{ documentId: string }>> {
  return actionResult(async () => {
    const documentId = await registration.attachCertificate(input);
    track('registration.certificate_uploaded', { candidateId: input.candidateId, detail: { type: input.certificateType } });
    revalidatePath('/', 'layout');
    return { documentId };
  });
}

export async function attachIdentityDocumentAction(
  input: Parameters<typeof registration.attachIdentityDocument>[0],
): Promise<ActionResult<{ documentId: string }>> {
  return actionResult(async () => {
    const documentId = await registration.attachIdentityDocument(input);
    track('registration.identity_uploaded', { candidateId: input.candidateId, detail: { type: input.identityType, side: input.side } });
    revalidatePath('/', 'layout');
    return { documentId };
  });
}

export async function submitRegistrationAction(
  applicationId: string,
): Promise<ActionResult<registration.SubmissionReceipt>> {
  return actionResult(async () => {
    const receipt = await registration.submitRegistration(applicationId);
    track('registration.submitted', { detail: { application_id: applicationId } });
    revalidatePath('/', 'layout');
    return receipt;
  });
}

export async function reopenRegistrationAction(
  applicationId: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    await registration.reopenRegistration(applicationId);
    track('registration.reopened', { detail: { application_id: applicationId } });
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function editRegistrationAction(
  applicationId: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    await registration.editRegistration(applicationId);
    track('registration.taken_back', { detail: { application_id: applicationId } });
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function withdrawRegistrationAction(
  applicationId: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    await registration.withdrawRegistration(applicationId);
    track('registration.withdrawn', { detail: { application_id: applicationId } });
    revalidatePath('/', 'layout');
    return null;
  });
}

/** Spec §5: this puts the profile back in the queue and hides it meanwhile. */
export async function requestIdentityChangeAction(
  candidateId: string,
  fields: string[],
  reason: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    await resolveActingCandidate(candidateId);
    await registration.requestIdentityChange(candidateId, fields, reason);
    track('registration.change_requested', { candidateId, detail: { fields } });
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function requestCandidateAccessAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionResult<{ requestId: string }>> {
  return actionResult(async () => {
    const relationship = enumField(formData, 'relationship', RELATIONSHIPS, 'other');
    const requestId = await registration.requestCandidateAccess(
      trimmedField(formData, 'publicCode'),
      relationship,
      trimmedField(formData, 'note'),
    );
    track('family.access_requested', { detail: { relationship } });
    revalidatePath('/', 'layout');
    return { requestId };
  });
}

export async function updateAccountProfileAction(
  patch: Parameters<typeof registration.updateAccountProfile>[0],
): Promise<ActionResult> {
  return actionResult(async () => {
    await registration.updateAccountProfile(patch);
    track('profile.updated', { detail: { fields: Object.keys(patch) } });
    revalidatePath('/', 'layout');
    return null;
  });
}
