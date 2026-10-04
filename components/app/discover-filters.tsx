'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Bookmark, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';

import { fieldByKey } from '@/components/biodata/model';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/** The URL keys the filter panel owns, in the order its dropdowns appear. */
const PANEL_KEYS = ['city', 'community', 'sect', 'age', 'height', 'edu', 'work', 'marital', 'diet'] as const;

/**
 * Filters live in the URL rather than in component state, so the server can do
 * the filtering — the community rules that decide what a member may see are
 * per-pair and cannot be evaluated in the browser. It also means a filtered
 * view survives a refresh and can be shared between the two screens.
 *
 * Search and Saved are always in view; everything else sits behind one
 * Filters button, which shows how many are on.
 */
export function DiscoverFilters({
  lang,
  savedCount,
  cities,
  communities,
}: {
  lang: Lang;
  savedCount: number;
  /** Only the cities and communities that profiles actually have. */
  cities: string[];
  communities: { value: string; label: string }[];
}) {
  const t = translator(lang);
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const [query, setQuery] = useState(params.get('q') ?? '');
  const savedOnly = params.get('saved') === '1';
  const active = PANEL_KEYS.filter((key) => params.get(key)).length;
  const [open, setOpen] = useState(active > 0);

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    start(() => router.replace(`/discover?${next.toString()}`, { scroll: false }));
  }

  const fromModel = (key: string) =>
    (fieldByKey.get(key)?.options ?? []).map(([value, gu, en]) => ({ value, label: t(gu, en) }));

  const dropdowns: { key: (typeof PANEL_KEYS)[number]; label: string; options: { value: string; label: string }[] }[] = [
    { key: 'city', label: t('શહેર', 'City'), options: cities.map((value) => ({ value, label: value })) },
    { key: 'community', label: t('સમાજ', 'Community'), options: communities },
    { key: 'sect', label: t('સંપ્રદાય', 'Sect'), options: fromModel('sect') },
    {
      key: 'age', label: t('ઉંમર', 'Age'), options: [
        { value: '18-22', label: t('18–22 વર્ષ', '18–22 yrs') },
        { value: '23-26', label: t('23–26 વર્ષ', '23–26 yrs') },
        { value: '27-30', label: t('27–30 વર્ષ', '27–30 yrs') },
        { value: '31-35', label: t('31–35 વર્ષ', '31–35 yrs') },
        { value: '36+', label: t('36+ વર્ષ', '36+ yrs') },
      ],
    },
    {
      key: 'height', label: t('ઊંચાઈ', 'Height'), options: [
        { value: 'u152', label: t('5′ થી ઓછી', 'Under 5′') },
        { value: '152-163', label: '5′ – 5′4″' },
        { value: '164-173', label: '5′5″ – 5′8″' },
        { value: '174-183', label: '5′9″ – 6′' },
        { value: '184+', label: t('6′ થી વધુ', 'Over 6′') },
      ],
    },
    { key: 'edu', label: t('અભ્યાસ', 'Education'), options: fromModel('education') },
    { key: 'work', label: t('કામ', 'Work'), options: fromModel('work') },
    { key: 'marital', label: t('વૈવાહિક સ્થિતિ', 'Marital status'), options: fromModel('marital') },
    { key: 'diet', label: t('આહાર', 'Diet'), options: fromModel('diet') },
  ];

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
        <button
          className={`chip ${open || active > 0 ? 'on' : ''}`}
          aria-expanded={open}
          aria-controls="discover-panel"
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal size={14} />
          {t('ફિલ્ટર', 'Filters')}
          {active > 0 && <i>{active}</i>}
        </button>
        {active > 0 && (
          <button
            className="chip"
            onClick={() => apply(Object.fromEntries(PANEL_KEYS.map((key) => [key, null])))}
          >
            <RotateCcw size={14} />
            {t('સાફ કરો', 'Clear')}
          </button>
        )}
      </div>

      {open && (
        <div id="discover-panel" className="discover-panel" data-pending={pending ? '1' : undefined}>
          {dropdowns.map((dropdown) => (
            <label key={dropdown.key} className={`profile-select${params.get(dropdown.key) ? ' on' : ''}`}>
              <span>{dropdown.label}</span>
              <select
                value={params.get(dropdown.key) ?? ''}
                onChange={(event) => apply({ [dropdown.key]: event.target.value || null })}
              >
                <option value="">{t('બધા', 'Any')}</option>
                {dropdown.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
    </>
  );
}
