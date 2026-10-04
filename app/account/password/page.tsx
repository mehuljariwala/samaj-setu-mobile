import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { ChangePasswordForm } from '@/components/app/change-password-form';
import { homeFor, loadApplicantPage } from '@/lib/data/guards';
import { translator } from '@/lib/i18n';

/**
 * Changing your own password, for anyone signed in — a family, an applicant
 * still waiting, or an admin. There is no SMS to reset a forgotten one, so
 * that stays a call to a volunteer; this is for choosing your own once you
 * are in, including after a volunteer has sent you one on WhatsApp.
 */
export default async function ChangePasswordPage() {
  const { context, lang } = await loadApplicantPage();
  const t = translator(lang);
  const home = homeFor(context);

  return (
    <AppShell lang={lang} context={context}>
      <section className="auth-screen password-screen">
        <div className="auth-top">
          <Link className="round-button" href={home} aria-label={t('પાછળ', 'Back')}>
            <ArrowLeft size={20} />
          </Link>
        </div>
        <div className="auth-step">
          <span className="auth-badge"><KeyRound size={26} /></span>
          <h1>{t('પાસવર્ડ બદલો', 'Change your password')}</h1>
          <p className="auth-lead">
            {t(
              'હાલનો પાસવર્ડ લખો, પછી નવો બે વાર. બીજા ફોન પરથી આપોઆપ લૉગ આઉટ થઈ જશે.',
              'Enter your current password, then the new one twice. Any other phones will be signed out.',
            )}
          </p>
        </div>
        <ChangePasswordForm lang={lang} home={home} />
      </section>
    </AppShell>
  );
}
