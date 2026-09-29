'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Bookmark, Search, X } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * Filters live in the URL rather than in component state, so the server can do
 * the filtering — the community rules that decide what a member may see are
 * per-pair and cannot be evaluated in the browser. It also means a filtered
 * view survives a refresh and can be shared between the two screens.
 */
export function DiscoverFilters({ lang, savedCount }: { lang: Lang; savedCount: number }) {
  const t = translator(lang);
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const [query, setQuery] = useState(params.get('q') ?? '');

  const city = params.get('city') ?? '';
  const sect = params.get('sect') ?? '';
  const savedOnly = params.get('saved') === '1';

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    start(() => router.replace(`/discover?${next.toString()}`, { scroll: false }));
  }

  return (
    <>
      <search>
        <form
          className="admin-search member-search"
          onSubmit={(event) => { event.preventDefault(); apply({ q: query }); }}
        >
          <Search size={19} />
          <input
            type="search"
            enterKeyHint="search"
            aria-label={t('પ્રોફાઇલ શોધો', 'Search profiles')}
            placeholder={t('નામ અથવા SS-કોડ શોધો', 'Search name or SS-code')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label={t('ખાલી કરો', 'Clear search')}
              onClick={() => { setQuery(''); apply({ q: null }); }}
            >
              <X size={17} />
            </button>
          )}
        </form>
      </search>

      <div className="member-chips" data-pending={pending ? '1' : undefined}>
        <button
          className={`chip ${savedOnly ? 'on' : ''}`}
          aria-pressed={savedOnly}
          onClick={() => apply({ saved: savedOnly ? null : '1' })}
        >
          <Bookmark size={14} />
          {t('સાચવેલી', 'Saved')}
          {savedCount > 0 && <i>{savedCount}</i>}
        </button>
        <span className="member-chips-rule" aria-hidden="true" />

        {([
          ['', t('બધાં શહેર', 'All cities')],
          ['Surat', t('સુરત', 'Surat')],
          ['Ahmedabad', t('અમદાવાદ', 'Ahmedabad')],
        ] as [string, string][]).map(([value, label]) => (
          <button
            key={value || 'all-cities'}
            className={`chip ${city === value ? 'on' : ''}`}
            aria-pressed={city === value}
            onClick={() => apply({ city: value || null })}
          >
            {label}
          </button>
        ))}

        <span className="member-chips-rule" aria-hidden="true" />
        {([
          ['', t('બંને સંપ્રદાય', 'Both sects')],
          ['bhagat', t('ભક્ત', 'Bhagat')],
          ['jagat', t('જગત', 'Jagat')],
        ] as [string, string][]).map(([value, label]) => (
          <button
            key={value || 'all-sects'}
            className={`chip ${sect === value ? 'on' : ''}`}
            aria-pressed={sect === value}
            onClick={() => apply({ sect: value || null })}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
