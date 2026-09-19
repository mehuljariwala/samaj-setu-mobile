'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Heart, Users } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * The four member destinations from spec §6. Text labels, not icons alone —
 * spec §11 asks for text-labelled bottom navigation.
 *
 * A badge count appears on Interests because a received interest is the one
 * thing a member would otherwise have to go looking for.
 */
export function TabBar({ lang, pendingInterests }: { lang: Lang; pendingInterests: number }) {
  const t = translator(lang);
  const pathname = usePathname();

  const tabs = [
    { href: '/home', label: t('હોમ', 'Home'), icon: Home },
    { href: '/discover', label: t('શોધો', 'Discover'), icon: Search },
    { href: '/interests', label: t('રસ', 'Interests'), icon: Heart, count: pendingInterests },
    { href: '/family', label: t('પરિવાર', 'Family'), icon: Users },
  ];

  return (
    <nav className="tabbar" aria-label={t('સભ્ય નેવિગેશન', 'Member navigation')}>
      {tabs.map(({ href, label, icon: Icon, count }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={active ? 'active' : ''}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={21} strokeWidth={active ? 2.2 : 1.7} />
            <span>
              {label}
              {count ? ` ${count}` : ''}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
