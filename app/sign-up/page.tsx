import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { AuthForm } from '@/components/app/auth-form';
import { loadPublicPage, homeFor } from '@/lib/data/guards';
import { translator } from '@/lib/i18n';

export default async function SignUpPage() {
  const { context, lang } = await loadPublicPage();
  if (context.access_state !== 'signed_out') redirect(homeFor(context));

  const t = translator(lang);

  return (
    <AppShell lang={lang} context={context}>
      <section className="screen-pad">
        <div className="page-title">
          <span className="eyebrow">
            <ShieldCheck size={13} />
            {t('પગલું 1 · ખાતું', 'Step 1 · Account')}
          </span>
          <h1>{t('તમારું સ્વાગત છે.', 'You belong here.')}</h1>
          <p>{t('પહેલાં તમારું ખાતું — પછી ઉમેદવારની વિગતો.', 'Your account first, then the candidate’s details.')}</p>
        </div>

        <AuthForm lang={lang} mode="sign-up" />

        <div className="note brand">
          <ShieldCheck size={19} />
          <p>
            {t(
              'કોઈ OTP નથી. તમારી ઓળખ જન્મ પ્રમાણપત્રથી એડમિન ચકાસે છે — એ જ આપણી ખરી સુરક્ષા છે. પાસવર્ડ ફક્ત તમારું ખાતું સુરક્ષિત રાખવા માટે છે.',
              'No OTP. An admin verifies you against your birth certificate — that is the real safeguard here. The password only keeps your account yours.',
            )}
          </p>
        </div>
      </section>
    </AppShell>
  );
}
