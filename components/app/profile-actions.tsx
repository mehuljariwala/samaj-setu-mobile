'use client';

import { useState, useTransition } from 'react';
import {
  ArrowRight, Check, CircleCheck, CircleHelp, Eye, HeartHandshake, LockKeyhole, Send, Undo2,
} from 'lucide-react';

import {
  blockCandidateAction, requestMediaAccessAction, sendInterestAction, withdrawInterestAction,
} from '@/app/actions/matching';
import type { ActionResult } from '@/lib/data/errors';
import type { ProfileDetail } from '@/lib/data/discovery';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

type Props = {
  lang: Lang;
  actingId: string;
  /** False while this candidate is unpublished or paused — spec §2. */
  canSendInterest: boolean;
  profile: ProfileDetail;
};

/**
 * Everything a member can do to another profile. All of it is refused by the
 * database as well: eligibility, publication state and grants are re-checked
 * inside each RPC, so a disabled button here is a courtesy rather than the
 * control.
 */
export function ProfileActions({ lang, actingId, canSendInterest, profile }: Props) {
  const t = translator(lang);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');

  const interest = profile.interest ?? null;
  const photos = profile.photos;

  /** Clears the previous error on success, shows the new one on failure. */
  function run(work: () => Promise<ActionResult<unknown>>) {
    start(async () => {
      const result = await work();
      setNote(result.ok ? '' : result.message);
    });
  }

  return (
    <>
      {/* ------------------------------------------------------- photographs */}
      {photos && !photos.can_view && (
        photos.request_status === 'pending' ? (
          <p className="field-hint inline-icon">
            <CircleHelp size={12} />
            {t('ફોટો વિનંતી બાકી છે.', 'Your photo request is awaiting a decision.')}
          </p>
        ) : photos.request_status === 'declined' ? (
          <p className="field-hint inline-icon">
            <LockKeyhole size={12} />
            {t('ફોટો વિનંતી નામંજૂર થઈ છે.', 'The photo request was declined.')}
          </p>
        ) : (
          <button
            className="secondary"
            disabled={pending}
            onClick={() => run(async () =>
              requestMediaAccessAction(actingId, profile.id!, 'photo'))}
          >
            <Eye size={17} />
            {t('ફોટો જોવાની વિનંતી', 'Request photo access')}
          </button>
        )
      )}

      {/* ---------------------------------------------------------- interest */}
      {interest?.status === 'accepted' ? (
        <div className="note brand">
          <CircleCheck size={19} />
          <p>{t('પરિચય સ્વીકારાયો છે. સંપર્ક નીચે દેખાય છે.', 'This introduction was accepted. Contact details are shown below.')}</p>
        </div>
      ) : interest?.status === 'pending' && interest.outgoing ? (
        <>
          <div className="note">
            <Send size={19} />
            <p>{t('તમારો પરિચય મોકલાયો છે. જવાબની રાહ જુઓ.', 'Your introduction has been sent. Waiting for a reply.')}</p>
          </div>
          <button
            className="text-button muted center"
            disabled={pending}
            onClick={() => run(async () => withdrawInterestAction(interest.id))}
          >
            <Undo2 size={15} />
            {t('પરિચય પાછો ખેંચો', 'Withdraw this introduction')}
          </button>
        </>
      ) : interest?.status === 'pending' ? (
        <div className="note brand">
          <HeartHandshake size={19} />
          <p>{t('આ પરિવારે તમને પરિચય મોકલ્યો છે. “રસ” ટૅબમાં જવાબ આપો.', 'This family has sent you an introduction. Reply from the Interests tab.')}</p>
        </div>
      ) : interest?.status === 'declined' ? (
        <div className="note">
          <LockKeyhole size={19} />
          <p>{t('આ પરિચય નામંજૂર થયો હતો.', 'This introduction was declined.')}</p>
        </div>
      ) : profile.verdict === 'insufficient_information' ? (
        // Spec §7: unknown information is not permission. Browsing is fine;
        // acting on it is not, and the reason is said out loud.
        <div className="note">
          <CircleHelp size={19} />
          <p>
            {t(
              'સમાજના નિયમો ચકાસવા માટે મોસાળ સહિતની વિગતો પુષ્ટિ કરવી જરૂરી છે. ત્યાં સુધી પરિચય મોકલી શકાશે નહીં.',
              'The mosal and related details must be confirmed before the community rules can be checked. Until then an introduction cannot be sent.',
            )}
          </p>
        </div>
      ) : !canSendInterest ? (
        <div className="note">
          <LockKeyhole size={19} />
          <p>{t('પરિચય મોકલવા માટે તમારો બાયોડેટા મંજૂર અને સંમતિ સક્રિય હોવી જરૂરી છે.', 'Your biodata must be approved and consent active before you can send an introduction.')}</p>
        </div>
      ) : (
        <>
          <label className="field-label" htmlFor="interest-message">
            {t('સંદેશ (વૈકલ્પિક)', 'A short message (optional)')}
          </label>
          <textarea
            id="interest-message"
            className="field textarea"
            rows={3}
            maxLength={300}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t('બે વાક્યમાં પરિચય…', 'A line or two about your family…')}
          />
          <button
            className="primary"
            disabled={pending}
            onClick={() => run(async () =>
              sendInterestAction(actingId, profile.id!, message))}
          >
            {pending ? t('મોકલી રહ્યા છીએ…', 'Sending…') : t('પરિચય મોકલો', 'Send introduction')}
            <ArrowRight size={18} />
          </button>
          <p className="field-hint inline-icon">
            <LockKeyhole size={12} />
            {t(
              'સ્વીકાર થયા પછી જ બંને પરિવારોને એકબીજાના સંપર્ક દેખાશે.',
              'Contact details are shown to both families only after this is accepted.',
            )}
          </p>
        </>
      )}

      {note && (
        <p role="alert" className="error">
          <CircleHelp size={17} />
          {note}
        </p>
      )}

      {/* Blocking is symmetric: neither side appears to the other afterwards,
          so the absence of a profile is never itself a message. */}
      <button
        className="text-button muted center"
        disabled={pending}
        onClick={() => {
          if (!confirm(t(
            'આ પ્રોફાઇલ બ્લૉક કરવી છે? બંને એકબીજાને દેખાશે નહીં.',
            'Block this profile? Neither of you will appear to the other.',
          ))) return;
          run(async () => blockCandidateAction(actingId, profile.id!));
        }}
      >
        <Check size={15} />
        {t('આ પ્રોફાઇલ બ્લૉક કરો', 'Block this profile')}
      </button>
    </>
  );
}
