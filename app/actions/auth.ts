'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { actionResult, AppError, type ActionResult } from '@/lib/data/errors';
import { digitsField, field, trimmedField } from '@/lib/data/form';
import { signOut as signOutOfSession } from '@/lib/data/session';

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
const PHONE = /^[6-9]\d{9}$/;
const MIN_PASSWORD = 8;

/** GoTrue works in E.164; the product works in ten local digits. */
function toE164(localPhone: string): string {
  return `+91${localPhone}`;
}

export async function signUpAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionResult<{ accountId: string }>> {
  return actionResult(async () => {
    const phone = digitsField(formData, 'phone');
    const password = field(formData, 'password');
    const displayName = trimmedField(formData, 'displayName');

    if (!PHONE.test(phone)) {
      throw new AppError('invalid', 'Enter a ten-digit mobile number.', ['phone']);
    }
    if (password.length < MIN_PASSWORD) {
      throw new AppError('invalid', `Use at least ${MIN_PASSWORD} characters.`, ['password']);
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      phone: toE164(phone),
      password,
      options: { data: { display_name: displayName || null, preferred_language: 'gu' } },
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

    revalidatePath('/', 'layout');
    return { accountId: data.user.id };
  });
}

export async function signInAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionResult<{ accountId: string }>> {
  return actionResult(async () => {
    const phone = digitsField(formData, 'phone');
    const password = field(formData, 'password');

    if (!PHONE.test(phone)) {
      throw new AppError('invalid', 'Enter a ten-digit mobile number.', ['phone']);
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      phone: toE164(phone),
      password,
    });

    if (error || !data.user) {
      // Deliberately the same message for a wrong number and a wrong password,
      // so the form cannot be used to find out which numbers are registered.
      throw new AppError('forbidden', 'That mobile number and password do not match.');
    }

    revalidatePath('/', 'layout');
    return { accountId: data.user.id };
  });
}

export async function signOutAction(): Promise<ActionResult> {
  return actionResult(async () => {
    await signOutOfSession();
    revalidatePath('/', 'layout');
    return null;
  });
}
