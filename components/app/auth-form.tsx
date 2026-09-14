'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CircleHelp, ShieldCheck } from 'lucide-react';

import { signInAction, signUpAction } from '@/app/actions/auth';
import type { ActionResult } from '@/lib/data/errors';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

type Result = ActionResult<{ accountId: string }> | null;

/**
 * Sign-up and sign-in share a form because they collect the same two fields.
 *
 * There is no OTP: identity is established later by admin review of the birth
 * certificate. The password exists so an account is not takeable over by
 * anyone who knows the number — and the copy says exactly that rather than
 * implying the number has been verified.
 */
export function AuthForm({ lang, mode }: { lang: Lang; mode: 'sign-in' | 'sign-up' }) {
  const t = translator(lang);
  const router = useRouter();

  const [state, submit, pending] = useActionState<Result, FormData>(
    async (previous, formData) => {
      const result = mode === 'sign-up'
        ? await signUpAction(previous, formData)
        : await signInAction(previous, formData);

      if (result.ok) {
        // Where to go next is a question about access state, which the server
        // already answered. Land on the root and let it route.
        router.replace('/');
      }
      return result;
    },
    null,
  );

  const failedField = state && !state.ok ? state.detail[0] : undefined;

  return (
    <form action={submit}>
      <label className="field-label" htmlFor="phone">
        {t('તમારો મોબાઇલ નંબર', 'Your mobile number')} <span>*</span>
      </label>
      <div className="phone-input">
        <span>+91</span>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={10}
          placeholder="98765 43210"
          aria-invalid={failedField === 'phone'}
          required
        />
      </div>

      <label className="field-label" htmlFor="password">
        {t('પાસવર્ડ', 'Password')} <span>*</span>
      </label>
      <input
        className="field"
        id="password"
        name="password"
        type="password"
        autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
        minLength={8}
        aria-invalid={failedField === 'password'}
        required
      />
      {mode === 'sign-up' && (
        <p className="field-hint">
          {t('ઓછામાં ઓછા 8 અક્ષર.', 'At least 8 characters.')}
        </p>
      )}

      {mode === 'sign-up' && (
        <>
          <label className="field-label" htmlFor="displayName">
            {t('તમારું નામ', 'Your name')}
          </label>
          <input
            className="field"
            id="displayName"
            name="displayName"
            autoComplete="name"
            placeholder={t('જેમ કે રાજેશભાઈ', 'For example Rajeshbhai')}
          />
          <p className="field-hint">
            {t(
              'આ તમારું નામ છે — ઉમેદવારનું નામ પછીના પગલામાં પૂછીશું.',
              'This is your name. We will ask for the candidate’s name in the next step.',
            )}
          </p>
        </>
      )}

      {state && !state.ok && (
        <p role="alert" className="error">
          <CircleHelp size={17} />
          {state.message}
        </p>
      )}

      <div className="form-foot">
        <button className="primary" type="submit" disabled={pending}>
          {pending
            ? t('રાહ જુઓ…', 'One moment…')
            : mode === 'sign-up'
              ? t('ખાતું બનાવો', 'Create account')
              : t('લૉગ ઇન કરો', 'Log in')}
          <ArrowRight size={19} />
        </button>
        <p>
          <ShieldCheck size={13} />
          {t('તમારી માહિતી, તમારી સુરક્ષા.', 'Your information, protected.')}
        </p>
      </div>

      <p className="signin">
        {mode === 'sign-up'
          ? t('પહેલેથી ખાતું છે?', 'Already have an account?')
          : t('નવા છો?', 'New here?')}
        <Link href={mode === 'sign-up' ? '/sign-in' : '/sign-up'}>
          {mode === 'sign-up' ? t('લૉગ ઇન કરો', 'Log in') : t('ખાતું બનાવો', 'Create one')}
        </Link>
      </p>
    </form>
  );
}
