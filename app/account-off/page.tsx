import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FilePenLine, LifeBuoy, ShieldOff } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { SignOutButton } from '@/components/app/sign-out-button';
import { homeFor, loadPublicPage, returningCandidate } from '@/lib/data/guards';
import { translator } from '@/lib/i18n';

/**
 * Where an account lands after an admin switches it off or blocks it. A
 * blocked account cannot sign in at all; this catches the session that was
 * open at the time, for the hour its token stays valid. A family that is only
 * switched off may sign in, and is shown the way back: update the biodata and
 * send it, and the admin's approval switches the account on again. The
 * admin's reason is not shown — it is written for the next admin, not for the
 * member.
 */
export default async function AccountOffPage() {
  const page = await loadPublicPage();
  const { context, lang } = page;
  if (context.access_state !== 'suspended') redirect(homeFor(context));

  const t = translator(lang);
  const blocked = context.account?.status === 'blocked';
  const returning = returningCandidate(page);
  const sent = returning?.biodata?.status === 'submitted' || returning?.biodata?.status === 'under_review';

  return (
    <AppShell lang={lang} context={context}>
      <section className="screen-pad account-off">
        <span className="account-off-icon" aria-hidden="true">
          <ShieldOff size={30} strokeWidth={1.6} />
        </span>
        <div className="page-title">
          <span className="eyebrow">{t('એકાઉન્ટ', 'Account')}</span>
          <h1>
            {blocked
              ? t('આ એકાઉન્ટ બ્લૉક કરવામાં આવ્યું છે', 'This account has been blocked')
              : t('આ એકાઉન્ટ હાલ બંધ છે', 'This account is switched off')}
          </h1>
          <p>
            {!returning
              ? t(
                'સમાજના એડમિને આ એકાઉન્ટ બંધ કર્યું છે, તેથી પ્રોફાઇલ હાલ કોઈને દેખાતી નથી. વધુ જાણવા અથવા ફરી શરૂ કરાવવા સમાજના સ્વયંસેવકને ફોન કરો.',
                'A samaj admin has switched this account off, so its profiles are hidden for now. To find out more or have it switched back on, call a samaj volunteer.',
              )
              : sent
                ? t(
                  'તમારો બદલેલો બાયોડેટા મંજૂરી માટે મોકલાયો છે. એડમિન મંજૂર કરે એટલે એકાઉન્ટ ફરી ચાલુ થશે અને પ્રોફાઇલ ફરી દેખાશે.',
                  'Your updated biodata has been sent for approval. Once an admin approves it, the account switches back on and the profile is shown again.',
                )
                : t(
                  'સમાજના એડમિને આ એકાઉન્ટ બંધ કર્યું છે, તેથી પ્રોફાઇલ હાલ કોઈને દેખાતી નથી. ફરી શરૂ કરવા બાયોડેટા અપડેટ કરીને મંજૂરી માટે મોકલો. એડમિન મંજૂર કરે એટલે એકાઉન્ટ ફરી ચાલુ થઈ જશે.',
                  'A samaj admin has switched this account off, so its profiles are hidden for now. To start again, update the biodata and send it for approval. Once an admin approves it, the account switches back on.',
                )}
          </p>
        </div>

        {returning && !sent && (
          <Link className="primary" href="/biodata">
            <FilePenLine size={18} />
            {t('બાયોડેટા અપડેટ કરો', 'Update the biodata')}
          </Link>
        )}
        <Link className={returning && !sent ? 'intro-login' : 'primary'} href="/support">
          <LifeBuoy size={18} />
          {t('સ્વયંસેવકનો સંપર્ક કરો', 'Contact a volunteer')}
        </Link>
        <SignOutButton lang={lang} />
      </section>
    </AppShell>
  );
}
