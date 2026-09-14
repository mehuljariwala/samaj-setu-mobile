import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight, Check, ChevronRight, LockKeyhole, ShieldCheck, Sprout,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { loadPublicPage, homeFor } from '@/lib/data/guards';
import { translator } from '@/lib/i18n';

/**
 * The welcome screen, for a visitor who is not signed in.
 *
 * A signed-in account never sees this: the server already knows its access
 * state, so it is sent to the screen that state owns. The prototype had to do
 * the same thing from localStorage after hydration, which is why it needed a
 * boot script to avoid showing this screen and then yanking it away.
 */
export default async function WelcomePage() {
  const { context, lang } = await loadPublicPage();
  if (context.access_state !== 'signed_out') redirect(homeFor(context));

  const t = translator(lang);

  const steps: [string, string, typeof ShieldCheck][] = [
    [
      t('વિગતો અને પ્રમાણપત્ર આપો', 'Share details & certificate'),
      t('મોબાઇલ, મૂળભૂત વિગતો અને જન્મ પ્રમાણપત્ર', 'Mobile, basic details and birth certificate'),
      ChevronRight,
    ],
    [
      t('એડમિન ઓળખ ચકાસશે', 'An admin verifies you'),
      t('સમીક્ષા માટે 24 કલાક સુધી રાહ જુઓ', 'Allow up to 24 hours for review'),
      ShieldCheck,
    ],
    [
      t('બાયોડેટા અને નવી ઓળખાણ', 'Build biodata & connect'),
      t('તમારી માહિતી, તમારી મંજૂરીથી જ', 'You control what others can see'),
      LockKeyhole,
    ],
  ];

  return (
    <AppShell lang={lang} context={context}>
      <section className="welcome">
        <div className="welcome-hero">
          <div className="welcome-mark">
            <Sprout size={26} strokeWidth={1.8} />
            સમાજ સેતુ
          </div>
          <span className="eyebrow">
            <ShieldCheck size={13} />
            Khatri Kshatriya Samaj
          </span>
          <h1>{t('જીવનસાથીની શોધ, પોતાના સમાજમાં.', 'Find your partner. Within your community.')}</h1>
          <p>{t('પરિવારના વિશ્વાસ અને તમારી ગોપનીયતા સાથે.', 'With your family’s trust and your privacy at heart.')}</p>
        </div>

        <div className="steps-card card">
          {steps.map(([title, detail, Icon], index) => (
            <div key={title}>
              <span className="n">{index + 1}</span>
              <div>
                <b>{title}</b>
                <p>{detail}</p>
              </div>
              <Icon size={17} />
            </div>
          ))}
        </div>

        <Link className="primary" href="/sign-up">
          {t('નોંધણી શરૂ કરો', 'Start your registration')}
          <ArrowRight size={19} />
        </Link>
        <p className="signin">
          {t('પહેલેથી સભ્ય છો?', 'Already a member?')}
          <Link href="/sign-in">{t('લૉગ ઇન કરો', 'Log in')}</Link>
        </p>

        <div className="welcome-foot">
          <Check size={14} />
          {t('સમાજ માટે. હંમેશાં નિઃશુલ્ક.', 'For our community. Always free.')}
        </div>
        <Link className="text-button muted center" href="/support">
          {t('ગોપનીયતા અને મદદ', 'Privacy & help')}
        </Link>
      </section>
    </AppShell>
  );
}
