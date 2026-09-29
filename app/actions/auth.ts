'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { actionResult, AppError, type ActionResult } from '@/lib/data/errors';
import { field, trimmedField } from '@/lib/data/form';
import { isValidLocalPhone, normalizeLocalPhone, toE164 } from '@/lib/phone';
import { signOut as signOutOfSession } from '@/lib/data/session';
import { recordActivity, track, trackFailedSignIn } from '@/lib/data/activity';
import { RULES_VERSION } from '@/lib/rules';

/**
 * Phone and password, with no OTP.
 *
 * This release does not send an SMS: identity is established by admin review of
 * the birth certificate (spec §3), and the phone number is a self-declared
 * identifier until then. The password exists so an account is not takeable over
 * by anyone who knows the number — without a credential of some kind, an
 * unverified phone is not an identity at all.
 *
 * `accounts.phone_verified_at` stays null to record exactly that. Turning on
 * real OTP later is a config change in supabase/config.toml plus a different
 * call here; no schema change.
 */
const MIN_PASSWORD = 8;

export async function signUpAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionResult<{ accountId: string }>> {
  return actionResult(async () => {
    const phone = normalizeLocalPhone(field(formData, 'phone'));
    const password = field(formData, 'password');
    const displayName = trimmedField(formData, 'displayName');

    if (!isValidLocalPhone(phone)) {
      throw new AppError('invalid', 'Enter a ten-digit mobile number.', ['phone']);
    }
    if (password.length < MIN_PASSWORD) {
      throw new AppError('invalid', `Use at least ${MIN_PASSWORD} characters.`, ['password']);
    }
    // The bureau's rules are accepted before the account exists, and the
    // version is checked so an old tab cannot agree to wording it never showed.
    if (field(formData, 'rulesVersion') !== RULES_VERSION) {
      throw new AppError('invalid', 'Please read and accept the rules to continue.', ['rules']);
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      phone: toE164(phone),
      password,
      options: {
        data: {
          display_name: displayName || null,
          preferred_language: 'gu',
          rules_version: RULES_VERSION,
          rules_accepted_at: new Date().toISOString(),
        },
      },
    });

    if (error) {
      // "already registered" is the one auth error worth naming precisely,
      // because the next step the member should take is different.
      const alreadyRegistered = /already/i.test(error.message);
      throw new AppError(
        alreadyRegistered ? 'conflict' : 'invalid',
        alreadyRegistered ? 'That number already has an account. Sign in instead.' : error.message,
        ['phone'],
      );
    }
    if (!data.user) {
      throw new AppError('unknown', 'Sign-up did not complete. Try again.');
    }

    track('auth.sign_up', { detail: { rules_version: RULES_VERSION } }, supabase);
    revalidatePath('/', 'layout');
    return { accountId: data.user.id };
  });
}

export async function signInAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionResult<{ accountId: string }>> {
  return actionResult(async () => {
    const phone = normalizeLocalPhone(field(formData, 'phone'));
    const password = field(formData, 'password');

    // No minimum on sign-in. A length rule belongs where the password is
    // chosen; applying it here would lock out any account whose password was
    // set elsewhere — an admin PIN issued by the community, for instance.
    if (!isValidLocalPhone(phone)) {
      throw new AppError('invalid', 'Enter a ten-digit mobile number.', ['phone']);
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      phone: toE164(phone),
      password,
    });

    // An admin switched this account off (admin_set_account_status bans the
    // auth user). Said plainly, so they call a volunteer instead of retrying
    // a password that is not the problem.
    if (error?.code === 'user_banned') {
      trackFailedSignIn(phone, 'switched_off');
      throw new AppError('forbidden', 'This account is switched off. Please call a samaj volunteer.', ['switched_off']);
    }

    if (error || !data.user) {
      trackFailedSignIn(phone, 'wrong_password');
      // Deliberately the same message for a wrong number and a wrong password,
      // so the form cannot be used to find out which numbers are registered.
      throw new AppError('forbidden', 'That mobile number and password do not match.');
    }

    track('auth.sign_in', {}, supabase);
    revalidatePath('/', 'layout');
    return { accountId: data.user.id };
  });
}

export async function signOutAction(): Promise<ActionResult> {
  return actionResult(async () => {
    // Before, not after: once signed out there is no session to record it with.
    await recordActivity('auth.sign_out');
    await signOutOfSession();
    revalidatePath('/', 'layout');
    return null;
  });
}
