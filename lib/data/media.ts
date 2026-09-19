import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { signedUrl } from '@/lib/supabase/admin';
import type { Enums, Tables } from '@/lib/supabase/database.types';
import { BUCKETS } from '@/lib/storage';
import { AppError, unwrap } from './errors';

export const MEDIA_BUCKET: Record<Enums<'media_kind'>, string> = {
  photo: BUCKETS.photo,
  kundali: BUCKETS.kundali,
};

/**
 * Records an object that has already been uploaded from the browser. Uploading
 * and recording are separate so that an interrupted transfer leaves no row, and
 * so that large files never pass through the Next.js server.
 */
export async function registerMedia(input: {
  candidateId: string;
  kind: Enums<'media_kind'>;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  isPrimary?: boolean;
}): Promise<string> {
  if (!input.storagePath.startsWith(`${input.candidateId}/`)) {
    throw new AppError('invalid', 'The file was uploaded to the wrong place.');
  }

  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('register_media', {
      p_candidate_id: input.candidateId,
      p_kind: input.kind,
      p_storage_path: input.storagePath,
      p_mime_type: input.mimeType,
      p_size_bytes: input.sizeBytes,
      p_is_primary: input.isPrimary ?? false,
    }),
  ) as string;
}

/** A candidate's own media, including anything still awaiting review. */
export async function listOwnMedia(
  candidateId: string,
  kind: Enums<'media_kind'> = 'photo',
): Promise<(Tables<'candidate_media'> & { url: string | null })[]> {
  const supabase = await createSupabaseServerClient();

  const rows = unwrap(
    await supabase
      .from('candidate_media')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('kind', kind)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false })
      .order('sort_order'),
  );

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      url: await signedUrl(row.bucket_id, row.storage_path),
    })),
  );
}

export async function setPrimaryPhoto(candidateId: string, mediaId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  unwrap(
    await supabase
      .from('candidate_media')
      .update({ is_primary: false })
      .eq('candidate_id', candidateId)
      .eq('kind', 'photo')
      .select('id'),
  );

  unwrap(
    await supabase
      .from('candidate_media')
      .update({ is_primary: true })
      .eq('id', mediaId)
      .select('id')
      .single(),
  );
}

/** Soft delete. The object stays until an operations task removes it. */
export async function removeMedia(mediaId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  unwrap(
    await supabase
      .from('candidate_media')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', mediaId)
      .select('id')
      .single(),
  );
}

/* ------------------------------------------------------- access requests -- */

export async function requestMediaAccess(
  viewerCandidateId: string,
  ownerCandidateId: string,
  kind: Enums<'media_kind'> = 'photo',
  message?: string,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('request_media_access', {
      p_viewer_candidate: viewerCandidateId,
      p_owner_candidate: ownerCandidateId,
      p_kind: kind,
      p_message: message?.trim() || undefined,
    }),
  ) as string;
}

export async function decideMediaAccess(
  requestId: string,
  approve: boolean,
): Promise<Enums<'media_request_status'>> {
  const supabase = await createSupabaseServerClient();
  const result = unwrap(
    await supabase.rpc('decide_media_access', { p_request_id: requestId, p_approve: approve }),
  ) as { status: Enums<'media_request_status'> };

  return result.status;
}

/**
 * Spec §8: revocation prevents future access. It cannot recall a photograph
 * that has already been downloaded, and the UI must not suggest otherwise.
 */
export async function revokeMediaGrant(grantId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  unwrap(await supabase.rpc('revoke_media_grant', { p_grant_id: grantId }));
}

export async function listMediaRequests(ownerCandidateId: string) {
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase
      .from('media_access_requests')
      .select('id, viewer_candidate_id, kind, status, message, created_at, decided_at')
      .eq('owner_candidate_id', ownerCandidateId)
      .order('created_at', { ascending: false }),
  );
}

export async function listMediaGrants(ownerCandidateId: string) {
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase
      .from('media_grants')
      .select('id, viewer_candidate_id, kind, granted_at, expires_at, revoked_at')
      .eq('owner_candidate_id', ownerCandidateId)
      .is('revoked_at', null)
      .order('granted_at', { ascending: false }),
  );
}
