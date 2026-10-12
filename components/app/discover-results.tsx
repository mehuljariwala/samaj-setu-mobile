'use client';

import Link, { useLinkStatus } from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight, BriefcaseBusiness, CircleHelp, GraduationCap, LoaderCircle, LockKeyhole, RotateCcw, ShieldCheck,
} from 'lucide-react';

import { DiscoverFilters } from '@/components/app/discover-filters';
import { SaveButton } from '@/components/app/save-button';
import { DiscoverEmptyArt } from '@/components/onboarding/art';
import { fieldByKey } from '@/components/biodata/model';
import type { DirectoryCard } from '@/lib/data/discovery';
import { centimetresToFeet, translator, type Lang } from '@/lib/i18n';

/** Cover tints, cycled so a list of cards does not read as one block. */
const COVERS = ['c1', 'c2', 'c3'];

/** Age bands and height bands (in centimetres) the filter panel offers. */
const AGES: Record<string, [number, number]> = {
  '18-22': [18, 22], '23-26': [23, 26], '27-30': [27, 30], '31-35': [31, 35], '36+': [36, 200],
};
const HEIGHTS: Record<string, [number, number]> = {
  u152: [0, 151], '152-163': [152, 163], '164-173': [164, 173], '174-183': [174, 183], '184+': [184, 400],
};

const within = (value: number | null | undefined, band?: [number, number]) =>
  !band || (value != null && value >= band[0] && value <= band[1]);

export type DiscoverProfile = DirectoryCard & { photo: string | null };

/**
 * The Discover cards, narrowed by the filter panel here in the browser.
 *
 * The server sends every profile this candidate may see — the community rules
 * are per pair and were already applied in the database — and the panel only
 * picks among them, so a filter tap fetches nothing. Each tap used to load the
 * whole directory again, which on a busy day was a good part of the free
 * plan's egress. Search still goes to the server: it matches names there.
 */
export function DiscoverResults({
  lang,
  profiles,
  notice,
}: {
  lang: Lang;
  profiles: DiscoverProfile[];
  /** Shown between the filters and the cards. */
  notice?: React.ReactNode;
}) {
  const t = translator(lang);
  const params = useSearchParams();
  const one = (key: string) => params.get(key) || undefined;

  const results = profiles.filter((profile) =>
    (one('saved') !== '1' || profile.saved)
    && (!one('city') || profile.city === one('city'))
    && (!one('community')
      || (one('community') === 'sanatan' ? profile.biodata.origin === 'sanatan' : profile.subCommunity === one('community')))
    && (!one('sect') || profile.sect === one('sect'))
    && within(profile.age, AGES[one('age') ?? ''])
    && within(Number(profile.biodata.height) || null, HEIGHTS[one('height') ?? ''])
    && (!one('edu') || profile.biodata.education === one('edu'))
    && (!one('work') || profile.biodata.work === one('work'))
    && (!one('marital') || profile.biodata.marital === one('marital'))
    && (!one('diet') || profile.biodata.diet === one('diet')));

  const filtered = ['q', 'saved', 'city', 'community', 'sect', 'age', 'height', 'edu', 'work', 'marital', 'diet']
    .some((key) => one(key));

  // Community and sect are stored as keys ("surti", "bhagat"); show them in words.
  const optionLabel = (key: string, value: string | null) => {
    const option = value ? fieldByKey.get(key)?.options?.find((entry) => entry[0] === value) : null;
    return option ? t(option[1], option[2]) : value;
  };
  const cities = [...new Set(profiles.map((profile) => profile.city).filter((value): value is string => Boolean(value)))].sort();
  const communities = [
    ...[...new Set(profiles.map((profile) => profile.subCommunity).filter((value): value is string => Boolean(value)))]
      .map((value) => ({ value, label: optionLabel('community', value) ?? value })),
    // Daughters from outside the Khatri samaj, as one more choice.
    ...(profiles.some((profile) => profile.biodata.origin === 'sanatan')
      ? [{ value: 'sanatan', label: t('સનાતન દીકરીઓ', 'Sanatan daughters') }]
      : []),
  ];

  return (
    <>
      <div className="member-title">
        <h1>{t('પ્રોફાઇલ શોધો', 'Discover')}</h1>
        <p>
          {t(
            `${results.length} ચકાસાયેલી પ્રોફાઇલ, ફક્ત સમાજના નિયમો પ્રમાણે`,
            `${results.length} verified ${results.length === 1 ? 'profile' : 'profiles'}, matched to the samaj’s rules`,
          )}
        </p>
      </div>

      <DiscoverFilters
        lang={lang}
        savedCount={profiles.filter((profile) => profile.saved).length}
        cities={cities}
        communities={communities}
      />

      {notice}

      {/* Two to a row, so a family sees twice as many profiles per screen. */}
      {results.length > 0 && (
        <ul className="member-cards two-up">
          {results.map((profile, index) => (
            <li key={profile.id} style={{ '--i': Math.min(index, 6) } as React.CSSProperties}>
              <article className="profile-card">
                <div className={`profile-cover ${COVERS[index % COVERS.length]}`}>
                  {profile.photo ? (
                    // Plain <img> on purpose: a signed /media link, already card-sized.
                    // Lazy, so a card's photo downloads only when it is scrolled near.
                    // oxlint-disable-next-line nextjs/no-img-element
                    <img className="cover-photo" src={profile.photo} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="monogram">{profile.fullName.charAt(0)}</span>
                  )}
                  <span className="cover-id">{profile.publicCode}</span>
                  <SaveButton lang={lang} candidateId={profile.id} saved={profile.saved} />
                  {!profile.photo && (
                    <span className="photo-lock">
                      <LockKeyhole size={12} />
                      {profile.canViewPhotos
                        ? t('હજી ફોટો નથી', 'No photo yet')
                        : t('ફોટો મંજૂરી પછી', 'Photo with permission')}
                    </span>
                  )}
                </div>

                <div className="profile-body">
                  <div className="profile-name">
                    <h2>{profile.fullName}</h2>
                    <ShieldCheck size={17} aria-label={t('ચકાસાયેલ', 'Verified')} />
                  </div>
                  <p className="profile-meta">
                    {profile.age} {t('વર્ષ', 'yrs')}
                    {centimetresToFeet(profile.biodata.height) ? ` · ${centimetresToFeet(profile.biodata.height)}` : ''}
                    {profile.city ? ` · ${profile.city}` : ''}
                  </p>

                  <div className="admin-facts">
                    {profile.biodata.origin === 'sanatan' && (
                      <span className="sanatan-chip">{t('સનાતન દીકરી', 'Sanatan daughter')}</span>
                    )}
                    {profile.biodata.caste && <span>{profile.biodata.caste}</span>}
                    {profile.biodata.degree && (
                      <span><GraduationCap size={13} />{profile.biodata.degree}</span>
                    )}
                    {profile.biodata.role && (
                      <span><BriefcaseBusiness size={13} />{profile.biodata.role}</span>
                    )}
                    {profile.subCommunity && <span>{optionLabel('community', profile.subCommunity)}</span>}
                    {profile.sect && <span>{optionLabel('sect', profile.sect)}</span>}
                  </div>

                  {/* Spec §7: an incomplete pair is shown and explained, never
                      silently dropped and never quietly treated as eligible. */}
                  {profile.verdict === 'insufficient_information' && (
                    <p className="profile-warn">
                      <CircleHelp size={14} />
                      {t(
                        'સમાજના નિયમો ચકાસી શકાયા નથી — માહિતી અધૂરી છે.',
                        'Community rules could not be checked — some details are missing.',
                      )}
                    </p>
                  )}

                  {/* Not prefetched: a screen of cards would otherwise ask the
                      server for every profile behind them as they scroll past. */}
                  <Link className="profile-open" href={`/discover/${profile.id}`} prefetch={false}>
                    {t('પ્રોફાઇલ જુઓ', 'View profile')}
                    <OpenArrow />
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {results.length === 0 && (
        <div className="admin-empty member-empty">
          <div className="admin-empty-stage"><DiscoverEmptyArt /></div>
          <h2>
            {filtered
              ? t('આ ફિલ્ટરમાં કોઈ નથી', 'No one matches these filters')
              : t('હજી કોઈ પ્રોફાઇલ નથી', 'No profiles here yet')}
          </h2>
          <p>
            {filtered
              ? t('ફિલ્ટર ઓછાં કરીને ફરી જુઓ.', 'Try removing a filter or two.')
              : t(
                'એડમિન મંજૂરી આપે તેમ તેમ પરિવારો અહીં દેખાશે.',
                'Families appear here as an admin approves them. Check back soon.',
              )}
          </p>
          {filtered && (
            <Link className="intro-login" href="/discover">
              <RotateCcw size={17} />
              <b>{t('ફિલ્ટર સાફ કરો', 'Clear filters')}</b>
            </Link>
          )}
        </div>
      )}
    </>
  );
}

/** The arrow turns while the profile loads, since the link is not prefetched. */
function OpenArrow() {
  const { pending } = useLinkStatus();
  return pending
    ? <LoaderCircle size={17} className="link-pending" aria-hidden="true" />
    : <ArrowRight size={17} aria-hidden="true" />;
}
