import Link from 'next/link';
import {
  ArrowRight, BriefcaseBusiness, CircleHelp, GraduationCap, LockKeyhole, Search, ShieldCheck,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { DiscoverFilters } from '@/components/app/discover-filters';
import { SaveButton } from '@/components/app/save-button';
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

  return (
    <AppShell lang={lang} context={context} acting={acting} member>
      <section className="screen-pad">
        <DiscoverFilters lang={lang} savedCount={savedCount} />

        <p className="result-count">
          {results.length}{' '}
          {t('પ્રોફાઇલ', results.length === 1 ? 'profile' : 'profiles')} ·{' '}
          {t('ચકાસેલા સભ્યો', 'Verified members')}
        </p>

        {/* Spec §6: an unpublished candidate may browse but cannot introduce
            themselves. Saying so here beats a disabled button on every card. */}
        {!acting.discoverable && (
          <div className="note">
            <LockKeyhole size={19} />
            <p>
              {t(
                'તમે પ્રોફાઇલ જોઈ શકો છો, પણ પરિચય મોકલવા માટે તમારો બાયોડેટા મંજૂર અને સંમતિ સક્રિય હોવી જરૂરી છે.',
                'You can browse, but sending an introduction needs your biodata approved and consent active.',
              )}
            </p>
          </div>
        )}

        {results.map((profile, index) => (
          <article className="profile-card card" key={profile.id}>
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
                <ShieldCheck size={17} />
              </div>
              <p className="profile-meta">
                {profile.age} {t('વર્ષ', 'yrs')}
                {centimetresToFeet(profile.biodata.height) ? ` · ${centimetresToFeet(profile.biodata.height)}` : ''}
                {profile.city ? ` · ${profile.city}` : ''}
              </p>

              <div className="profile-facts">
                {profile.biodata.degree && (
                  <span><GraduationCap size={15} />{profile.biodata.degree}</span>
                )}
                {profile.biodata.role && (
                  <span><BriefcaseBusiness size={15} />{profile.biodata.role}</span>
                )}
              </div>

              {/* Spec §7: an incomplete pair is shown and explained, never
                  silently dropped and never quietly treated as eligible. */}
              {profile.verdict === 'insufficient_information' && (
                <p className="field-hint inline-icon">
                  <CircleHelp size={12} />
                  {t(
                    'સમાજના નિયમો ચકાસી શકાયા નથી — માહિતી અધૂરી છે.',
                    'Community rules could not be checked — some details are missing.',
                  )}
                </p>
              )}

              <div className="profile-foot">
                <div className="tags">
                  {profile.subCommunity && <span className="tag">{profile.subCommunity}</span>}
                  {profile.sect && <span className="tag">{profile.sect}</span>}
                </div>
                <Link href={`/discover/${profile.id}`}>
                  {t('પ્રોફાઇલ જુઓ', 'View profile')}
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </article>
        ))}

        {results.length === 0 && (
          <div className="empty">
            <Search size={32} />
            <h3>{t('પ્રોફાઇલ મળી નથી', 'No profiles here yet')}</h3>
            <p>{t('ફિલ્ટર બદલો અથવા પ્રોફાઇલ સાચવો.', 'Adjust your filters or save a profile to see it here.')}</p>
            <Link className="secondary" href="/discover">
              {t('બધી પ્રોફાઇલ જુઓ', 'Show all profiles')}
            </Link>
          </div>
        )}
      </section>
    </AppShell>
  );
}
