'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { RotateCcw, Search, SlidersHorizontal, TriangleAlert } from 'lucide-react';

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

/*
 * "More filters": birth year, study, work and the other biodata answers
 * (admin_profiles returns them from the latest biodata). Dropdowns match an
 * answer exactly; the three text boxes find the words anywhere in it, so
 * "computer" finds "B.E. Computer" and "bank" finds a bank's name.
 */
const MORE_KEYS = ['year', 'edu', 'deg', 'work', 'job', 'marital', 'diet', 'height', 'sect', 'mangal', 'native'] as const;

/** Dropdowns over a biodata choice: the URL key, then the answer it reads. */
const CHOICES = [
  ['edu', 'education'], ['work', 'work'], ['marital', 'marital'],
  ['diet', 'diet'], ['sect', 'sect'], ['mangal', 'mangal'],
] as const;

/** Height bands in centimetres, the same as Discover's. */
const HEIGHTS: Record<string, [number, number]> = {
  u152: [0, 151], '152-163': [152, 163], '164-173': [164, 173], '174-183': [174, 183], '184+': [184, 400],
};

const contains = (answers: (string | null)[], words: string) =>
  answers.some((answer) => answer?.toLowerCase().includes(words.toLowerCase()));

function passesMore(row: ProfileRow, one: (key: string) => string | undefined) {
  const height = HEIGHTS[one('height') ?? ''];
  const deg = one('deg');
  const job = one('job');
  const native = one('native');
  return (!one('year') || String(row.birth_year) === one('year'))
    && CHOICES.every(([key, answer]) => !one(key) || row[answer] === one(key))
    && (!height || (row.height !== null && row.height >= height[0] && row.height <= height[1]))
    && (!deg || contains([row.degree], deg))
    && (!job || contains([row.role, row.employer], job))
    && (!native || contains([row.native], native));
}

/** A stored choice ("master", "bhagat") in words. */
function choiceLabel(t: T, key: string, value: string | null) {
  const option = value ? fieldByKey.get(key)?.options?.find((entry) => entry[0] === value) : null;
  return option ? t(option[1], option[2]) : value;
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
    && (!age || inAgeBand(row.age, age))
    && passesMore(row, one);

  const shown = rows.filter((row) => passes(row));
  // Three groups: boys and girls of the samaj, and the Sanatan sons and
  // daughters from outside it — who are counted only in their own tab.
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
  for (const key of ['q', 'side', 'stage', 'missing', 'city', 'community', 'age', ...MORE_KEYS]) {
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

      <MoreFilters lang={lang} rows={rows} params={current} />

      {filtered && (
        <FilterLink className="intro-login profile-clear" href={query ? `/admin/users?q=${encodeURIComponent(query)}` : '/admin/users'}>
          <RotateCcw size={16} /><b>{t('ફિલ્ટર સાફ કરો', 'Clear filters')}</b>
        </FilterLink>
      )}

      <nav className="admin-tabs side-tabs" aria-label={t('પ્રોફાઇલ જૂથ', 'Profile group')}>
        {([
          ['boys', t('છોકરાઓ', 'Boys')],
          ['girls', t('છોકરીઓ', 'Girls')],
          ['sanatan', t('સનાતન દીકરા-દીકરીઓ', 'Sanatan sons and daughters')],
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
        {(row.degree || row.education || row.role) && (
          <small className="profile-mini-work">
            {[row.degree ?? choiceLabel(t, 'education', row.education), row.role].filter(Boolean).join(' · ')}
          </small>
        )}
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

/** The panel behind the "More filters" button; closed unless one of its filters is on. */
function MoreFilters({ lang, rows, params }: { lang: Lang; rows: ProfileRow[]; params: Record<string, string> }) {
  const t = translator(lang);
  const active = MORE_KEYS.filter((key) => params[key]).length;
  const [open, setOpen] = useState(active > 0);

  // A choice is a step back can undo; typing replaces, so Back is not a letter at a time.
  const set = (key: string, value: string, replace = false) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    const href = qs ? `/admin/users?${qs}` : '/admin/users';
    if (replace) window.history.replaceState(null, '', href);
    else window.history.pushState(null, '', href);
  };

  const fromModel = (key: string) =>
    (fieldByKey.get(key)?.options ?? []).map(([value, gu, en]) => ({ value, label: t(gu, en) }));
  const years = [...new Set(rows.map((row) => row.birth_year).filter((year): year is number => year !== null))]
    .sort((a, b) => b - a)
    .map((year) => ({ value: String(year), label: String(year) }));

  const dropdowns: { key: (typeof MORE_KEYS)[number]; label: string; options: { value: string; label: string }[] }[] = [
    { key: 'year', label: t('જન્મ વર્ષ', 'Birth year'), options: years },
    { key: 'edu', label: t('લાયકાત', 'Qualification'), options: fromModel('education') },
    { key: 'work', label: t('કામ', 'Work'), options: fromModel('work') },
    { key: 'marital', label: t('વૈવાહિક સ્થિતિ', 'Marital status'), options: fromModel('marital') },
    {
      key: 'height', label: t('ઊંચાઈ', 'Height'), options: [
        { value: 'u152', label: t('5′ થી ઓછી', 'Under 5′') },
        { value: '152-163', label: '5′ – 5′4″' },
        { value: '164-173', label: '5′5″ – 5′8″' },
        { value: '174-183', label: '5′9″ – 6′' },
        { value: '184+', label: t('6′ થી વધુ', 'Over 6′') },
      ],
    },
    { key: 'diet', label: t('આહાર', 'Diet'), options: fromModel('diet') },
    { key: 'sect', label: t('ભક્ત / જગત', 'Sect'), options: fromModel('sect') },
    { key: 'mangal', label: t('મંગળ', 'Mangal'), options: fromModel('mangal') },
  ];

  return (
    <>
      <div className="member-chips more-filters">
        <button
          type="button"
          className={`chip ${open || active > 0 ? 'on' : ''}`}
          aria-expanded={open}
          aria-controls="profile-more"
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal size={14} />
          {t('વધુ ફિલ્ટર', 'More filters')}
          {active > 0 && <i>{active}</i>}
        </button>
      </div>

      {open && (
        <div id="profile-more" className="discover-panel">
          {dropdowns.map((dropdown) => (
            <label key={dropdown.key} className={`profile-select${params[dropdown.key] ? ' on' : ''}`}>
              <span>{dropdown.label}</span>
              <select value={params[dropdown.key] ?? ''} onChange={(event) => set(dropdown.key, event.target.value)}>
                <option value="">{t('બધા', 'Any')}</option>
                {dropdown.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ))}
          <TextFilter
            label={t('અભ્યાસ (ડિગ્રી / વિષય)', 'Studied (degree / subject)')}
            placeholder={t('જેમ કે B.Com, કમ્પ્યુટર', 'e.g. B.Com, computer')}
            value={params.deg ?? ''}
            onChange={(value) => set('deg', value, true)}
          />
          <TextFilter
            label={t('વ્યવસાય / કંપની', 'Job / company')}
            placeholder={t('જેમ કે એન્જિનિયર, બેંક', 'e.g. engineer, bank')}
            value={params.job ?? ''}
            onChange={(value) => set('job', value, true)}
          />
          <TextFilter
            label={t('મૂળ વતન', 'Native place')}
            placeholder={t('ગામ / શહેર', 'Village or town')}
            value={params.native ?? ''}
            onChange={(value) => set('native', value, true)}
          />
        </div>
      )}
    </>
  );
}

/** Words to look for, kept as typed while the address follows. */
function TextFilter({
  label, placeholder, value, onChange,
}: {
  label: string;
  placeholder: string;
  /** The words in the address now. */
  value: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  // "Clear filters" empties the address; empty the box with it.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== text.trim()) setText(value);
  }

  return (
    <label className={`profile-select wide${value ? ' on' : ''}`}>
      <span>{label}</span>
      <input
        type="search"
        value={text}
        placeholder={placeholder}
        enterKeyHint="search"
        onChange={(event) => {
          setText(event.target.value);
          onChange(event.target.value.trim());
        }}
      />
    </label>
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
