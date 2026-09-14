'use client';

import { useTransition } from 'react';
import { CheckCheck } from 'lucide-react';

import { markNotificationsReadAction } from '@/app/actions/matching';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

export function MarkAllRead({ lang, ids }: { lang: Lang; ids: string[] }) {
  const t = translator(lang);
  const [pending, start] = useTransition();

  return (
    <button
      className="text-button"
      disabled={pending}
      onClick={() => start(async () => { await markNotificationsReadAction(ids); })}
    >
      <CheckCheck size={15} />
      {t('બધી વાંચેલી ગણો', 'Mark all as read')} ({ids.length})
    </button>
  );
}
