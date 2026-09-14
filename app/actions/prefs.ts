'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { CANDIDATE_COOKIE, COOKIE_MAX_AGE, LANG_COOKIE, isLang } from '@/lib/i18n';
import { actionResult, type ActionResult } from '@/lib/data/errors';
import { getMyContext } from '@/lib/data/session';
import { updateAccountProfile } from '@/lib/data/registration';

/**
 * Switching language must preserve progress (spec §11), so it writes a cookie
 * and re-renders rather than reloading. For a signed-in member it is also
 * mirrored to `accounts.preferred_language`, which is what carries the choice
 * to their next device.
 */
export async function setLanguageAction(value: string): Promise<ActionResult> {
  return actionResult(async () => {
    const lang = isLang(value) ? value : 'gu';

    (await cookies()).set(LANG_COOKIE, lang, {
      maxAge: COOKIE_MAX_AGE,
      sameSite: 'lax',
      path: '/',
    });

    const context = await getMyContext();
    if (context.account && context.account.preferred_language !== lang) {
      await updateAccountProfile({ preferredLanguage: lang });
    }

    revalidatePath('/', 'layout');
    return null;
  });
}

/**
 * Spec §6: candidate-specific actions must identify the acting candidate. This
 * only records a preference — every read and write re-validates the id against
 * the caller's memberships, so a tampered cookie selects nothing.
 */
export async function setActingCandidateAction(candidateId: string): Promise<ActionResult> {
  return actionResult(async () => {
    const context = await getMyContext();
    const known = context.candidates.some((candidate) => candidate.id === candidateId);

    if (known) {
      (await cookies()).set(CANDIDATE_COOKIE, candidateId, {
        maxAge: COOKIE_MAX_AGE,
        sameSite: 'lax',
        path: '/',
      });
    }

    revalidatePath('/', 'layout');
    return null;
  });
}
