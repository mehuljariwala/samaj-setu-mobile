'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

import { signOutAction } from '@/app/actions/auth';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * `icon` is for the top bar, where it has to be reachable from every screen —
 * an admin sees no tab bar and no Family tab, and neither does anyone waiting
 * on their review, so without it those accounts had no way out at all.
 * `text` is the labelled version on the Family screen, which is where someone
 * looking for account settings will actually go.
 */
export function SignOutButton({
  lang,
  variant = 'text',
}: {
  lang: Lang;
  variant?: 'text' | 'icon';
}) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();

  const signOut = () => start(async () => {
    await signOutAction();
    router.replace('/');
  });

  if (variant === 'icon') {
    return (
      <button
        className="icon-button"
        disabled={pending}
        aria-label={t('લૉગ આઉટ', 'Log out')}
        title={t('લૉગ આઉટ', 'Log out')}
        onClick={signOut}
      >
        <LogOut size={19} />
      </button>
    );
  }

  return (
    <button className="text-button muted center" disabled={pending} onClick={signOut}>
      <LogOut size={15} />
      {t('લૉગ આઉટ', 'Log out')}
    </button>
  );
}
