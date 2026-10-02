'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CircleHelp } from 'lucide-react';

import { reopenRegistrationAction } from '@/app/actions/registration';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * The way forward from a rejection: reopen the same application and go
 * straight to the form, which shows the admin's reason above the fields.
 * Nothing is sent until the family presses send on the form itself.
 */
export function ReopenButton({ lang, applicationId }: { lang: Lang; applicationId: string }) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const reopen = () => start(async () => {
    setFailed(false);
    const result = await reopenRegistrationAction(applicationId);
    if (result.ok) {
      router.push('/register');
      return;
    }
    // Another family member may have reopened it already; the page then
    // shows whatever state it is really in.
    setFailed(true);
    router.refresh();
  });

  return (
    <>
      {failed && (
        <p role="alert" className="auth-error">
          <CircleHelp size={18} />
          <span>{t('અરજી ફરી ખોલી શકાઈ નથી. ફરી પ્રયાસ કરો.', 'The application could not be reopened. Please try again.')}</span>
        </p>
      )}
      <button className="cta" type="button" disabled={pending} onClick={reopen}>
        {pending ? (
          <><span className="cta-spinner" aria-hidden="true" />{t('ખોલી રહ્યા છીએ…', 'Opening…')}</>
        ) : (
          <>{t('સુધારીને ફરી મોકલો', 'Fix and send again')}<ArrowRight size={20} /></>
        )}
      </button>
    </>
  );
}
