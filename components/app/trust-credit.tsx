import { HeartHandshake } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';
import { TRUST } from '@/lib/org';

/**
 * The supporter credit that closes every screen.
 *
 * It sits at the end of the scrolling surface rather than beside the tab bar,
 * so it scrolls away with the content instead of spending a permanent band of
 * a phone screen on something nobody needs to tap.
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
      </p>
    </footer>
  );
}
