'use client';

import { useState, useTransition } from 'react';
import { CircleHelp, Copy, Link2, Pause, Play } from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { setCandidateSwitchesAction, setPrivacyAction } from '@/app/actions/biodata';
import { createShareLinkAction } from '@/app/actions/matching';
import { setActingCandidateAction } from '@/app/actions/prefs';
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
