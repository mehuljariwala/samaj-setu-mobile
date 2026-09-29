import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LifeBuoy, ShieldOff } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { SignOutButton } from '@/components/app/sign-out-button';
import { homeFor, loadPublicPage } from '@/lib/data/guards';
import { translator } from '@/lib/i18n';

/**
 * Where an account lands after an admin switches it off. Sign-in is already
 * refused by then; this catches the session that was open at the time, for the
 * hour its token stays valid. The admin's reason is not shown — it is written
 * for the next admin, not for the member.
 */
export default async function AccountOffPage() {
  const { context, lang } = await loadPublicPage();
  if (context.access_state !== 'suspended') redirect(homeFor(context));

  const t = translator(lang);
  const blocked = context.account?.status === 'blocked';

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
            {t(
              'સમાજના એડમિને આ એકાઉન્ટ બંધ કર્યું છે, તેથી પ્રોફાઇલ હાલ કોઈને દેખાતી નથી. વધુ જાણવા અથવા ફરી શરૂ કરાવવા સમાજના સ્વયંસેવકને ફોન કરો.',
              'A samaj admin has switched this account off, so its profiles are hidden for now. To find out more or have it switched back on, call a samaj volunteer.',
            )}
          </p>
        </div>

        <Link className="primary" href="/support">
          <LifeBuoy size={18} />
          {t('સ્વયંસેવકનો સંપર્ક કરો', 'Contact a volunteer')}
        </Link>
        <SignOutButton lang={lang} />
      </section>
    </AppShell>
  );
}
