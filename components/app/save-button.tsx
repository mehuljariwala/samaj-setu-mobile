'use client';

import { useOptimistic, useTransition } from 'react';
import { Bookmark } from 'lucide-react';

import { setSavedAction } from '@/app/actions/matching';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * Optimistic because a shortlist toggle has to feel instant on a slow phone,
 * and because the worst case — the write failing — is recoverable by tapping
 * again. The server is still the authority: `revalidatePath` in the action
 * replaces the optimistic value with the stored one.
 */
export function SaveButton({
  lang,
  candidateId,
  saved,
}: {
  lang: Lang;
  candidateId: string;
  saved: boolean;
}) {
  const t = translator(lang);
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(saved);

  return (
    <button
      className={`save-btn ${optimistic ? 'on' : ''}`}
      disabled={pending}
      aria-pressed={optimistic}
      aria-label={optimistic
        ? t('સાચવેલી દૂર કરો', 'Remove from saved')
        : t('પ્રોફાઇલ સાચવો', 'Save profile')}
      onClick={() => start(async () => {
        setOptimistic(!optimistic);
        await setSavedAction(candidateId, !optimistic);
      })}
    >
      <Bookmark size={18} fill={optimistic ? 'currentColor' : 'none'} />
    </button>
  );
}
