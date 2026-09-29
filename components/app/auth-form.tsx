'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, CircleHelp, Eye, EyeOff, LogIn } from 'lucide-react';

import { signInAction } from '@/app/actions/auth';
import type { ActionResult } from '@/lib/data/errors';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';
import { isValidLocalPhone } from '@/lib/phone';

type Result = ActionResult<{ accountId: string }> | null;
type Field = 'phone' | 'password';

/**
 * Sign-in: number and password on one screen, in the same style as the
 * three-step join flow (`JoinFlow`), which is where accounts are created.
 */
export function AuthForm({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<{ field: Field; message: string } | null>(null);
  const [shake, setShake] = useState(0);
  const [done, setDone] = useState(false);

  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [state, submit, pending] = useActionState<Result, FormData>(
    async (previous, formData) => {
      const result = await signInAction(previous, formData);
      if (result.ok) {
        setDone(true);
        // Where to go next is a question about access state, which the server
        // already answered. Land on the root and let it route.
        router.replace('/');
      } else {
        setShake((n) => n + 1);
      }
      return result;
    },
    null,
  );

  const phoneOk = isValidLocalPhone(phone);
  const serverError = state && !state.ok ? state : null;

  // The server speaks in codes; the one a member actually meets here is said
  // in their language. Anything else falls back to the server's own wording.
  const switchedOff = serverError?.detail[0] === 'switched_off';
  const serverMessage = switchedOff
    ? t('આ એકાઉન્ટ બંધ કરવામાં આવ્યું છે. કૃપા કરીને સમાજના સ્વયંસેવકને ફોન કરો.', 'This account is switched off. Please call a samaj volunteer.')
    : serverError?.code === 'forbidden'
      ? t('મોબાઇલ નંબર અને પાસવર્ડ મેળ ખાતા નથી.', 'That mobile number and password do not match.')
      : serverError?.message ?? '';

  const error = localError
    ?? (serverError
      ? { field: switchedOff ? 'password' : (serverError.detail[0] as Field | undefined) ?? 'password', message: serverMessage }
      : null);

  const fail = (field: Field, message: string) => {
    setLocalError({ field, message });
    setShake((n) => n + 1);
    (field === 'phone' ? phoneRef : passwordRef).current?.focus();
  };

  const invalid = (field: Field) => (error?.field === field ? ' invalid' : '');

  return (
    <form
      className="auth"
      noValidate
      action={submit}
      onSubmit={(event) => {
        if (!phoneOk) {
          event.preventDefault();
          return fail('phone', t('દસ અંકનો મોબાઇલ નંબર લખો.', 'Enter a ten-digit mobile number.'));
        }
        if (!password) {
          event.preventDefault();
          return fail('password', t('પાસવર્ડ લખો.', 'Enter your password.'));
        }
        setLocalError(null);
      }}
    >
      <div className="auth-top">
        <Link className="round-button" href="/" aria-label={t('પાછળ', 'Back')}>
          <ArrowLeft size={20} />
        </Link>
        <span className="auth-top-fill" />
      </div>

      <div className="auth-step from-next">
        <span className="auth-badge"><LogIn size={26} /></span>
        <h1>{t('ફરી સ્વાગત છે', 'Welcome back')}</h1>
        <p className="auth-lead">{t('જે નંબરથી નોંધણી કરી હતી, એ જ નંબર લખો.', 'Use the number you registered with.')}</p>
      </div>

      {/* The shake alternates between two class names to replay, because
          remounting would drop focus. */}
      <div className={`auth-fields${shake ? ` shake${shake % 2 ? '' : ' again'}` : ''}`}>
        <div className="auth-field">
          <label className="auth-label" htmlFor="phone">{t('મોબાઇલ નંબર', 'Mobile number')}</label>
          <div className={`auth-phone${invalid('phone')}${phoneOk ? ' valid' : ''}`}>
            <span>+91</span>
            <input
              ref={phoneRef}
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              enterKeyHint="next"
              maxLength={14}
              placeholder="98765 43210"
              value={phone}
              onChange={(event) => { setPhone(event.target.value); setLocalError(null); }}
              aria-invalid={error?.field === 'phone'}
            />
            <i className="auth-tick" aria-hidden="true"><Check size={16} strokeWidth={3} /></i>
          </div>

          <label className="auth-label spaced" htmlFor="password">{t('પાસવર્ડ', 'Password')}</label>
          <div className={`auth-input${invalid('password')}`}>
            <input
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              enterKeyHint="go"
              value={password}
              onChange={(event) => { setPassword(event.target.value); setLocalError(null); }}
              aria-invalid={error?.field === 'password'}
            />
            <button
              type="button"
              className="auth-eye"
              aria-label={showPassword ? t('પાસવર્ડ છુપાવો', 'Hide password') : t('પાસવર્ડ બતાવો', 'Show password')}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="auth-error">
            <CircleHelp size={18} />
            <span>{error.message}</span>
          </p>
        )}
      </div>

      <div className="auth-actions">
        <button className={`cta${done ? ' done' : ''}`} type="submit" disabled={pending || done}>
          {done ? (
            <Check size={24} strokeWidth={3} className="cta-check" />
          ) : pending ? (
            <><span className="cta-spinner" aria-hidden="true" />{t('રાહ જુઓ…', 'One moment…')}</>
          ) : (
            <>{t('લૉગ ઇન કરો', 'Log in')}<ArrowRight size={20} /></>
          )}
        </button>

        <p className="auth-switch">
          {t('નવા છો?', 'New here?')} <Link href="/register">{t('નોંધણી કરો', 'Register')}</Link>
        </p>

        <p className="auth-note muted">
          {t(
            'પાસવર્ડ ભૂલી ગયા? સમાજના સ્વયંસેવકનો સંપર્ક કરો.',
            'Forgot your password? Call a samaj volunteer.',
          )}{' '}
          <Link href="/support">{t('કોને ફોન કરવો', 'Who to call')}</Link>
        </p>
      </div>
    </form>
  );
}
