import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight, Check, ChevronRight, LockKeyhole, LogIn, ShieldCheck,
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
 *
 * The screen is built around one rule: anything that can be tapped looks like a
 * button, and anything that cannot looks like nothing else on the screen. The
 * earlier version broke both halves of it — the three joining steps sat in a
 * card with dividers and a trailing chevron, which is exactly how a menu of
 * links is drawn, while the two real destinations were plain centred text.
 */
export default async function WelcomePage() {
  const { context, lang } = await loadPublicPage();
  if (context.access_state !== 'signed_out') redirect(homeFor(context));

  const t = translator(lang);

  // What the visitor is being promised, in three words each. Icon over label,
  // no chrome — a promise should not be drawn the way a control is drawn.
  const assurances: [typeof ShieldCheck, string][] = [
    [ShieldCheck, t('એડમિન ચકાસણી', 'Admin verified')],
    [LockKeyhole, t('તમારી મંજૂરીથી જ', 'Your consent')],
    [Check, t('હંમેશાં નિઃશુલ્ક', 'Always free')],
  ];

  const steps: [string, string][] = [
    [
      t('વિગતો અને પ્રમાણપત્ર આપો', 'Share details & certificate'),
      t('મોબાઇલ, મૂળભૂત વિગતો અને જન્મ પ્રમાણપત્ર', 'Mobile, basic details and birth certificate'),
    ],
    [
      t('એડમિન ઓળખ ચકાસશે', 'An admin verifies you'),
      t('સમીક્ષા માટે 24 કલાક સુધી રાહ જુઓ', 'Allow up to 24 hours for review'),
    ],
    [
      t('બાયોડેટા અને નવી ઓળખાણ', 'Build biodata & connect'),
      t('તમારી માહિતી, તમારી મંજૂરીથી જ', 'You control what others can see'),
    ],
  ];

  return (
    <AppShell lang={lang} context={context}>
      <section className="welcome">
        {/* The shell's top bar already carries the mark, so the hero leads with
            the samaj it belongs to and the promise it makes. */}
        <div className="welcome-hero">
          <span className="eyebrow">
            <ShieldCheck size={13} />
            Khatri Kshatriya Samaj
          </span>
          <h1>{t('જીવનસાથીની શોધ, પોતાના સમાજમાં.', 'Find your partner. Within your community.')}</h1>
          <p>{t('પરિવારના વિશ્વાસ અને તમારી ગોપનીયતા સાથે.', 'With your family’s trust and your privacy at heart.')}</p>
        </div>

        {/* Both ways in, before anything that can only be read. A returning
            member should not have to scroll past an explainer to log in. */}
        <div className="welcome-actions">
          <Link className="primary" href="/sign-up">
            {t('નોંધણી શરૂ કરો', 'Start your registration')}
            <ArrowRight size={19} />
          </Link>
          <p className="actions-divider">{t('પહેલેથી સભ્ય છો?', 'Already a member?')}</p>
          <Link className="secondary" href="/sign-in">
            <LogIn size={18} />
            {t('લૉગ ઇન કરો', 'Log in')}
          </Link>
        </div>

        <ul className="assurances">
          {assurances.map(([Icon, label]) => (
            <li key={label}>
              <Icon size={18} strokeWidth={1.7} />
              {label}
            </li>
          ))}
        </ul>

        <div className="section-head">
          <h2>{t('નોંધણી કેવી રીતે થાય છે?', 'How joining works')}</h2>
          <span>{t('3 પગલાં', '3 steps')}</span>
        </div>
        {/* A numbered list joined by a rule reads as a process. The same three
            rows in a card with dividers read as a menu, which is what they were
            mistaken for. */}
        <ol className="join-steps">
          {steps.map(([title, detail], index) => (
            <li key={title}>
              <span className="n">{index + 1}</span>
              <div>
                <b>{title}</b>
                <p>{detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <Link className="text-button bordered" href="/support">
          {t('ગોપનીયતા અને મદદ', 'Privacy & help')}
          <ChevronRight size={16} />
        </Link>
      </section>
    </AppShell>
  );
}
