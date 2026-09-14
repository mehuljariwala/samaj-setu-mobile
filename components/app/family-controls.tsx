'use client';

import { useState, useTransition } from 'react';
import { Check, CircleHelp, Copy, Link2, Pause, Play, Sparkles } from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  grantConsentAction, setCandidateSwitchesAction, setPrivacyAction, withdrawConsentAction,
} from '@/app/actions/biodata';
import { createShareLinkAction } from '@/app/actions/matching';
import { setActingCandidateAction } from '@/app/actions/prefs';
import type { ActionResult } from '@/lib/data/errors';
import type { Enums } from '@/lib/supabase/database.types';
import type { CandidateSummary } from '@/lib/data/session';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

type Privacy = {
  photo_visibility: Enums<'media_visibility'>;
  kundali_visibility: Enums<'media_visibility'>;
  reveal_contact_on_accept: boolean;
};

export function SwitchCandidate({
  lang,
  candidateId,
  active,
}: {
  lang: Lang;
  candidateId: string;
  active: boolean;
}) {
  const t = translator(lang);
  const [pending, start] = useTransition();

  if (active) {
    return <span className="badge approved">{t('પસંદ કરેલ', 'Selected')}</span>;
  }

  return (
    <button
      className="text-button"
      disabled={pending}
      onClick={() => start(async () => { await setActingCandidateAction(candidateId); })}
    >
      {t('આના માટે કામ કરો', 'Act for this candidate')}
    </button>
  );
}

/**
 * Publication consent.
 *
 * Spec §4: only the candidate's own account may grant it, and a guardian may
 * not stand in. Withdrawal is deliberately wider — any operator may take a
 * profile down, because the risk of a wrongly published profile outweighs the
 * inconvenience of a wrongly withdrawn one.
 */
export function ConsentControl({
  lang,
  candidate,
}: {
  lang: Lang;
  candidate: CandidateSummary;
}) {
  const t = translator(lang);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  const run = (work: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      const result = await work();
      setError(result.ok ? '' : result.message);
    });

  if (candidate.consent_active) {
    return (
      <>
        <div className="note brand">
          <Check size={19} />
          <p>{t('પ્રકાશન સંમતિ સક્રિય છે.', 'Publication consent is active.')}</p>
        </div>
        <button
          className="text-button muted center"
          disabled={pending}
          onClick={() => {
            if (!confirm(t(
              'સંમતિ પાછી ખેંચવાથી પ્રોફાઇલ તરત જ ડિરેક્ટરીમાંથી હટી જશે. આગળ વધવું?',
              'Withdrawing consent removes this profile from the directory immediately. Continue?',
            ))) return;
            run(async () => withdrawConsentAction(candidate.id));
          }}
        >
          {t('સંમતિ પાછી ખેંચો', 'Withdraw consent')}
        </button>
        {error && <p role="alert" className="error"><CircleHelp size={17} />{error}</p>}
      </>
    );
  }

  if (!candidate.is_self) {
    return (
      <div className="note">
        <CircleHelp size={19} />
        <p>
          {t(
            'ઉમેદવાર પોતાના ખાતામાંથી જ પ્રકાશન સંમતિ આપી શકે છે. વાલી તેમના વતી સંમતિ આપી શકતા નથી.',
            'Only the candidate can give publication consent, from their own account. A guardian cannot give it on their behalf.',
          )}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="note">
        <Sparkles size={19} />
        <p>
          {t(
            'સંમતિ આપ્યા પછી તમારી મંજૂર થયેલી પ્રોફાઇલ ચકાસાયેલા સભ્યોને દેખાશે. તમે ગમે ત્યારે પાછી ખેંચી શકો છો.',
            'Once you consent, your approved profile becomes visible to verified members. You can withdraw at any time.',
          )}
        </p>
      </div>
      <button
        className="primary"
        disabled={pending}
        onClick={() => run(async () => grantConsentAction(candidate.id))}
      >
        {t('હું પ્રકાશન માટે સંમતિ આપું છું', 'I consent to publication')}
        <Check size={18} />
      </button>
      {error && <p role="alert" className="error"><CircleHelp size={17} />{error}</p>}
    </>
  );
}

/** Spec §5: pause takes effect immediately, with no review in between. */
export function PauseControl({ lang, candidate }: { lang: Lang; candidate: CandidateSummary }) {
  const t = translator(lang);
  const [pending, start] = useTransition();

  return (
    <button
      className="secondary"
      disabled={pending}
      onClick={() => start(async () => {
        await setCandidateSwitchesAction(candidate.id, { paused: !candidate.paused });
      })}
    >
      {candidate.paused ? <Play size={17} /> : <Pause size={17} />}
      {candidate.paused
        ? t('પ્રોફાઇલ ફરી શરૂ કરો', 'Resume this profile')
        : t('પ્રોફાઇલ થોભાવો', 'Pause this profile')}
    </button>
  );
}

/**
 * Spec §8: photographs, janmakshar and contact are three separate permissions.
 * They are three separate controls here for the same reason — widening one must
 * never look like widening the others.
 */
export function PrivacyControls({
  lang,
  candidateId,
  privacy,
}: {
  lang: Lang;
  candidateId: string;
  privacy: Privacy;
}) {
  const t = translator(lang);
  const [pending, start] = useTransition();

  const options: [Enums<'media_visibility'>, string][] = [
    ['private', t('કોઈને નહીં', 'Nobody')],
    ['on_request', t('મંજૂરી માગે તેને', 'Only people I approve')],
    ['members', t('બધા ચકાસાયેલા સભ્યોને', 'All verified members')],
  ];

  const set = (patch: Partial<Privacy>) =>
    start(async () => { await setPrivacyAction(candidateId, patch); });

  return (
    <>
      <label className="field-label">{t('ફોટા કોણ જોઈ શકે?', 'Who can see photographs?')}</label>
      <Select
        value={privacy.photo_visibility}
        onValueChange={(value) => value && set({ photo_visibility: value as Enums<'media_visibility'> })}
      >
        <SelectTrigger className="field-select" disabled={pending}>
          <SelectValue>{options.find(([value]) => value === privacy.photo_visibility)?.[1]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(([value, label]) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="field-label">{t('જન્માક્ષર કોણ જોઈ શકે?', 'Who can see the janmakshar?')}</label>
      <Select
        value={privacy.kundali_visibility}
        onValueChange={(value) => value && set({ kundali_visibility: value as Enums<'media_visibility'> })}
      >
        <SelectTrigger className="field-select" disabled={pending}>
          <SelectValue>{options.find(([value]) => value === privacy.kundali_visibility)?.[1]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(([value, label]) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="compact-check">
        <Switch
          checked={privacy.reveal_contact_on_accept}
          disabled={pending}
          onCheckedChange={(value) => set({ reveal_contact_on_accept: Boolean(value) })}
        />
        <span>
          {t('સ્વીકાર પછી સંપર્ક નંબર બતાવો', 'Share contact numbers after accepting')}
          <small>
            {t(
              'બંધ રાખશો તો પરિચય સ્વીકારાયા પછી પણ નંબર દેખાશે નહીં.',
              'With this off, numbers stay hidden even after an introduction is accepted.',
            )}
          </small>
        </span>
      </label>
    </>
  );
}

/**
 * Spec §9: the token comes back exactly once and only its hash is stored, so
 * there is no "show it again" — copying it now is the only chance.
 */
export function ShareLinkControl({ lang, candidateId }: { lang: Lang; candidateId: string }) {
  const t = translator(lang);
  const [pending, start] = useTransition();
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  if (link) {
    return (
      <>
        <div className="note brand">
          <Link2 size={19} />
          <p>
            {t(
              'આ લિંક એક જ વાર દેખાય છે. મેળવનારે લૉગ ઇન કરવું પડશે અને મંજૂર સભ્ય હોવું પડશે.',
              'This link is shown once. Whoever receives it must sign in and be an approved member.',
            )}
          </p>
        </div>
        <input className="field" readOnly value={link} onFocus={(event) => event.target.select()} />
        <button
          className="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(link).then(() => setCopied(true));
          }}
        >
          <Copy size={17} />
          {copied ? t('કૉપી થયું', 'Copied') : t('લિંક કૉપી કરો', 'Copy link')}
        </button>
      </>
    );
  }

  return (
    <>
      <button
        className="secondary"
        disabled={pending}
        onClick={() => start(async () => {
          const result = await createShareLinkAction(candidateId);
          if (result.ok) {
            setLink(`${window.location.origin}/s/${result.data.token}`);
            setError('');
          } else {
            setError(result.message);
          }
        })}
      >
        <Link2 size={17} />
        {t('સુરક્ષિત લિંક બનાવો', 'Create a protected link')}
      </button>
      {error && <p role="alert" className="error"><CircleHelp size={17} />{error}</p>}
    </>
  );
}
