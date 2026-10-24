import Link from 'next/link';
import { ChevronRight, HeartHandshake } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';
import { TRUST } from '@/lib/org';

/**
 * The supporter credit that closes every screen.
 *
 * It sits at the end of the scrolling surface rather than beside the tab bar,
 * so it scrolls away with the content instead of spending a permanent band of
 * a phone screen on something nobody needs to tap. Its one link is to the
 * donate screen, so a family that wants to give finds it from anywhere.
 */
export function TrustCredit({ lang }: { lang: Lang }) {
  const t = translator(lang);

  return (
    <footer className="trust-credit">
      <HeartHandshake size={14} strokeWidth={1.8} />
      <p>
        {t('સહયોગ: ', 'Supported by ')}
        <b>{t(TRUST.name.gu, TRUST.name.en)}</b>
        {TRUST.registrationNumber.gu && (
          <>
            <br />
            {t('રજી. નં.: ', 'Reg. No. ')}
            {t(TRUST.registrationNumber.gu, TRUST.registrationNumber.en)}
          </>
        )}
        <br />
        <Link href="/donate">{t('ટ્રસ્ટને દાન આપો', 'Donate to the trust')}<ChevronRight size={13} strokeWidth={2.6} /></Link>
      </p>
    </footer>
  );
}
