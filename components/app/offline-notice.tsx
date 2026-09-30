'use client';

import { useOffline } from 'next/offline';
import { WifiOff } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * Shown while the connection is down. Next holds a tap made in that time and
 * sends it again once the connection is back (`experimental.useOffline`), so
 * the button just sits there pending — without this it looks like the app has
 * frozen, and people tap again or give up.
 */
export function OfflineNotice({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const offline = useOffline();

  if (!offline) return null;

  return (
    <output className="toast offline">
      <WifiOff size={18} />
      <span>
        {t(
          'ઇન્ટરનેટ જોડાણ નથી. જોડાણ પાછું આવતાં જ આપમેળે ફરી પ્રયાસ થશે.',
          'No internet connection. It will try again by itself once you are back online.',
        )}
      </span>
    </output>
  );
}
