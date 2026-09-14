'use client';

import { useState, useTransition } from 'react';
import { Check, CircleHelp, X } from 'lucide-react';

import { decideMediaAccessAction, respondToInterestAction } from '@/app/actions/matching';
import type { ActionResult } from '@/lib/data/errors';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  const run = (work: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      const result = await work();
      setError(result.ok ? '' : result.message);
    });

  return { pending, error, run };
}

/**
 * Spec §8: "Explain what accepting reveals before confirmation." The confirm
 * text is the explanation — accepting releases contact details to the other
 * family, and there is no undo that can recall what they have already read.
 */
export function InterestReply({ lang, interestId }: { lang: Lang; interestId: string }) {
  const t = translator(lang);
  const { pending, error, run } = useAction();

  return (
    <>
      <div className="admin-actions">
        <button
          className="primary"
          disabled={pending}
          onClick={() => {
            if (!confirm(t(
              'સ્વીકારવાથી બંને પરિવારોને એકબીજાના સંપર્ક નંબર દેખાશે. એક વાર જોઈ લીધા પછી એ પાછા લઈ શકાતા નથી. આગળ વધવું?',
              'Accepting shows both families each other’s contact numbers. Once seen, they cannot be taken back. Continue?',
            ))) return;
            run(async () => respondToInterestAction(interestId, true));
          }}
        >
          <Check size={19} />
          {t('સ્વીકારો', 'Accept')}
        </button>
        <button
          className="secondary"
          disabled={pending}
          onClick={() => run(async () => respondToInterestAction(interestId, false))}
        >
          <X size={16} />
          {t('નમ્રતાથી ના પાડો', 'Politely decline')}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          <CircleHelp size={17} />
          {error}
        </p>
      )}
    </>
  );
}

/**
 * A photo request is viewer-specific and separate from contact consent, so it
 * gets its own yes/no rather than riding on an introduction (spec §8).
 */
export function PhotoRequestReply({ lang, requestId }: { lang: Lang; requestId: string }) {
  const t = translator(lang);
  const { pending, error, run } = useAction();

  return (
    <>
      <div className="admin-actions">
        <button
          className="primary"
          disabled={pending}
          onClick={() => run(async () => decideMediaAccessAction(requestId, true))}
        >
          <Check size={19} />
          {t('ફોટો બતાવો', 'Allow photos')}
        </button>
        <button
          className="secondary"
          disabled={pending}
          onClick={() => run(async () => decideMediaAccessAction(requestId, false))}
        >
          <X size={16} />
          {t('ના પાડો', 'Decline')}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          <CircleHelp size={17} />
          {error}
        </p>
      )}
    </>
  );
}
