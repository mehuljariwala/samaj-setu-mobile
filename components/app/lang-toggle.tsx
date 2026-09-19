'use client';

import { useTransition } from 'react';

import { setLanguageAction } from '@/app/actions/prefs';
import type { Lang } from '@/lib/i18n';

/**
 * Switching language re-renders the server tree with the other set of strings.
 * Nothing in the page is remounted, so a half-filled form keeps its values —
 * spec §11 requires the switch to preserve progress.
 */
export function LangToggle({ lang }: { lang: Lang }) {
  const [pending, start] = useTransition();

  return (
    <button
      className="lang-pill"
      disabled={pending}
      // The label is the language you would switch *to*, which is the only way
      // it reads correctly to someone who cannot read the current one.
      onClick={() => start(() => { void setLanguageAction(lang === 'en' ? 'gu' : 'en'); })}
    >
      {lang === 'en' ? 'ગુજરાતી' : 'English'}
    </button>
  );
}
