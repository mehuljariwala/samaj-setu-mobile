'use client';

import { useEffect, useState } from 'react';
import { Sprout } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { SPLASH_COOKIE, translator } from '@/lib/i18n';
import { SAMAJ } from '@/lib/org';

/**
 * The opening card: the app's name, the samaj's name and its slogan, once each
 * time the app is opened.
 *
 * The layout renders it only while the session cookie is missing, so it is on
 * screen from the first paint rather than flashing in over the page. Its exit
 * is a CSS animation, so it leaves on time even before this script has loaded;
 * once it has, a tap or a key skips it.
 *
 * Hidden from screen readers: everything on it is also in the header and on
 * the welcome screen, and it would be gone before it finished being read.
 */
export function Splash({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // No max-age, so the browser forgets it when the app is closed.
    document.cookie = `${SPLASH_COOKIE}=1; path=/; samesite=lax`;
    const skip = () => setOpen(false);
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, []);

  if (!open) return null;

  return (
    <div
      className="splash"
      aria-hidden="true"
      onClick={() => setOpen(false)}
      onAnimationEnd={(event) => {
        if (event.animationName === 'splash-out') setOpen(false);
      }}
    >
      <span className="splash-mark">
        <Sprout size={40} strokeWidth={1.7} />
      </span>
      <b className="splash-name">{t('સમાજ સેતુ', 'Samaj Setu')}</b>
      <span className="splash-samaj">{t(SAMAJ.name.gu, SAMAJ.name.en)}</span>
      <p className="splash-slogan" lang="gu">
        {SAMAJ.slogan.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
    </div>
  );
}
