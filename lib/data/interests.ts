import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Enums } from '@/lib/supabase/database.types';
import { unwrap, unwrapMaybe } from './errors';

export type InterestBox = 'received' | 'sent' | 'accepted';

export type InterestRow = {
  id: string;
  status: Enums<'interest_status'>;
  outgoing: boolean;
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  counterpart: {
    id: string;
    publicCode: string;
    fullName: string;
    age: number | null;
    city: string | null;
  };
  contactVisible: boolean;
};

/** Scoped to one acting candidate — spec §6 keeps siblings' inboxes apart. */
export async function listInterests(
  candidateId: string,
  box: InterestBox = 'received',
): Promise<InterestRow[]> {
  const supabase = await createSupabaseServerClient();
  const rows = unwrap(
    await supabase.rpc('list_interests', { p_candidate_id: candidateId, p_box: box }),
  );

  return rows.map((row) => ({
    id: row.id as string,
    status: row.status as Enums<'interest_status'>,
    outgoing: row.outgoing ?? false,
    message: row.message,
    createdAt: row.created_at as string,
    respondedAt: row.responded_at,
    counterpart: {
      id: row.counterpart_id as string,
      publicCode: row.counterpart_code as string,
      fullName: row.counterpart_name as string,
      age: row.counterpart_age,
      city: row.counterpart_city,
    },
    contactVisible: row.contact_visible ?? false,
  }));
}

/**
 * Refused unless the verdict is exactly `eligible`. Spec §7: incomplete
 * information is not permission — a pair whose mosal is unknown can be browsed
 * and explained, but not acted on.
 */
export async function sendInterest(
  fromCandidateId: string,
  toCandidateId: string,
  message?: string,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('send_interest', {
      p_from_candidate: fromCandidateId,
      p_to_candidate: toCandidateId,
      p_message: message?.trim() || undefined,
    }),
  ) as string;
}

/**
 * Accepting creates the contact grant (spec §8). The UI must explain what that
 * reveals before calling this — the database will not ask twice.
 */
export async function respondToInterest(
  interestId: string,
  accept: boolean,
): Promise<Enums<'interest_status'>> {
  const supabase = await createSupabaseServerClient();
  const result = unwrap(
    await supabase.rpc('respond_interest', { p_interest_id: interestId, p_accept: accept }),
  ) as { status: Enums<'interest_status'> };

  return result.status;
}

export async function withdrawInterest(interestId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  unwrap(await supabase.rpc('withdraw_interest', { p_interest_id: interestId }));
}

/* ------------------------------------------------------------- blocking --- */

/**
 * Blocking is symmetric in effect: neither candidate appears to the other, so
 * that the sudden absence of a profile is not itself a message.
 */
export async function blockCandidate(
  blockerCandidateId: string,
  blockedCandidateId: string,
  reason?: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();

  unwrap(
    await supabase
      .from('candidate_blocks')
      .insert({
        blocker_candidate_id: blockerCandidateId,
        blocked_candidate_id: blockedCandidateId,
        created_by_account_id: claims?.claims?.sub as string,
        reason: reason?.trim() || null,
      })
      .select('id')
      .single(),
  );
}

export async function unblockCandidate(
  blockerCandidateId: string,
  blockedCandidateId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  unwrapMaybe(
    await supabase
      .from('candidate_blocks')
      .delete()
      .eq('blocker_candidate_id', blockerCandidateId)
      .eq('blocked_candidate_id', blockedCandidateId)
      .select('id')
      .maybeSingle(),
  );
}

/* -------------------------------------------------------- notifications --- */

export async function listNotifications(limit = 30) {
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase
      .from('notifications')
      .select('id, kind, candidate_id, payload, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
  );
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = await createSupabaseServerClient();
  unwrap(
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids)
      .select('id'),
  );
}
