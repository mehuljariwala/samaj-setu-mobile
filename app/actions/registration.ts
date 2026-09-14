'use server';

import { revalidatePath } from 'next/cache';

import type { Enums } from '@/lib/supabase/database.types';
import { actionResult, type ActionResult } from '@/lib/data/errors';
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
    const result = await registration.startRegistration({
      relationship: enumField(formData, 'relationship', RELATIONSHIPS, 'self'),
      fullName: trimmedField(formData, 'fullName'),
      dateOfBirth: trimmedField(formData, 'dateOfBirth'),
      gender: enumField(formData, 'gender', GENDERS, 'female'),
      fatherName: trimmedField(formData, 'fatherName'),
      motherName: trimmedField(formData, 'motherName'),
      city: trimmedField(formData, 'city'),
      nativePlace: trimmedField(formData, 'nativePlace'),
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
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function attachCertificateAction(
  input: Parameters<typeof registration.attachCertificate>[0],
): Promise<ActionResult<{ documentId: string }>> {
  return actionResult(async () => {
    const documentId = await registration.attachCertificate(input);
    revalidatePath('/', 'layout');
    return { documentId };
  });
}

export async function submitRegistrationAction(
  applicationId: string,
): Promise<ActionResult<registration.SubmissionReceipt>> {
  return actionResult(async () => {
    const receipt = await registration.submitRegistration(applicationId);
    revalidatePath('/', 'layout');
    return receipt;
  });
}

export async function withdrawRegistrationAction(
  applicationId: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    await registration.withdrawRegistration(applicationId);
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
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function requestCandidateAccessAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionResult<{ requestId: string }>> {
  return actionResult(async () => {
    const requestId = await registration.requestCandidateAccess(
      trimmedField(formData, 'publicCode'),
      enumField(formData, 'relationship', RELATIONSHIPS, 'other'),
      trimmedField(formData, 'note'),
    );
    revalidatePath('/', 'layout');
    return { requestId };
  });
}

export async function updateAccountProfileAction(
  patch: Parameters<typeof registration.updateAccountProfile>[0],
): Promise<ActionResult> {
  return actionResult(async () => {
    await registration.updateAccountProfile(patch);
    revalidatePath('/', 'layout');
    return null;
  });
}
