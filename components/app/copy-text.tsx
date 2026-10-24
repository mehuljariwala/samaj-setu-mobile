'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/** Copies a number or an ID with one tap, and says so for a moment. */
export function CopyText({ lang, value, label }: { lang: Lang; value: string; label: string }) {
  const t = translator(lang);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      type="button"
      className={`copy-text${copied ? ' done' : ''}`}
      onClick={copy}
      aria-label={t(`${label} નકલ કરો`, `Copy the ${label}`)}
    >
      {copied ? <Check size={15} strokeWidth={3} /> : <Copy size={15} />}
      <span aria-live="polite">{copied ? t('નકલ થઈ', 'Copied') : t('નકલ', 'Copy')}</span>
    </button>
  );
}
