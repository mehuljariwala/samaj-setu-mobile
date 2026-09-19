import Link from 'next/link';
import { ArrowLeft, LockKeyhole, Phone, ShieldCheck } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { ProfileActions } from '@/components/app/profile-actions';
import { SaveButton } from '@/components/app/save-button';
import { loadActingPage } from '@/lib/data/guards';
import { getProfile, getViewableMedia } from '@/lib/data/discovery';
import { centimetresToFeet, translator } from '@/lib/i18n';

/**
 * One candidate, as this acting candidate is allowed to see them.
 *
 * The verdict decides how much of the page exists at all: an excluded pair gets
 * the reason and nothing else, because `get_candidate_profile` does not return
 * the record. Filtering it here instead would mean the data had already
 * travelled (spec §2).
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { context, lang, acting } = await loadActingPage();
  const { id } = await params;
  const t = translator(lang);

  const profile = await getProfile(acting.id, id);
  const excluded = !profile.id;

  const photos = profile.photos?.can_view
    ? await getViewableMedia(acting.id, id, 'photo')
    : [];

  const biodata = profile.biodata ?? {};
  const height = centimetresToFeet(biodata.height);

  const rows: [string, string | null | undefined][] = [
    [t('ઉંમર / ઊંચાઈ', 'Age / height'), [profile.age, height].filter(Boolean).join(' · ') || null],
    [t('શહેર', 'City'), profile.city],
    [t('અભ્યાસ', 'Education'), biodata.degree || biodata.education],
    [t('વ્યવસાય', 'Occupation'), biodata.role || biodata.work],
    [t('પેટા સમાજ', 'Sub-community'), profile.subCommunity],
    [t('સંપ્રદાય', 'Sect'), profile.sect],
    [t('મોસાળ', 'Mosal'), profile.mosalFamily],
    [t('મૂળ વતન', 'Native place'), profile.nativePlace],
  ];

  return (
    <AppShell lang={lang} context={context} acting={acting} member>
      <section className="screen-pad">
        <Link className="back-link" href="/discover">
          <ArrowLeft size={17} />
          {t('શોધ પર પાછા', 'Back to Discover')}
        </Link>

        {excluded ? (
          <div className="empty">
            <LockKeyhole size={34} />
            <h3>{t('આ પ્રોફાઇલ ઉપલબ્ધ નથી', 'This profile is not available')}</h3>
            <p>{lang === 'en' ? profile.explanation.en : profile.explanation.gu}</p>
            <Link className="secondary" href="/discover">
              {t('બીજી પ્રોફાઇલ જુઓ', 'Browse other profiles')}
            </Link>
          </div>
        ) : (
          <>
            <div className="profile-cover c1">
              {/* Plain <img>, not next/image, and deliberately so: these are
                  short-lived signed URLs for private objects. Next's image
                  optimiser would fetch and cache a copy at a stable, unsigned
                  URL, which would outlive the grant that produced it. */}
              {photos[0]
                // oxlint-disable-next-line nextjs/no-img-element
                ? <img src={photos[0].url} alt="" />
                : <span className="monogram">{profile.fullName?.charAt(0)}</span>}
              <span className="cover-id">{profile.publicCode}</span>
              <SaveButton lang={lang} candidateId={id} saved={profile.saved ?? false} />
              {photos.length === 0 && (
                <span className="photo-lock">
                  <LockKeyhole size={12} />
                  {t('ફોટો ખાનગી છે', 'Photo is private')}
                </span>
              )}
            </div>

            {photos.length > 1 && (
              <div className="photo-strip">
                {photos.slice(1).map((photo) => (
                  // oxlint-disable-next-line nextjs/no-img-element
                  <img key={photo.id} src={photo.url} alt="" />
                ))}
              </div>
            )}

            <div className="page-title">
              <span className="eyebrow">
                <ShieldCheck size={13} />
                {t('ચકાસાયેલ સભ્ય', 'Verified member')}
              </span>
              <h1>{profile.fullName}</h1>
            </div>

            <div className="detail-list spaced">
              {rows
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <b>{value}</b>
                  </div>
                ))}
            </div>

            {/* Spec §8: released by an accepted introduction, and only then. */}
            {(profile.contacts?.length ?? 0) > 0 && (
              <>
                <div className="section-head">
                  <h2>{t('સંપર્ક', 'Contact')}</h2>
                </div>
                <div className="detail-list spaced">
                  {profile.contacts!.map((contact) => (
                    <div key={contact.phone}>
                      <span className="inline-icon">
                        <Phone size={13} />
                        {contact.display_name || contact.kind}
                      </span>
                      <b>+91 {contact.phone}</b>
                    </div>
                  ))}
                </div>
              </>
            )}

            <ProfileActions
              lang={lang}
              actingId={acting.id}
              canSendInterest={acting.discoverable}
              profile={profile}
            />
          </>
        )}
      </section>
    </AppShell>
  );
}
