import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { signedUrl } from '@/lib/supabase/admin';
import type { Enums } from '@/lib/supabase/database.types';
import { AppError, unwrap, unwrapMaybe } from './errors';

export type DiscoverFilters = {
  query?: string;
  city?: string;
  sect?: string;
  subCommunity?: string;
  savedOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type DirectoryCard = {
  id: string;
  publicCode: string;
  fullName: string;
  age: number | null;
  city: string | null;
  subCommunity: string | null;
  sect: string | null;
  mosalFamily: string | null;
  biodata: Record<string, string>;
  verdict: Enums<'eligibility_verdict'>;
  saved: boolean;
  interestStatus: Enums<'interest_status'> | null;
  canViewPhotos: boolean;
};

/**
 * The directory as one acting candidate sees it.
 *
 * Two children of the same parent get different results from the same account,
 * because community rules are evaluated per pair (spec §7). That is why the
 * acting candidate is a required argument and not something inferred from the
 * session.
 */
export async function discover(
  viewerCandidateId: string,
  filters: DiscoverFilters = {},
): Promise<DirectoryCard[]> {
  const supabase = await createSupabaseServerClient();

  const rows = unwrap(
    await supabase.rpc('discover', {
      p_viewer_candidate: viewerCandidateId,
      p_query: filters.query?.trim() || undefined,
      p_city: filters.city || undefined,
      p_sect: filters.sect || undefined,
      p_sub_community: filters.subCommunity || undefined,
      p_saved_only: filters.savedOnly ?? false,
      p_limit: filters.limit ?? 20,
      p_offset: filters.offset ?? 0,
    }),
  );

  return rows.map((row) => ({
    id: row.id as string,
    publicCode: row.public_code as string,
    fullName: row.full_name as string,
    age: row.age,
    city: row.city,
    subCommunity: row.sub_community,
    sect: row.sect,
    mosalFamily: row.mosal_family,
    biodata: (row.biodata ?? {}) as Record<string, string>,
    verdict: row.verdict as Enums<'eligibility_verdict'>,
    saved: row.saved ?? false,
    interestStatus: row.interest_status,
    canViewPhotos: row.can_view_photos ?? false,
  }));
}

export type ProfileDetail = {
  verdict: Enums<'eligibility_verdict'>;
  explanation: { gu: string; en: string };
  /** Absent when the verdict excludes the pair — there is nothing to show. */
  id?: string;
  publicCode?: string;
  fullName?: string;
  age?: number;
  city?: string | null;
  nativePlace?: string | null;
  subCommunity?: string | null;
  sect?: string | null;
  paternalSurname?: string | null;
  mosalFamily?: string | null;
  communityConfirmed?: boolean;
  biodata?: Record<string, string>;
  saved?: boolean;
  interest?: { id: string; status: Enums<'interest_status'>; outgoing: boolean } | null;
  photos?: {
    visibility: Enums<'media_visibility'>;
    can_view: boolean;
    count: number;
    request_status: Enums<'media_request_status'> | null;
  };
  kundali?: { visibility: Enums<'media_visibility'>; can_view: boolean };
  contacts?: { kind: Enums<'contact_kind'>; display_name: string | null; phone: string }[];
};

export async function getProfile(
  viewerCandidateId: string,
  targetCandidateId: string,
): Promise<ProfileDetail> {
  const supabase = await createSupabaseServerClient();
  const detail = unwrap(
    await supabase.rpc('get_candidate_profile', {
      p_viewer_candidate: viewerCandidateId,
      p_target_candidate: targetCandidateId,
    }),
  );

  // Snake_case is preserved for the nested objects on purpose: they come
  // straight from jsonb, and renaming half of them would be worse than
  // renaming none.
  const raw = detail as Record<string, unknown>;
  return {
    ...raw,
    publicCode: raw.public_code as string | undefined,
    fullName: raw.full_name as string | undefined,
    nativePlace: raw.native_place as string | null | undefined,
    subCommunity: raw.sub_community as string | null | undefined,
    paternalSurname: raw.paternal_surname as string | null | undefined,
    mosalFamily: raw.mosal_family as string | null | undefined,
    communityConfirmed: raw.community_confirmed as boolean | undefined,
  } as ProfileDetail;
}

/* ------------------------------------------------------------- shortlist -- */

export async function setSaved(candidateId: string, saved: boolean): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const accountId = claims?.claims?.sub as string | undefined;
  if (!accountId) throw new AppError('unauthenticated', 'Sign in to continue.');

  if (saved) {
    unwrap(
      await supabase
        .from('saved_profiles')
        .upsert({ account_id: accountId, candidate_id: candidateId })
        .select('candidate_id')
        .single(),
    );
  } else {
    unwrapMaybe(
      await supabase
        .from('saved_profiles')
        .delete()
        .eq('account_id', accountId)
        .eq('candidate_id', candidateId)
        .select('candidate_id')
        .maybeSingle(),
    );
  }
}

export async function listSaved(viewerCandidateId: string) {
  const supabase = await createSupabaseServerClient();
  return unwrap(await supabase.rpc('list_saved', { p_viewer_candidate: viewerCandidateId }));
}

/* --------------------------------------------------------------- sharing -- */

/**
 * Spec §9: the token is returned once, here, and only its hash is stored.
 * Nothing about the candidate goes into the link or its preview — resolving one
 * still needs an authenticated, approved, eligible member.
 */
export async function createShareLink(
  candidateId: string,
): Promise<{ id: string; token: string; expiresAt: string }> {
  const supabase = await createSupabaseServerClient();
  const result = unwrap(
    await supabase.rpc('create_share_link', { p_candidate_id: candidateId }),
  ) as { id: string; token: string; expires_at: string };

  return { id: result.id, token: result.token, expiresAt: result.expires_at };
}

export async function resolveShareLink(
  token: string,
  viewerCandidateId: string,
): Promise<ProfileDetail> {
  const supabase = await createSupabaseServerClient();
  const detail = unwrap(
    await supabase.rpc('resolve_share_link', {
      p_token: token,
      p_viewer_candidate: viewerCandidateId,
    }),
  );
  return detail as unknown as ProfileDetail;
}

export async function revokeShareLink(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  unwrap(await supabase.rpc('revoke_share_link', { p_id: id }));
}

/* ----------------------------------------------------------------- media -- */

/**
 * Signed URLs for a candidate's photographs, but only once the database has
 * confirmed this viewer may see them. The service-role client signs the object;
 * it is never used to decide whether signing is allowed.
 */
export async function getViewableMedia(
  viewerCandidateId: string,
  ownerCandidateId: string,
  kind: Enums<'media_kind'> = 'photo',
): Promise<{ id: string; url: string; isPrimary: boolean }[]> {
  const supabase = await createSupabaseServerClient();

  const rows = unwrap(
    await supabase.rpc('list_viewable_media', {
      p_viewer_candidate: viewerCandidateId,
      p_owner_candidate: ownerCandidateId,
      p_kind: kind,
    }),
  );

  const signed = await Promise.all(
    rows.map(async (row) => ({
      id: row.id as string,
      url: await signedUrl(row.bucket_id as string, row.storage_path as string),
      isPrimary: row.is_primary ?? false,
    })),
  );

  return signed.filter((item): item is { id: string; url: string; isPrimary: boolean } =>
    item.url !== null);
}
