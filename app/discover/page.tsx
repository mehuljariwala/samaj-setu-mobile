import Link from 'next/link';
import {
  ArrowRight, BriefcaseBusiness, CircleHelp, GraduationCap, LockKeyhole, RotateCcw, ShieldCheck,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { DiscoverFilters } from '@/components/app/discover-filters';
import { SaveButton } from '@/components/app/save-button';
import { DiscoverEmptyArt } from '@/components/onboarding/art';
import { loadActingPage } from '@/lib/data/guards';
import { discover } from '@/lib/data/discovery';
import { centimetresToFeet, translator } from '@/lib/i18n';

/** Cover tints, cycled so a list of cards does not read as one block. */
const COVERS = ['c1', 'c2', 'c3'];

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

  const results = await discover(acting.id, {
    query: one('q'),
    city: one('city'),
    sect: one('sect'),
    subCommunity: one('community'),
    savedOnly: one('saved') === '1',
  });

  const savedCount = results.filter((profile) => profile.saved).length;

  const filtered = Boolean(one('q') || one('city') || one('sect') || one('community') || one('saved'));

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

        <DiscoverFilters lang={lang} savedCount={savedCount} />

        {/* Spec §6: an unpublished candidate may browse but cannot introduce
            themselves. Saying so here beats a disabled button on every card. */}
        {!acting.discoverable && (
          <Link className="member-alert" href="/home">
            <LockKeyhole size={18} />
            <span>
              {t(
                'તમે પ્રોફાઇલ જોઈ શકો છો. પરિચય મોકલવા બાયોડેટા મંજૂર અને સંમતિ સક્રિય હોવી જરૂરી છે.',
                'You can browse. To send an introduction, your biodata needs approval and consent.',
              )}
            </span>
            <ArrowRight size={17} />
          </Link>
        )}

        {results.length > 0 && (
          <ul className="member-cards">
            {results.map((profile, index) => (
              <li key={profile.id} style={{ '--i': Math.min(index, 6) } as React.CSSProperties}>
                <article className="profile-card">
                  <div className={`profile-cover ${COVERS[index % COVERS.length]}`}>
                    <span className="monogram">{profile.fullName.charAt(0)}</span>
                    <span className="cover-id">{profile.publicCode}</span>
                    <SaveButton lang={lang} candidateId={profile.id} saved={profile.saved} />
                    <span className="photo-lock">
                      <LockKeyhole size={12} />
                      {profile.canViewPhotos
                        ? t('ફોટો ઉપલબ્ધ', 'Photo available')
                        : t('ફોટો મંજૂરી પછી', 'Photo with permission')}
                    </span>
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
                      {profile.biodata.degree && (
                        <span><GraduationCap size={13} />{profile.biodata.degree}</span>
                      )}
                      {profile.biodata.role && (
                        <span><BriefcaseBusiness size={13} />{profile.biodata.role}</span>
                      )}
                      {profile.subCommunity && <span>{profile.subCommunity}</span>}
                      {profile.sect && <span>{profile.sect}</span>}
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
                  'ચકાસાયેલા પરિવારો સંમતિ આપે તેમ તેમ અહીં દેખાશે.',
                  'Verified families appear here as they give consent. Check back soon.',
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
