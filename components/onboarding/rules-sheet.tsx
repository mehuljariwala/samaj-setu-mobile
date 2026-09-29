'use client';

import { useRef, useState } from 'react';
import { ArrowRight, Check, ScrollText, X } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';
import { DISCLAIMER, DISCLAIMER_TITLE, NON_COMMERCIAL, RULES, RULES_INTRO, RULES_TITLE } from '@/lib/rules';

/**
 * The bureau's rules, as a sheet that rises over the account screen when
 * "Create account" is pressed. Nothing is created until the box is ticked and
 * the button inside the sheet is pressed; closing the sheet leaves the form as
 * it was.
 *
 * A native <dialog>, so focus is trapped, Escape closes it and the page behind
 * is inert without any code of ours.
 */
export function RulesSheet({
  lang,
  dialogRef,
  onAgree,
}: {
  lang: Lang;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  onAgree: () => void;
}) {
  const t = translator(lang);
  const [agreed, setAgreed] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const close = () => dialogRef.current?.close();

  // "Read to the end" is shown, not enforced: the tick box is what counts,
  // but the hint nudges anyone who ticks without scrolling.
  const onScroll = () => {
    const body = bodyRef.current;
    if (body && body.scrollTop + body.clientHeight >= body.scrollHeight - 24) setAtEnd(true);
  };

  return (
    <dialog
      ref={dialogRef}
      className="rules-sheet"
      aria-labelledby="rules-title"
      // Focus lands on the sheet itself when it opens, not on the close
      // button, which would otherwise open with a focus ring on it.
      tabIndex={-1}
    >
      <div className="rules-panel">
        <div className="rules-head">
          <span className="rules-badge"><ScrollText size={22} /></span>
          <div>
            <h2 id="rules-title">{t('મેરેજ બ્યુરોના નિયમો', 'Marriage bureau rules')}</h2>
            <p>{t('ખાતું બનાવતા પહેલાં ધ્યાનથી વાંચો', 'Please read before creating your account')}</p>
          </div>
          <button type="button" className="rules-close" aria-label={t('બંધ કરો', 'Close')} onClick={close}>
            <X size={20} />
          </button>
        </div>

        <div ref={bodyRef} className="rules-body" onScroll={onScroll} lang="gu">
          <p className="rules-lead">{RULES_TITLE}</p>
          <p className="rules-intro">{RULES_INTRO}</p>
          <ol className="rules-list">
            {RULES.map((rule, i) => (
              <li key={i}><span>{i + 1}</span><p>{rule}</p></li>
            ))}
          </ol>

          <h3 className="rules-section">{DISCLAIMER_TITLE}</h3>
          <p className="rules-intro">{NON_COMMERCIAL}</p>
          <ol className="rules-list">
            {DISCLAIMER.map((point, i) => (
              <li key={i}><span>{i + 1}</span><p>{point}</p></li>
            ))}
          </ol>
        </div>

        <div className="rules-foot">
          <label className={`rules-agree${agreed ? ' on' : ''}`}>
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
            <span className="rules-box" aria-hidden="true"><Check size={15} strokeWidth={3.2} /></span>
            <span>
              {t(
                'મેં ઉપરના તમામ નિયમો અને કાનૂની સ્પષ્ટતા વાંચ્યા છે અને હું તેની સાથે સંમત છું.',
                'I have read all the rules and the disclaimer above and I agree to them.',
              )}
            </span>
          </label>
          {agreed && !atEnd && (
            <p className="rules-hint">{t('બધા નિયમો અને કાનૂની સ્પષ્ટતા નીચે સુધી વાંચી લેજો.', 'Do scroll down and read all the rules and the disclaimer.')}</p>
          )}
          <button
            type="button"
            className="cta"
            disabled={!agreed}
            onClick={() => { close(); onAgree(); }}
          >
            {t('સંમત છું, ખાતું બનાવો', 'I agree, create account')}
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </dialog>
  );
}
