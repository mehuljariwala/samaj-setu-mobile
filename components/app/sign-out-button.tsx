'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

import { signOutAction } from '@/app/actions/auth';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

export function SignOutButton({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      className="text-button muted center"
      disabled={pending}
      onClick={() => start(async () => {
        await signOutAction();
        router.replace('/');
      })}
    >
      <LogOut size={15} />
      {t('લૉગ આઉટ', 'Log out')}
    </button>
  );
}
