import 'server-only';

import { redirect } from 'next/navigation';

import type { Lang } from '@/lib/i18n';
import {
  getActingCandidate,
  getLang,
  getMyContext,
  type CandidateSummary,
  type MyContext,
} from './session';

/**
 * The server-side equivalent of the prototype's guarded `go()`.
 *
 * Every gated page starts by calling one of these, so a screen can never render
 * in a state that could not really exist — a member home with no application,
 * an admin console for a member. Navigation is not the boundary: the row level
 * security policies and the RPCs refuse the same requests independently. These
 * exist so a member is shown the screen their state *does* own instead of an
 * error.
 */
export type PageContext = {
  context: MyContext;
  lang: Lang;
  acting: CandidateSummary | null;
};

async function load(): Promise<PageContext> {
  const [context, lang, acting] = await Promise.all([
    getMyContext(),
    getLang(),
    getActingCandidate(),
  ]);
  return { context, lang, acting };
}

/** Where an account belongs when it asks for a screen its state does not allow. */
export function homeFor(context: MyContext): string {
  switch (context.access_state) {
    case 'signed_out':
      return '/';
    case 'no_application':
      return '/register';
    case 'application_draft':
      return '/register';
    case 'approved':
      return '/home';
    default:
      // awaiting_review, correction_requested, rejected, suspended
      return '/review';
  }
}

/** Welcome, sign-in, sign-up: reachable by anyone, but not worth showing twice. */
export async function loadPublicPage(): Promise<PageContext> {
  return load();
}

/** Registration and status: signed in, but not necessarily approved. */
export async function loadApplicantPage(): Promise<PageContext> {
  const page = await load();
  if (page.context.access_state === 'signed_out') redirect('/sign-in');
  return page;
}

/**
 * Member screens. Spec §2: these open only once a candidate has been verified,
 * and the first approved child is enough to unlock them for a parent.
 */
export async function loadMemberPage(): Promise<PageContext> {
  const page = await load();
  if (page.context.access_state === 'signed_out') redirect('/sign-in');
  if (page.context.access_state !== 'approved') redirect(homeFor(page.context));
  return page;
}

/**
 * Member screens that act for one candidate. Redirects to Family when there is
 * no usable candidate, rather than guessing which child an action was meant for.
 */
export async function loadActingPage(): Promise<PageContext & { acting: CandidateSummary }> {
  const page = await loadMemberPage();
  if (!page.acting) redirect('/family');
  return page as PageContext & { acting: CandidateSummary };
}

/** Spec §2: admin is a separate role, not a member access state. */
export async function loadAdminPage(): Promise<PageContext & { staff: true }> {
  const page = await load();
  if (page.context.access_state === 'signed_out') redirect('/sign-in');

  const staff = page.context.roles.some(
    (role) => role === 'moderator' || role === 'admin' || role === 'superadmin',
  );
  if (!staff) redirect(homeFor(page.context));

  return { ...page, staff: true };
}

export function isAdmin(context: MyContext): boolean {
  return context.roles.some((role) => role === 'admin' || role === 'superadmin');
}
