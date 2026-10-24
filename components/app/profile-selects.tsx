'use client';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

type Option = { value: string; label: string };

/**
 * City, sub-community and age for User management's profiles. A choice
 * applies at once — the URL holds every filter, so the page stays shareable —
 * and AdminProfiles narrows the list in the browser, so it fetches nothing.
 */
export function ProfileSelects({
  lang,
  params,
  cities,
  communities,
  ages,
}: {
  lang: Lang;
  /** The filters already in the URL, kept when one of these changes. */
  params: Record<string, string>;
  cities: Option[];
  communities: Option[];
  ages: Option[];
}) {
  const t = translator(lang);

  const choose = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    window.history.pushState(null, '', qs ? `/admin/users?${qs}` : '/admin/users');
  };

  const select = (key: string, label: string, all: string, options: Option[]) => (
    <label className="profile-select">
      <span className="sr-only">{label}</span>
      <select value={params[key] ?? ''} onChange={(event) => choose(key, event.target.value)}>
        <option value="">{all}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );

  return (
    <div className="profile-selects">
      {/* Unset, each reads as its own name, which a narrow select can show whole. */}
      {select('city', t('શહેર', 'City'), t('શહેર', 'City'), cities)}
      {select('community', t('જ્ઞાતિ - પેટા સમાજ', 'Caste - Sub-community'), t('સમાજ', 'Community'), communities)}
      {select('age', t('ઉંમર', 'Age'), t('ઉંમર', 'Age'), ages)}
    </div>
  );
}
