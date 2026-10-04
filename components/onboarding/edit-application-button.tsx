'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CircleHelp, Pencil } from 'lucide-react';

import { editRegistrationAction } from '@/app/actions/registration';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * For the family that realises after sending that something should be
 * different, most often the certificate. Taking the application back costs
 * them their place in the queue, so the button asks once before it does.
 */
export function EditApplicationButton({ lang, applicationId }: { lang: Lang; applicationId: string }) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);

  const edit = () => start(async () => {
    setFailed(false);
    const result = await editRegistrationAction(applicationId);
    if (result.ok) {
      router.push('/register');
      return;
    }
    // Most likely an admin decided in the meantime; the page then shows that.
    setFailed(true);
    router.refresh();
  });

  if (!asking) {
    return (
      <button className="secondary" type="button" onClick={() => setAsking(true)}>
        <Pencil size={16} />
        {t('અરજીમાં ફેરફાર કરો', 'Change the application')}
      </button>
    );
  }

  return (
    <div className="review-confirm">
      <p className="review-note">
        <Pencil size={18} />
        {t(
          'ફેરફાર કરો ત્યાં સુધી અરજી સમીક્ષામાંથી બહાર રહેશે. ફરી મોકલશો ત્યારે 24 કલાકની રાહ ફરીથી શરૂ થશે.',
          'Your application leaves the review queue while you change it. When you send it again, the 24-hour wait starts again.',
        )}
      </p>
      {failed && (
        <p role="alert" className="auth-error">
          <CircleHelp size={18} />
          <span>{t('અરજી ખોલી શકાઈ નથી. ફરી પ્રયાસ કરો.', 'The application could not be opened. Please try again.')}</span>
        </p>
      )}
      <button className="cta" type="button" disabled={pending} onClick={edit}>
        {pending ? (
          <><span className="cta-spinner" aria-hidden="true" />{t('ખોલી રહ્યા છીએ…', 'Opening…')}</>
        ) : (
          <>{t('હા, ફેરફાર કરો', 'Yes, change it')}<ArrowRight size={20} /></>
        )}
      </button>
      <button className="text-button muted" type="button" disabled={pending} onClick={() => setAsking(false)}>
        {t('રહેવા દો, જેમ છે તેમ રાખો', 'Keep it as sent')}
      </button>
    </div>
  );
}
