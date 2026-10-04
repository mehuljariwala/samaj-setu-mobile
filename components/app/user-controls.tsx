'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Ban, Check, CircleCheck, CircleHelp, CirclePause, Copy, KeyRound, MessageCircle, RefreshCw, Send,
} from 'lucide-react';

import { resetPasswordAction, setAccountStatusAction } from '@/app/actions/users';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

type Status = 'active' | 'disabled' | 'blocked';

/**
 * The two things an admin does to an account from /admin/users/[id].
 *
 *   * Access: enable, disable (reason optional) or block (reason required).
 *     Switching off ends every open session at once and hides the account's
 *     profiles from Discover.
 *   * Password: for a member who forgot theirs and called in. The admin types
 *     one or generates one, the member is signed out everywhere, and the new
 *     password is shown once with a WhatsApp button to send it on.
 */
export function UserControls({
  lang,
  accountId,
  phone,
  name,
  status,
}: {
  lang: Lang;
  accountId: string;
  phone: string;
  name: string | null;
  status: string;
}) {
  const t = translator(lang);
  const router = useRouter();
  const current: Status = status === 'blocked' ? 'blocked' : status === 'active' ? 'active' : 'disabled';

  /* ---------------------------------------------------------- access --- */
  const [choice, setChoice] = useState<Status | null>(null);
  const [reason, setReason] = useState('');
  const [statusError, setStatusError] = useState('');
  const [savingStatus, startStatus] = useTransition();

  const choices: { key: Status; tone: string; Icon: typeof Check; title: string; body: string }[] = [
    {
      key: 'active', tone: 'ok', Icon: CircleCheck,
      title: t('ચાલુ', 'Enable'),
      body: t('લૉગ ઇન કરી શકે, પ્રોફાઇલ ફરી દેખાય.', 'They can sign in; their profiles show again.'),
    },
    {
      key: 'disabled', tone: 'warn', Icon: CirclePause,
      title: t('બંધ કરો', 'Disable'),
      body: t('હાલ પૂરતું બંધ — વિરામ, નંબર બદલાયો. કારણ વૈકલ્પિક.', 'Off for now — a break, a changed number. Reason optional.'),
    },
    {
      key: 'blocked', tone: 'bad', Icon: Ban,
      title: t('બ્લૉક કરો', 'Block'),
      body: t('ખોટા ઉપયોગ માટે. કારણ લખવું જરૂરી.', 'For misuse. A reason is required.'),
    },
  ];

  const statusReady = choice !== null && choice !== current && (choice !== 'blocked' || reason.trim().length > 0);

  function saveStatus() {
    if (!choice) return;
    setStatusError('');
    startStatus(async () => {
      const result = await setAccountStatusAction(accountId, choice, reason.trim() || undefined);
      if (result.ok) {
        setChoice(null);
        setReason('');
        router.refresh();
      } else {
        setStatusError(result.detail[0] === 'reason'
          ? t('બ્લૉક કરવાનું કારણ લખો.', 'Write why the account is being blocked.')
          : result.message);
      }
    });
  }

  /* -------------------------------------------------------- password --- */
  const [password, setPassword] = useState('');
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, startPassword] = useTransition();

  function savePassword() {
    const value = password.trim();
    if (value.length < 8) {
      setPasswordError(t('ઓછામાં ઓછા 8 અક્ષર રાખો.', 'Use at least 8 characters.'));
      return;
    }
    setPasswordError('');
    startPassword(async () => {
      const result = await resetPasswordAction(accountId, value);
      if (result.ok) {
        setIssued(value);
        setPassword('');
        setCopied(false);
        router.refresh();
      } else {
        setPasswordError(result.message);
      }
    });
  }

  const greeting = name ? name.split(' ')[0] : '';
  const message = issued
    ? [
      t(`નમસ્તે${greeting ? ` ${greeting}` : ''},`, `Namaste${greeting ? ` ${greeting}` : ''},`),
      t('તમારા સમાજ સેતુ એકાઉન્ટનો નવો પાસવર્ડ:', 'Your new Samaj Setu password:'),
      '',
      `${t('મોબાઇલ', 'Mobile')}: ${phone}`,
      `${t('પાસવર્ડ', 'Password')}: ${issued}`,
      '',
      t(`અહીં લૉગ ઇન કરો: ${typeof window === 'undefined' ? '' : window.location.origin}/sign-in`,
        `Sign in here: ${typeof window === 'undefined' ? '' : window.location.origin}/sign-in`),
      // So the password a volunteer has seen does not stay theirs for good.
      t(`લૉગ ઇન પછી તમારો પોતાનો પાસવર્ડ અહીં રાખો: ${typeof window === 'undefined' ? '' : window.location.origin}/account/password`,
        `After signing in, set your own password here: ${typeof window === 'undefined' ? '' : window.location.origin}/account/password`),
      t('આ પાસવર્ડ કોઈને જણાવશો નહીં.', 'Please keep this password private.'),
    ].join('\n')
    : '';

  return (
    <>
      <h2 className="admin-h2">{t('એકાઉન્ટ ઍક્સેસ', 'Account access')}</h2>
      <div className="decide-choices" role="radiogroup" aria-label={t('એકાઉન્ટ ઍક્સેસ', 'Account access')}>
        {choices.map(({ key, tone, Icon, title, body }) => {
          const isCurrent = key === current;
          const on = choice === key || (choice === null && isCurrent);
          return (
            <label key={key} className={`decide-choice ${tone}${on ? ' on' : ''}`}>
              <input
                type="radio"
                name="account-status"
                value={key}
                checked={on}
                disabled={savingStatus}
                onChange={() => { setChoice(isCurrent ? null : key); setStatusError(''); }}
              />
              <span className="decide-icon"><Icon size={20} /></span>
              <span>
                <b>{title}{isCurrent && <em className="user-now">{t('હાલ', 'Now')}</em>}</b>
                <small>{body}</small>
              </span>
              <i className="decide-radio" aria-hidden="true"><Check size={13} strokeWidth={3.5} /></i>
            </label>
          );
        })}
      </div>

      {choice && choice !== current && (
        <div className="decide-form" key={choice}>
          {choice !== 'active' && (
            <>
              <label className="auth-label" htmlFor="status-reason">
                {t('કારણ', 'Reason')}{' '}
                <small>
                  {choice === 'blocked' ? t('· જરૂરી', '· required') : t('· વૈકલ્પિક', '· optional')}
                  {t(' · ફક્ત એડમિનને દેખાશે', ' · seen by admins only')}
                </small>
              </label>
              <textarea
                id="status-reason"
                className="decide-text"
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={choice === 'blocked'
                  ? t('દા.ત. બે પરિવારોએ ખોટી પ્રોફાઇલની ફરિયાદ કરી', 'e.g. Two families reported a fake profile')
                  : t('દા.ત. પરિવારે વિરામ માંગ્યો', 'e.g. The family asked for a break')}
              />
              <p className="auth-hint">
                <CircleHelp size={15} />
                {t('તરત જ લૉગ આઉટ થશે અને પ્રોફાઇલ શોધમાં દેખાશે નહીં.', 'They are signed out at once and their profiles leave Discover.')}
              </p>
            </>
          )}

          {statusError && <p role="alert" className="auth-error"><CircleHelp size={18} /><span>{statusError}</span></p>}

          <button
            type="button"
            className={`cta decide-submit ${choice === 'active' ? 'approve' : choice === 'blocked' ? 'reject' : 'request_correction'}`}
            disabled={!statusReady || savingStatus}
            onClick={saveStatus}
          >
            {savingStatus ? (
              <><span className="cta-spinner" aria-hidden="true" />{t('સાચવી રહ્યા છીએ…', 'Saving…')}</>
            ) : choice === 'active' ? t('એકાઉન્ટ ચાલુ કરો', 'Enable the account')
              : choice === 'blocked' ? t('એકાઉન્ટ બ્લૉક કરો', 'Block the account')
                : t('એકાઉન્ટ બંધ કરો', 'Disable the account')}
          </button>
        </div>
      )}

      <h2 className="admin-h2">{t('પાસવર્ડ રીસેટ', 'Reset password')}</h2>
      <div className="user-reset">
        {issued ? (
          <output className="user-issued">
            <p><CircleCheck size={18} />{t('નવો પાસવર્ડ સેટ થયો. જૂના બધા લૉગ ઇન બંધ થયા.', 'New password set. Every old sign-in has ended.')}</p>
            <div className="user-issued-code">
              <code>{issued}</code>
              <button
                type="button"
                className="round-button"
                aria-label={t('પાસવર્ડ કૉપી કરો', 'Copy password')}
                onClick={() => { void navigator.clipboard.writeText(issued).then(() => setCopied(true)); }}
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <a
              className="cta user-whatsapp"
              href={`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={19} />
              {t('WhatsApp પર મોકલો', 'Send on WhatsApp')}
            </a>
            <small>{t('આ પાસવર્ડ ફરી દેખાશે નહીં — હમણાં જ મોકલો.', 'This password will not be shown again — send it now.')}</small>
            {current !== 'active' && (
              <p className="auth-hint">
                <CircleHelp size={15} />
                {t('એકાઉન્ટ હજી બંધ છે — ઉપરથી ચાલુ કરો, નહીં તો લૉગ ઇન નહીં થાય.', 'The account is still switched off — enable it above or they still cannot sign in.')}
              </p>
            )}
            <button type="button" className="text-button muted" onClick={() => setIssued(null)}>
              {t('બીજો પાસવર્ડ સેટ કરો', 'Set a different password')}
            </button>
          </output>
        ) : (
          <>
            <p className="user-reset-lead">
              <KeyRound size={17} />
              {t('કોઈ પાસવર્ડ ભૂલી જાય અને ફોન કરે ત્યારે: નવો પાસવર્ડ લખો અથવા બનાવો, પછી WhatsApp પર મોકલો.',
                'When someone forgets and calls in: type or generate a new password, then send it on WhatsApp.')}
            </p>
            <label className="auth-label" htmlFor="new-password">{t('નવો પાસવર્ડ', 'New password')}</label>
            <div className={`auth-input user-password${passwordError ? ' invalid' : ''}`}>
              <input
                id="new-password"
                type="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={72}
                value={password}
                onChange={(event) => { setPassword(event.target.value); setPasswordError(''); }}
                placeholder={t('ઓછામાં ઓછા 8 અક્ષર', 'At least 8 characters')}
                aria-invalid={Boolean(passwordError)}
              />
              <button
                type="button"
                className="user-generate"
                onClick={() => { setPassword(generatePassword()); setPasswordError(''); }}
              >
                <RefreshCw size={16} />
                {t('બનાવો', 'Generate')}
              </button>
            </div>
            {passwordError && <p role="alert" className="auth-error"><CircleHelp size={18} /><span>{passwordError}</span></p>}
            <button
              type="button"
              className="cta decide-submit"
              disabled={password.trim().length < 8 || savingPassword}
              onClick={savePassword}
            >
              {savingPassword ? (
                <><span className="cta-spinner" aria-hidden="true" />{t('સાચવી રહ્યા છીએ…', 'Saving…')}</>
              ) : (
                <>{t('પાસવર્ડ સેટ કરો', 'Set password')}<Send size={18} /></>
              )}
            </button>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Easy to read out over the phone: no 0/O, 1/l/I. "Setu-4827-kmvp".
 */
function generatePassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint32Array(8));
  const digits = Array.from(bytes.slice(0, 4), (n) => 2 + (n % 8)).join('');
  const tail = Array.from(bytes.slice(4), (n) => letters[n % letters.length]).join('');
  return `Setu-${digits}-${tail}`;
}
