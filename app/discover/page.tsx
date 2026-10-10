import Link from 'next/link';
import {
  ArrowRight, BriefcaseBusiness, CircleHelp, GraduationCap, LockKeyhole, RotateCcw, ShieldCheck,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { DiscoverFilters } from '@/components/app/discover-filters';
import { SaveButton } from '@/components/app/save-button';
import { DiscoverEmptyArt } from '@/components/onboarding/art';
import { fieldByKey } from '@/components/biodata/model';
import { loadActingPage } from '@/lib/data/guards';
import { discoverAll, discoverPhotos } from '@/lib/data/discovery';
import { centimetresToFeet, translator } from '@/lib/i18n';

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

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, lang, acting } = await loadActingPage();
  const params = await searchParams;
  const t = translator(lang);

  const one = (key: string) => {
    const value = params[key];
    return typeof value === 'string' ? value : undefined;
  };

  // Everyone this candidate may see, then the panel's filters here, so the
  // dropdowns can offer only the cities and communities that exist.
  const all = await discoverAll(acting.id, { query: one('q'), savedOnly: one('saved') === '1' });
  const results = all.filter((profile) =>
    (!one('city') || profile.city === one('city'))
    && (!one('community')
      || (one('community') === 'sanatan' ? profile.biodata.origin === 'sanatan' : profile.subCommunity === one('community')))
    && (!one('sect') || profile.sect === one('sect'))
    && within(profile.age, AGES[one('age') ?? ''])
    && within(Number(profile.biodata.height) || null, HEIGHTS[one('height') ?? ''])
    && (!one('edu') || profile.biodata.education === one('edu'))
    && (!one('work') || profile.biodata.work === one('work'))
    && (!one('marital') || profile.biodata.marital === one('marital'))
    && (!one('diet') || profile.biodata.diet === one('diet')));

  const photos = await discoverPhotos(results.map((profile) => profile.id));
  const savedCount = all.filter((profile) => profile.saved).length;
  const filtered = ['q', 'saved', 'city', 'community', 'sect', 'age', 'height', 'edu', 'work', 'marital', 'diet']
    .some((key) => one(key));

  // Community and sect are stored as keys ("surti", "bhagat"); show them in words.
  const optionLabel = (key: string, value: string | null) => {
    const option = value ? fieldByKey.get(key)?.options?.find((entry) => entry[0] === value) : null;
    return option ? t(option[1], option[2]) : value;
  };
  const cities = [...new Set(all.map((profile) => profile.city).filter((value): value is string => Boolean(value)))].sort();
  const communities = [
    ...[...new Set(all.map((profile) => profile.subCommunity).filter((value): value is string => Boolean(value)))]
      .map((value) => ({ value, label: optionLabel('community', value) ?? value })),
    // Daughters from outside the Khatri samaj, as one more choice.
    ...(all.some((profile) => profile.biodata.origin === 'sanatan')
      ? [{ value: 'sanatan', label: t('સનાતન દીકરીઓ', 'Sanatan daughters') }]
      : []),
  ];

  return (
    <AppShell lang={lang} context={context} acting={acting} member>
      <section className="member-screen tone-rose">
        <div className="member-title">
          <h1>{t('પ્રોફાઇલ શોધો', 'Discover')}</h1>
          <p>
            {t(
              `${results.length} ચકાસાયેલી પ્રોફાઇલ, ફક્ત સમાજના નિયમો પ્રમાણે`,
              `${results.length} verified ${results.length === 1 ? 'profile' : 'profiles'}, matched to the samaj’s rules`,
            )}
          </p>
        </div>

        <DiscoverFilters lang={lang} savedCount={savedCount} cities={cities} communities={communities} />

        {/* Spec §6: an unpublished candidate may browse but cannot introduce
            themselves. Saying so here beats a disabled button on every card. */}
        {!acting.discoverable && (
          <Link className="member-alert" href="/home">
            <LockKeyhole size={18} />
            <span>
              {t(
                'તમે પ્રોફાઇલ જોઈ શકો છો. પરિચય મોકલવા તમારો બાયોડેટા મંજૂર થયેલો હોવો જરૂરી છે.',
                'You can browse. To send an introduction, your biodata needs to be approved.',
              )}
            </span>
            <ArrowRight size={17} />
          </Link>
        )}

        {/* Two to a row, so a family sees twice as many profiles per screen. */}
        {results.length > 0 && (
          <ul className="member-cards two-up">
            {results.map((profile, index) => (
              <li key={profile.id} style={{ '--i': Math.min(index, 6) } as React.CSSProperties}>
                <article className="profile-card">
                  <div className={`profile-cover ${COVERS[index % COVERS.length]}`}>
                    {photos.get(profile.id) ? (
                      // Plain <img> on purpose: a signed URL for a private object, already card-sized.
                      // Lazy, so a card's photo downloads only when it is scrolled near.
                      // oxlint-disable-next-line nextjs/no-img-element
                      <img className="cover-photo" src={photos.get(profile.id)} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="monogram">{profile.fullName.charAt(0)}</span>
                    )}
                    <span className="cover-id">{profile.publicCode}</span>
                    <SaveButton lang={lang} candidateId={profile.id} saved={profile.saved} />
                    {!photos.get(profile.id) && (
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

                    <Link className="profile-open" href={`/discover/${profile.id}`}>
                      {t('પ્રોફાઇલ જુઓ', 'View profile')}
                      <ArrowRight size={17} />
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
      </section>
    </AppShell>
  );
}
