import 'server-only';

import { cache } from 'react';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/database.types';
import { AppError, unwrap, unwrapMaybe } from './errors';

export type BiodataValues = Record<string, string>;

/**
 * The field catalogue, straight from the database. The form should render from
 * this rather than from the constant in components/biodata/model.ts: the
 * database copy is the one that decides what a write may contain, and a form
 * built from a second list will eventually disagree with it.
 */
export const getBiodataFields = cache(async (): Promise<Tables<'biodata_fields'>[]> => {
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase
      .from('biodata_fields')
      .select('*')
      .order('section')
      .order('ordinal'),
  );
});

export type SaveDraftResult = {
  revisionId: string;
  version: number;
  status: string;
  completion: number;
  unconfirmedFields: string[];
};

/**
 * Autosave target. Send only the fields that changed — the server merges them
 * into the open revision, rejects keys the catalogue does not know, and
 * recomputes completion itself.
 *
 * This replaces the prototype's localStorage draft. A draft on one phone was
 * invisible on another, and invisible to the admin queue; a draft here is the
 * same draft everywhere.
 */
export async function saveBiodataDraft(
  candidateId: string,
  values: BiodataValues,
): Promise<SaveDraftResult> {
  const supabase = await createSupabaseServerClient();
  const result = unwrap(
    await supabase.rpc('save_biodata_draft', {
      p_candidate_id: candidateId,
      p_data: values,
      p_source: 'guided',
    }),
  ) as {
    revision_id: string;
    version: number;
    status: string;
    completion: number;
    unconfirmed_fields: string[];
  };

  return {
    revisionId: result.revision_id,
    version: result.version,
    status: result.status,
    completion: result.completion,
    unconfirmedFields: result.unconfirmed_fields ?? [],
  };
}

/**
 * Spec §5/§12: pasted biodata is untrusted input. Parsing happens outside the
 * database — do it here, in a route handler, or in an edge function — and every
 * key that arrives this way is marked unconfirmed, which blocks submission
 * until a human has been through them.
 */
export async function stageImportedBiodata(
  candidateId: string,
  values: BiodataValues,
): Promise<{ revisionId: string; completion: number; unconfirmedFields: string[]; needsReview: boolean }> {
  const supabase = await createSupabaseServerClient();
  const result = unwrap(
    await supabase.rpc('stage_imported_biodata', {
      p_candidate_id: candidateId,
      p_data: values,
    }),
  ) as {
    revision_id: string;
    completion: number;
    unconfirmed_fields: string[];
    needs_review: boolean;
  };

  return {
    revisionId: result.revision_id,
    completion: result.completion,
    unconfirmedFields: result.unconfirmed_fields ?? [],
    needsReview: result.needs_review,
  };
}

export async function confirmBiodataFields(
  revisionId: string,
  fields: string[],
): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const result = unwrap(
    await supabase.rpc('confirm_biodata_fields', {
      p_revision_id: revisionId,
      p_fields: fields,
    }),
  ) as { unconfirmed_fields: string[] };

  return result.unconfirmed_fields ?? [];
}

export async function confirmCommunityDetails(candidateId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  unwrap(await supabase.rpc('confirm_community_details', { p_candidate_id: candidateId }));
}

export async function submitBiodata(revisionId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  unwrap(await supabase.rpc('submit_biodata', { p_revision_id: revisionId }));
}

export type OpenRevision = {
  revision: Tables<'biodata_revisions'> | null;
  community: Tables<'candidate_community'> | null;
  issues: Tables<'revision_field_issues'>[];
  /** The identity-verified core, shown above the form and not editable in it. */
  candidate: Pick<Tables<'candidates'>,
    'id' | 'full_name' | 'date_of_birth' | 'father_name' | 'city'>;
};

/** Everything the biodata screen needs: the draft, its issues, and the state. */
export async function getEditableBiodata(candidateId: string): Promise<OpenRevision> {
  const supabase = await createSupabaseServerClient();

  const revisions = unwrap(
    await supabase
      .from('biodata_revisions')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('version', { ascending: false })
      .limit(1),
  );
  const revision = revisions[0] ?? null;

  const community = unwrapMaybe(
    await supabase
      .from('candidate_community')
      .select('*')
      .eq('candidate_id', candidateId)
      .maybeSingle(),
  );

  const issues = revision
    ? unwrap(
        await supabase
          .from('revision_field_issues')
          .select('*')
          .eq('revision_id', revision.id)
          .is('resolved_at', null),
      )
    : [];

  const candidate = unwrap(
    await supabase
      .from('candidates')
      .select('id, full_name, date_of_birth, father_name, city')
      .eq('id', candidateId)
      .single(),
  );

  return { revision, community, issues, candidate };
}

/** Everything the Family screen shows for one candidate. */
export async function getCandidateSettings(candidateId: string) {
  const supabase = await createSupabaseServerClient();

  const [privacy, preferences, memberships] = await Promise.all([
    supabase.from('candidate_privacy').select('*').eq('candidate_id', candidateId).maybeSingle(),
    supabase.from('family_preferences').select('*').eq('candidate_id', candidateId).maybeSingle(),
    supabase
      .from('candidate_memberships')
      .select('id, account_id, role, relationship, linked_at')
      .eq('candidate_id', candidateId)
      .is('revoked_at', null),
  ]);

  return {
    privacy: unwrapMaybe(privacy),
    preferences: unwrapMaybe(preferences),
    memberships: unwrap(memberships),
  };
}

/* ----------------------------------------------------------------- consent */

/**
 * Spec §4: only the candidate's own account may consent, and a parent may not
 * stand in. The database enforces that with a trigger; this check exists to
 * give the UI a usable message instead of a raised exception.
 */
export async function grantPublicationConsent(candidateId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  unwrap(await supabase.rpc('grant_publication_consent', { p_candidate_id: candidateId }));
}

export async function withdrawPublicationConsent(candidateId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  unwrap(await supabase.rpc('withdraw_publication_consent', { p_candidate_id: candidateId }));
}

/* ---------------------------------------------------- immediate switches -- */

/**
 * Spec §5: pause, match-found and privacy take effect at once, with no review.
 * These are plain updates rather than RPCs because the column grants on
 * `candidates` already limit them to exactly these three switches.
 */
export async function setCandidateSwitches(
  candidateId: string,
  patch: { paused?: boolean; matchFound?: boolean; requestDeletion?: boolean },
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();

  unwrap(
    await supabase
      .from('candidates')
      .update({
        ...(patch.paused === undefined ? {} : { paused: patch.paused }),
        ...(patch.matchFound === undefined ? {} : { match_found_at: patch.matchFound ? now : null }),
        ...(patch.requestDeletion ? { deletion_requested_at: now } : {}),
      })
      .eq('id', candidateId)
      .select('id')
      .single(),
  );
}

export async function setPrivacy(
  candidateId: string,
  patch: Partial<Pick<Tables<'candidate_privacy'>,
    'photo_visibility' | 'kundali_visibility' | 'reveal_contact_on_accept'>>,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  unwrap(
    await supabase
      .from('candidate_privacy')
      .update(patch)
      .eq('candidate_id', candidateId)
      .select('candidate_id')
      .single(),
  );
}

export async function setFamilyPreferences(
  candidateId: string,
  patch: {
    requireSameSubCommunity?: boolean;
    requireSameSect?: boolean;
    minAge?: number | null;
    maxAge?: number | null;
    cities?: string[];
  },
): Promise<void> {
  if (patch.minAge != null && patch.maxAge != null && patch.minAge > patch.maxAge) {
    throw new AppError('invalid', 'The minimum age cannot be above the maximum.');
  }

  const supabase = await createSupabaseServerClient();
  unwrap(
    await supabase
      .from('family_preferences')
      .upsert(
        {
          candidate_id: candidateId,
          require_same_sub_community: patch.requireSameSubCommunity,
          require_same_sect: patch.requireSameSect,
          min_age: patch.minAge,
          max_age: patch.maxAge,
          cities: patch.cities,
        },
        { onConflict: 'candidate_id' },
      )
      .select('candidate_id')
      .single(),
  );
}
