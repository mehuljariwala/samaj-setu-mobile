import { redirect } from 'next/navigation';
import { LockKeyhole, ShieldCheck } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { AuthForm } from '@/components/app/auth-form';
import { loadPublicPage, homeFor } from '@/lib/data/guards';
import { translator } from '@/lib/i18n';

export default async function SignInPage() {
  const { context, lang } = await loadPublicPage();
  if (context.access_state !== 'signed_out') redirect(homeFor(context));

  const t = translator(lang);

  return (
    <AppShell lang={lang} context={context}>
      <section className="screen-pad">
        <div className="page-title">
          <span className="eyebrow">
            <ShieldCheck size={13} />
            {t('પાછા આવવા બદલ આભાર', 'Welcome back')}
          </span>
          <h1>{t('તમારા ખાતામાં આવો.', 'Sign in to your account.')}</h1>
          <p>{t('એ જ મોબાઇલ નંબર જેનાથી તમે નોંધણી કરી હતી.', 'The same mobile number you registered with.')}</p>
        </div>

        <AuthForm lang={lang} mode="sign-in" />

        <div className="note">
          <LockKeyhole size={19} />
          <p>
            {t(
              'પાસવર્ડ ભૂલી ગયા હો તો સમાજના એડમિનનો સંપર્ક કરો. કોઈ OTP મોકલાતો નથી.',
              'If you have forgotten your password, contact a community admin. No OTP is sent.',
            )}
          </p>
        </div>
      </section>
    </AppShell>
  );
}
