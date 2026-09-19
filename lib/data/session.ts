import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Enums } from '@/lib/supabase/database.types';
import { CANDIDATE_COOKIE, LANG_COOKIE, isLang, type Lang } from '@/lib/i18n';
import { AppError, unwrap } from './errors';

/**
 * The shape returned by `public.my_context()`. The function builds jsonb, so
 * this interface is the contract between the two; change one and change the
 * other. Everything in it is derived server-side — `accessState` in particular
 * is spec §2's access table, resolved where the client cannot influence it.
 */
export type CandidateSummary = {
  id: string;
  public_code: string;
  full_name: string;
  gender: Enums<'gender'>;
  relationship: Enums<'relationship'>;
  is_self: boolean;
  identity_status: Enums<'identity_status'>;
  publication_status: Enums<'publication_status'>;
  discoverable: boolean;
  paused: boolean;
  consent_active: boolean;
  application: {
    id: string;
    status: Enums<'application_status'>;
    submitted_at: string | null;
    review_due_at: string | null;
    overdue: boolean;
    decision_reason: string | null;
    correction_fields: string[];
    has_certificate: boolean;
  } | null;
  biodata: {
    revision_id: string;
    status: Enums<'revision_status'>;
    completion: number;
    decision_reason: string | null;
    correction_fields: string[];
  } | null;
  pending_interests: number;
  pending_photo_requests: number;
};

export type MyContext = {
  account: {
    id: string;
    phone: string;
    display_name: string | null;
    preferred_language: Enums<'language_code'>;
    status: Enums<'account_status'>;
    phone_verified: boolean;
  } | null;
  access_state: Enums<'access_state'>;
  roles: Enums<'app_role'>[];
  candidates: CandidateSummary[];
  unread_notifications: number;
};

const SIGNED_OUT: MyContext = {
  account: null,
  access_state: 'signed_out',
  roles: [],
  candidates: [],
  unread_notifications: 0,
};

/**
 * One round trip per request for everything the app shell needs. `cache` makes
 * repeated calls within a single render free, which is what lets layouts and
 * pages each ask independently instead of threading the answer down as props.
 */
export const getMyContext = cache(async (): Promise<MyContext> => {
  const supabase = await createSupabaseServerClient();

  // getClaims validates the token rather than trusting the cookie's contents.
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return SIGNED_OUT;

  const context = unwrap(await supabase.rpc('my_context'));
  return context as unknown as MyContext;
});

export async function requireAccountId(): Promise<string> {
  const context = await getMyContext();
  if (!context.account) {
    throw new AppError('unauthenticated', 'Sign in to continue.');
  }
  return context.account.id;
}

/** Spec §2: member screens open only once a candidate has been verified. */
export async function requireMemberAccess(): Promise<MyContext> {
  const context = await getMyContext();
  if (context.access_state !== 'approved') {
    throw new AppError(
      'forbidden',
      'This opens once an admin has approved your application.',
      [context.access_state],
    );
  }
  return context;
}

export async function requireStaff(): Promise<MyContext> {
  const context = await getMyContext();
  const staff = context.roles.some((role) =>
    role === 'moderator' || role === 'admin' || role === 'superadmin');

  if (!staff) {
    throw new AppError('forbidden', 'Admin access is required.');
  }
  return context;
}

/**
 * The candidate an action is being taken for. Spec §6: candidate-specific
 * actions must always identify the acting candidate, so this refuses to guess
 * when a parent manages more than one child.
 */
export async function resolveActingCandidate(
  candidateId?: string | null,
): Promise<CandidateSummary> {
  const context = await getMyContext();

  if (candidateId) {
    const match = context.candidates.find((candidate) => candidate.id === candidateId);
    if (!match) {
      throw new AppError('forbidden', 'You do not act for that candidate.');
    }
    return match;
  }

  if (context.candidates.length === 1) return context.candidates[0];

  throw new AppError(
    'invalid',
    context.candidates.length === 0
      ? 'There is no candidate on this account yet.'
      : 'Choose which candidate this is for.',
  );
}

/** Sign-out is a mutation, so it belongs in an action rather than a render. */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}

/* ------------------------------------------------------------- preferences */

/**
 * The cookie is read first so the choice applies before sign-in and so the
 * server renders the right language on the first paint. The account column is
 * the fallback, which is what carries the choice to a new device.
 */
export const getLang = cache(async (): Promise<Lang> => {
  const cookie = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(cookie)) return cookie;

  const context = await getMyContext();
  return context.account?.preferred_language ?? 'gu';
});

/**
 * Spec §6: "Keep the selected candidate visible when an action depends on their
 * identity." The cookie is only a hint — it is validated against the
 * memberships this account actually holds, so a tampered value selects nothing
 * rather than someone else's candidate.
 */
export const getActingCandidate = cache(async (): Promise<CandidateSummary | null> => {
  const context = await getMyContext();
  if (context.candidates.length === 0) return null;

  const preferred = (await cookies()).get(CANDIDATE_COOKIE)?.value;
  const match = context.candidates.find((candidate) => candidate.id === preferred);
  if (match) return match;

  // Default to the first candidate who can actually do something — a published
  // one — so a parent whose second child is still in review lands usefully.
  return context.candidates.find((candidate) => candidate.discoverable)
    ?? context.candidates[0];
});
