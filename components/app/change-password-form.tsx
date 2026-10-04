'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowRight, CircleCheck, CircleHelp, Eye, EyeOff } from 'lucide-react';

import { changePasswordAction } from '@/app/actions/auth';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

const MIN = 8;

/**
 * Current password, then the new one twice. The new one is typed twice
 * because there is no "forgot password" by SMS to fall back on — a mistyped
 * new password would mean calling a volunteer.
 */
export function ChangePasswordForm({ lang, home }: { lang: Lang; home: string }) {
  const t = translator(lang);
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [done, setDone] = useState(false);

  const submit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current) return setError({ field: 'current', message: t('હાલનો પાસવર્ડ લખો.', 'Enter your current password.') });
    if (next.length < MIN) return setError({ field: 'next', message: t(`નવો પાસવર્ડ ઓછામાં ઓછા ${MIN} અક્ષરનો રાખો.`, `Use at least ${MIN} characters for the new password.`) });
    if (next !== again) return setError({ field: 'again', message: t('બંને નવા પાસવર્ડ એકસરખા નથી.', 'The two new passwords do not match.') });
    setError(null);
    start(async () => {
      const result = await changePasswordAction({ current, next });
      if (result.ok) {
        setDone(true);
        return;
      }
      const field = result.detail[0];
      setError({
        field,
        message: field === 'current'
          ? t('હાલનો પાસવર્ડ ખોટો છે. ભૂલી ગયા હો તો સ્વયંસેવકને ફોન કરો.', 'The current password is not right. If you have forgotten it, call a volunteer.')
          : field === 'next'
            ? t('બીજો નવો પાસવર્ડ પસંદ કરો — હાલના કરતાં અલગ, ઓછામાં ઓછા 8 અક્ષર.', 'Choose another new password: different from the current one, at least 8 characters.')
            : t('પાસવર્ડ બદલી શકાયો નહીં. ફરી પ્રયાસ કરો.', 'The password could not be changed. Please try again.'),
      });
    });
  };

  if (done) {
    return (
      <div className="password-done">
        <p className="note brand">
          <CircleCheck size={19} />
          <span>{t('પાસવર્ડ બદલાઈ ગયો. બીજા ફોન પરથી લૉગ આઉટ થઈ ગયું છે — ત્યાં નવા પાસવર્ડથી લૉગ ઇન કરો.', 'Password changed. Any other phones were signed out; sign in there with the new password.')}</span>
        </p>
        <Link className="cta" href={home}>{t('આગળ વધો', 'Continue')}<ArrowRight size={20} /></Link>
      </div>
    );
  }

  const input = (id: string, label: string, value: string, set: (value: string) => void, autoComplete: string) => (
    <div className="auth-field">
      <label className="auth-label" htmlFor={id}>{label}</label>
      <div className={`auth-input${error?.field === id ? ' invalid' : ''}`}>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => { set(event.target.value); setError(null); }}
        />
      </div>
    </div>
  );

  return (
    <form className="password-form" noValidate onSubmit={submit}>
      {input('current', t('હાલનો પાસવર્ડ', 'Current password'), current, setCurrent, 'current-password')}
      {input('next', t('નવો પાસવર્ડ', 'New password'), next, setNext, 'new-password')}
      {input('again', t('નવો પાસવર્ડ ફરી લખો', 'New password again'), again, setAgain, 'new-password')}

      <button type="button" className="text-button muted" onClick={() => setShow((value) => !value)}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
        {show ? t('પાસવર્ડ છુપાવો', 'Hide passwords') : t('પાસવર્ડ બતાવો', 'Show passwords')}
      </button>

      {error && <p role="alert" className="auth-error"><CircleHelp size={18} /><span>{error.message}</span></p>}

      <button className="cta" type="submit" disabled={pending}>
        {pending
          ? <><span className="cta-spinner" aria-hidden="true" />{t('બદલી રહ્યા છીએ…', 'Changing…')}</>
          : <>{t('પાસવર્ડ બદલો', 'Change password')}<ArrowRight size={20} /></>}
      </button>
    </form>
  );
}
