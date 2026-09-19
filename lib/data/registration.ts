import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Enums } from '@/lib/supabase/database.types';
import { AppError, unwrap } from './errors';
import { getMyContext } from './session';

const PHONE = /^[6-9]\d{9}$/;

export type StartRegistrationInput = {
  relationship: Enums<'relationship'>;
  fullName: string;
  dateOfBirth: string;
  gender: Enums<'gender'>;
  fatherName?: string;
  motherName?: string;
  city?: string;
  nativePlace?: string;
};

export type StartRegistrationResult = {
  candidateId: string;
  applicationId: string;
  publicCode: string;
  /**
   * A count, never a list. Spec §4 forbids revealing anything about an existing
   * record while a possible duplicate is unresolved — including whether the
   * match is someone the operator knows.
   */
  possibleDuplicates: number;
};

export async function startRegistration(
  input: StartRegistrationInput,
): Promise<StartRegistrationResult> {
  const fullName = input.fullName.trim();
  if (fullName.length < 2) {
    throw new AppError('invalid', 'Enter the candidate’s full name.', ['fullName']);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) {
    throw new AppError('invalid', 'Enter a valid date of birth.', ['dateOfBirth']);
  }

  const supabase = await createSupabaseServerClient();
  const result = unwrap(
    await supabase.rpc('start_registration', {
      p_relationship: input.relationship,
      p_full_name: fullName,
      p_date_of_birth: input.dateOfBirth,
      p_gender: input.gender,
      p_father_name: input.fatherName?.trim() || undefined,
      p_mother_name: input.motherName?.trim() || undefined,
      p_city: input.city?.trim() || undefined,
      p_native_place: input.nativePlace?.trim() || undefined,
    }),
  ) as {
    candidate_id: string;
    application_id: string;
    public_code: string;
    possible_duplicates: number;
  };

  return {
    candidateId: result.candidate_id,
    applicationId: result.application_id,
    publicCode: result.public_code,
    possibleDuplicates: result.possible_duplicates,
  };
}

export async function updateRegistration(
  applicationId: string,
  patch: Partial<Omit<StartRegistrationInput, 'relationship'>>,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  unwrap(
    await supabase.rpc('update_registration', {
      p_application_id: applicationId,
      p_full_name: patch.fullName?.trim() || undefined,
      p_date_of_birth: patch.dateOfBirth || undefined,
      p_gender: patch.gender,
      p_father_name: patch.fatherName?.trim() || undefined,
      p_mother_name: patch.motherName?.trim() || undefined,
      p_city: patch.city?.trim() || undefined,
      p_native_place: patch.nativePlace?.trim() || undefined,
    }),
  );
}

/**
 * Certificates are uploaded straight to the private `certificates` bucket from
 * the browser, then recorded here. Two steps rather than one because a transfer
 * that fails halfway must not leave an application that looks complete — and
 * because a 10 MB scan has no business passing through the Next.js server.
 *
 * The path must be `<candidateId>/<something>`; both the RPC and the storage
 * policy enforce that, and the upload is rejected otherwise.
 */
export async function attachCertificate(input: {
  applicationId: string;
  candidateId: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string;
}): Promise<string> {
  if (!input.storagePath.startsWith(`${input.candidateId}/`)) {
    throw new AppError('invalid', 'The certificate was uploaded to the wrong place.');
  }

  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('attach_certificate', {
      p_application_id: input.applicationId,
      p_storage_path: input.storagePath,
      p_mime_type: input.mimeType,
      p_size_bytes: input.sizeBytes,
      p_checksum: input.checksumSha256,
    }),
  ) as string;
}

export type SubmissionReceipt = {
  status: 'submitted';
  reviewDueAt: string;
  targetHours: number;
};

export async function submitRegistration(applicationId: string): Promise<SubmissionReceipt> {
  const supabase = await createSupabaseServerClient();
  const result = unwrap(
    await supabase.rpc('submit_registration', { p_application_id: applicationId }),
  ) as { status: 'submitted'; review_due_at: string; target_hours: number };

  return {
    status: result.status,
    reviewDueAt: result.review_due_at,
    targetHours: result.target_hours,
  };
}

export async function withdrawRegistration(applicationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  unwrap(await supabase.rpc('withdraw_registration', { p_application_id: applicationId }));
}

/**
 * Spec §5: changing an identity-verified field needs another admin review, and
 * hides a published profile until that review happens.
 */
export async function requestIdentityChange(
  candidateId: string,
  fields: string[],
  reason: string,
): Promise<void> {
  if (fields.length === 0) {
    throw new AppError('invalid', 'Choose what needs to change.');
  }

  const supabase = await createSupabaseServerClient();
  unwrap(
    await supabase.rpc('request_identity_change', {
      p_candidate_id: candidateId,
      p_fields: fields,
      p_reason: reason,
    }),
  );
}

/**
 * Spec §4: when a candidate already has a canonical profile, the second
 * operator asks for access to it rather than creating a duplicate. The reply
 * carries a request id and nothing else — no name, no status, no confirmation
 * that the code belongs to the person they had in mind.
 */
export async function requestCandidateAccess(
  publicCode: string,
  relationship: Enums<'relationship'>,
  note?: string,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('request_candidate_access', {
      p_public_code: publicCode.trim().toUpperCase(),
      p_relationship: relationship,
      p_note: note?.trim() || undefined,
    }),
  ) as string;
}

/**
 * The application the registration form should reopen, if there is one.
 *
 * Spec §2: a draft and a requested correction are the only states in which the
 * form may be reopened. `my_context()` carries the status but not the candidate
 * details the form needs to prefill, so this fetches those too — through RLS,
 * which only ever returns candidates this account operates.
 */
export async function getOpenApplication() {
  const supabase = await createSupabaseServerClient();

  // Two queries rather than a PostgREST embed: postgrest-js types an embedded
  // select from the literal string, and this one would have to be built by
  // concatenation to stay readable, which loses the literal type.
  const rows = unwrap(
    await supabase
      .from('registration_applications')
      .select('id, candidate_id, status, operator_relationship, decision_reason, correction_fields')
      .in('status', ['draft', 'correction_requested'])
      .order('updated_at', { ascending: false })
      .limit(1),
  );

  const row = rows[0];
  if (!row) return null;

  const candidate = unwrap(
    await supabase
      .from('candidates')
      .select('id, full_name, date_of_birth, gender, father_name, city')
      .eq('id', row.candidate_id)
      .single(),
  );

  const hasCertificate = unwrap(
    await supabase
      .from('application_documents')
      .select('id')
      .eq('application_id', row.id)
      .is('deleted_at', null)
      .limit(1),
  );

  return {
    applicationId: row.id,
    candidateId: row.candidate_id,
    fullName: candidate.full_name,
    dateOfBirth: candidate.date_of_birth,
    fatherName: candidate.father_name ?? '',
    city: candidate.city ?? 'Surat',
    gender: candidate.gender,
    relationship: row.operator_relationship,
    // Members cannot read application_documents (spec §8), so this select
    // returns nothing for them — which is why `has_certificate` on my_context()
    // is the value the UI actually shows. Kept here for the staff path.
    hasCertificate: hasCertificate.length > 0,
    correctionFields: row.correction_fields,
    decisionReason: row.decision_reason,
  };
}

export async function listMyAccessRequests() {
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase
      .from('access_requests')
      .select('id, candidate_id, claimed_relationship, status, decision_reason, created_at, decided_at')
      .order('created_at', { ascending: false }),
  );
}

/**
 * Profile details for the account itself. Separate from the candidate records
 * so that the "who is operating this" screen never has to load a candidate.
 */
export async function updateAccountProfile(patch: {
  displayName?: string;
  preferredLanguage?: Enums<'language_code'>;
}): Promise<void> {
  const context = await getMyContext();
  if (!context.account) throw new AppError('unauthenticated', 'Sign in to continue.');

  const supabase = await createSupabaseServerClient();
  unwrap(
    await supabase
      .from('accounts')
      .update({
        display_name: patch.displayName?.trim() || null,
        preferred_language: patch.preferredLanguage,
      })
      .eq('id', context.account.id)
      .select('id')
      .single(),
  );
}

export function isValidLocalPhone(value: string): boolean {
  return PHONE.test(value.trim());
}
