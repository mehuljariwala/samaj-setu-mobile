'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { RotateCcw, Search, TriangleAlert } from 'lucide-react';

import { ProfileSelects } from '@/components/app/profile-selects';
import { fieldByKey } from '@/components/biodata/model';
import type { ProfileRow } from '@/lib/data/users';
import { familyTag, rowHref } from '@/lib/family-stages';
import { translator, type Lang, type T } from '@/lib/i18n';

/*
 * User management's profiles, filtered here in the browser.
 *
 * The server sends every profile once (admin_profiles), and the chips, tabs
 * and dropdowns only pick among them: they change the address, so a view can
 * still be shared, but fetch nothing. Each tap used to load every profile
 * again, a few hundred kilobytes of the free plan's egress at a time. Search
 * still goes to the server, which matches names and phone numbers there.
 */
type StageFilter = 'all' | 'review' | 'family' | 'live' | 'rejected';
type Missing = 'not_sent' | 'documents' | 'biodata' | 'photo';
type AgeBand = 'u25' | '26-30' | '31-35' | '36+';

const STAGE_GROUPS: Record<Exclude<StageFilter, 'all'>, string[]> = {
  review: ['identity_review', 'biodata_review'],
  family: ['not_sent', 'identity_fix', 'biodata_pending', 'biodata_fix'],
  live: ['live'],
  rejected: ['identity_rejected', 'biodata_rejected'],
};
const MISSING: Missing[] = ['not_sent', 'documents', 'biodata', 'photo'];
const AGE_BANDS: AgeBand[] = ['u25', '26-30', '31-35', '36+'];

/**
 * What a profile still needs before it is complete, in the order a family
 * meets them. Documents only matter until the registration is approved.
 */
function missingFor(row: ProfileRow): Missing[] {
  const items: Missing[] = [];
  if (row.stage === 'not_sent') items.push('not_sent');
  if ((row.stage === 'not_sent' || row.stage === 'identity_fix') && !row.documents_complete) items.push('documents');
  if ((row.completion ?? 0) < 100 && row.stage !== 'live' && row.stage !== 'hidden') items.push('biodata');
  if (!row.has_photo) items.push('photo');
  return items;
}

function inAgeBand(age: number | null, band: AgeBand) {
  if (age === null) return false;
  if (band === 'u25') return age <= 25;
  if (band === '26-30') return age >= 26 && age <= 30;
  if (band === '31-35') return age >= 31 && age <= 35;
  return age >= 36;
}

/** Boys on one side, girls on the other, under one set of filters. */
export function AdminProfiles({ lang, rows }: { lang: Lang; rows: ProfileRow[] }) {
  const t = translator(lang);
  const params = useSearchParams();
  const one = (key: string) => params.get(key) || undefined;

  const query = one('q');
  const stage = (['review', 'family', 'live', 'rejected'] as const).find((key) => key === one('stage')) ?? 'all';
  const missing = MISSING.find((key) => key === one('missing'));
  const city = one('city');
  const community = one('community');
  const age = AGE_BANDS.find((key) => key === one('age'));

  // Each filter's counts are taken with every *other* filter applied, so a
  // chip says how many it would show if tapped.
  const passes = (row: ProfileRow, skip?: 'stage' | 'missing') =>
    (skip === 'stage' || stage === 'all' || STAGE_GROUPS[stage].includes(row.stage ?? ''))
    && (skip === 'missing' || !missing || missingFor(row).includes(missing))
    && (!city || row.city === city)
    && (!community || row.sub_community === community)
    && (!age || inAgeBand(row.age, age));

  const shown = rows.filter((row) => passes(row));
  // Three groups: boys, girls of the samaj, and Sanatan daughters from outside
  // it — a Sanatan daughter is counted only in her own tab.
  const groups = {
    boys: shown.filter((row) => row.gender === 'male' && !row.is_sanatan),
    girls: shown.filter((row) => row.gender === 'female' && !row.is_sanatan),
    sanatan: shown.filter((row) => row.is_sanatan),
  };
  const side = (['boys', 'girls', 'sanatan'] as const).find((key) => key === one('side')) ?? 'boys';

  const stageCount = (key: StageFilter) =>
    rows.filter((row) => passes(row, 'stage') && (key === 'all' || STAGE_GROUPS[key].includes(row.stage ?? ''))).length;
  const missingCount = (key: Missing) =>
    rows.filter((row) => passes(row, 'missing') && missingFor(row).includes(key)).length;

  // The URL as it stands, for links that change one filter and keep the rest.
  const current: Record<string, string> = {};
  for (const key of ['q', 'side', 'stage', 'missing', 'city', 'community', 'age']) {
    const value = one(key);
    if (value) current[key] = value;
  }
  const hrefWith = (key: string, value?: string) => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    return qs ? `/admin/users?${qs}` : '/admin/users';
  };
  const filtered = Object.keys(current).some((key) => key !== 'q' && key !== 'side');

  const communityField = fieldByKey.get('community');
  const communityLabel = (value: string) => {
    const option = communityField?.options?.find((entry) => entry[0] === value);
    return option ? t(option[1], option[2]) : value;
  };
  const cities = [...new Set(rows.map((row) => row.city).filter((value): value is string => Boolean(value)))].sort();
  const communities = [...new Set(rows.map((row) => row.sub_community).filter((value): value is string => Boolean(value)))];

  const stageChips: { key: StageFilter; label: string }[] = [
    { key: 'all', label: t('બધા', 'All') },
    { key: 'review', label: t('મંજૂર કરવાના', 'To approve') },
    { key: 'family', label: t('પરિવારની રાહ', 'Waiting on family') },
    { key: 'live', label: t('પ્રકાશિત', 'Live') },
    { key: 'rejected', label: t('નામંજૂર', 'Rejected') },
  ];
  const missingLabel: Record<Missing, string> = {
    not_sent: t('હજી મોકલ્યું નથી', 'Not sent'),
    documents: t('દસ્તાવેજ', 'Documents'),
    biodata: t('બાયોડેટા', 'Biodata'),
    photo: t('ફોટો', 'Photo'),
  };

  return (
    <>
      <search>
        <form className="admin-search" action="/admin/users">
          {Object.entries(current).filter(([key]) => key !== 'q').map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <Search size={19} />
          <input
            name="q"
            type="search"
            defaultValue={query}
            placeholder={t('નામ, SS-કોડ અથવા નંબર શોધો', 'Search name, SS-code or phone')}
            aria-label={t('શોધો', 'Search')}
            enterKeyHint="search"
          />
        </form>
      </search>

      <nav className="family-chips" aria-label={t('સ્થિતિ', 'Stage')}>
        {stageChips.map((chip) => (
          <FilterLink
            key={chip.key}
            href={hrefWith('stage', chip.key === 'all' ? undefined : chip.key)}
            className={stage === chip.key ? 'on' : undefined}
            aria-current={stage === chip.key ? 'page' : undefined}
          >
            {chip.label}
            <i>{stageCount(chip.key)}</i>
          </FilterLink>
        ))}
      </nav>

      <nav className="family-chips missing-chips" aria-label={t('શું ખૂટે છે', 'What is missing')}>
        <span className="missing-chips-label"><TriangleAlert size={14} />{t('ખૂટે છે:', 'Missing:')}</span>
        {MISSING.map((key) => (
          <FilterLink
            key={key}
            href={hrefWith('missing', missing === key ? undefined : key)}
            className={missing === key ? 'on' : undefined}
            aria-current={missing === key ? 'page' : undefined}
          >
            {missingLabel[key]}
            <i>{missingCount(key)}</i>
          </FilterLink>
        ))}
      </nav>

      <ProfileSelects
        lang={lang}
        params={current}
        cities={cities.map((value) => ({ value, label: value }))}
        communities={communities.map((value) => ({ value, label: communityLabel(value) }))}
        ages={[
          { value: 'u25', label: t('25 સુધી', 'Up to 25') },
          { value: '26-30', label: '26–30' },
          { value: '31-35', label: '31–35' },
          { value: '36+', label: '36+' },
        ]}
      />

      {filtered && (
        <FilterLink className="intro-login profile-clear" href={query ? `/admin/users?q=${encodeURIComponent(query)}` : '/admin/users'}>
          <RotateCcw size={16} /><b>{t('ફિલ્ટર સાફ કરો', 'Clear filters')}</b>
        </FilterLink>
      )}

      <nav className="admin-tabs side-tabs" aria-label={t('પ્રોફાઇલ જૂથ', 'Profile group')}>
        {([
          ['boys', t('છોકરાઓ', 'Boys')],
          ['girls', t('છોકરીઓ', 'Girls')],
          ['sanatan', t('સનાતન દીકરીઓ', 'Sanatan daughters')],
        ] as const).map(([key, label]) => (
          <FilterLink
            key={key}
            href={hrefWith('side', key === 'boys' ? undefined : key)}
            className={`${side === key ? 'on' : ''} side-${key}`}
            aria-current={side === key ? 'page' : undefined}
          >
            {label}
            <i>{groups[key].length}</i>
          </FilterLink>
        ))}
      </nav>

      {groups[side].length === 0 ? (
        <p className="gender-empty">{t('આ જૂથમાં કોઈ નથી', 'No one in this group')}</p>
      ) : (
        <ul className="profile-grid">
          {groups[side].map((row) => <ProfileMini key={row.candidate_id!} row={row} t={t} lang={lang} />)}
        </ul>
      )}
    </>
  );
}

/** One profile, small enough for half the screen: who, where, and what is left. */
function ProfileMini({ row, t, lang }: { row: ProfileRow; t: T; lang: Lang }) {
  const tag = familyTag(t, lang, row);
  // "Not sent" is already the tag, so the list names only what is left.
  const gaps = missingFor(row).filter((gap) => gap !== 'not_sent');
  const gapLabel: Record<Missing, string> = {
    not_sent: t('હજી મોકલ્યું નથી', 'Not sent yet'),
    documents: t('દસ્તાવેજ ખૂટે છે', 'Documents missing'),
    biodata: t(`બાયોડેટા ${row.completion ?? 0}%`, `Biodata ${row.completion ?? 0}%`),
    photo: t('ફોટો નથી', 'No photo'),
  };
  return (
    <li>
      <Link className="profile-mini" href={rowHref(row)}>
        <b>{row.full_name}</b>
        <small>{[row.age !== null ? t(`${row.age} વર્ષ`, `${row.age} yrs`) : null, row.city].filter(Boolean).join(' · ')}</small>
        <small className="profile-mini-code">{row.public_code}</small>
        <span className={`queue-tag ${tag.tone}`}><tag.Icon size={13} strokeWidth={2.4} />{tag.label}</span>
        {gaps.length > 0 && (
          <span className="profile-mini-gaps">
            {gaps.map((gap) => (
              <em key={gap}>
                <TriangleAlert size={12} />
                {gapLabel[gap]}
              </em>
            ))}
          </span>
        )}
      </Link>
    </li>
  );
}

/** A filter change: the address changes and the list follows, with no trip to the server. */
function FilterLink({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        window.history.pushState(null, '', href);
      }}
    >
      {children}
    </a>
  );
}
