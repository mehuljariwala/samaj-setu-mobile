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
      <form
        className="searchbar"
        onSubmit={(event) => { event.preventDefault(); apply({ q: query }); }}
      >
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label={t('પ્રોફાઇલ શોધો', 'Search profiles')}
            placeholder={t('નામ અથવા કોડ શોધો', 'Search name or code')}
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
        </div>
      </form>

      <div className="chips" data-pending={pending ? '1' : undefined}>
        <button
          className={`chip ${savedOnly ? 'on' : 'ghost'}`}
          onClick={() => apply({ saved: savedOnly ? null : '1' })}
        >
          <Bookmark size={14} />
          {t('સાચવેલી', 'Saved')}
          {savedCount > 0 && ` ${savedCount}`}
        </button>

        {([
          ['', t('બધાં શહેર', 'All cities')],
          ['Surat', t('સુરત', 'Surat')],
          ['Ahmedabad', t('અમદાવાદ', 'Ahmedabad')],
        ] as [string, string][]).map(([value, label]) => (
          <button
            key={value || 'all-cities'}
            className={`chip ${city === value ? 'on' : ''}`}
            onClick={() => apply({ city: value || null })}
          >
            {label}
          </button>
        ))}

        {([
          ['', t('બંને સંપ્રદાય', 'Both sects')],
          ['bhagat', t('ભક્ત', 'Bhagat')],
          ['jagat', t('જગત', 'Jagat')],
        ] as [string, string][]).map(([value, label]) => (
          <button
            key={value || 'all-sects'}
            className={`chip ${sect === value ? 'on' : ''}`}
            onClick={() => apply({ sect: value || null })}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
