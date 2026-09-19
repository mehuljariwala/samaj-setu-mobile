import Link from 'next/link';
import { ArrowRight, Eye, HeartHandshake, Phone } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { InterestReply, PhotoRequestReply } from '@/components/app/interest-actions';
import { loadActingPage } from '@/lib/data/guards';
import { listInterests, type InterestBox } from '@/lib/data/interests';
import { listMediaRequests } from '@/lib/data/media';
import { timeAgo, translator } from '@/lib/i18n';

const BOXES: InterestBox[] = ['received', 'sent', 'accepted'];

/**
 * Spec §6: received, sent and accepted, scoped to the acting candidate. Two
 * siblings managed from the same account have separate inboxes, which is why
 * every query here takes the acting candidate id.
 */
export default async function InterestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, lang, acting } = await loadActingPage();
  const params = await searchParams;
  const t = translator(lang);

  const requested = typeof params.box === 'string' ? params.box : 'received';
  const box: InterestBox = BOXES.includes(requested as InterestBox)
    ? (requested as InterestBox)
    : 'received';

  const [interests, photoRequests] = await Promise.all([
    listInterests(acting.id, box),
    box === 'received' ? listMediaRequests(acting.id) : Promise.resolve([]),
  ]);

  const pendingPhotos = photoRequests.filter((request) => request.status === 'pending');

  const label: Record<InterestBox, string> = {
    received: t('મળેલી', 'Received'),
    sent: t('મોકલેલી', 'Sent'),
    accepted: t('સ્વીકારેલી', 'Accepted'),
  };

  return (
    <AppShell lang={lang} context={context} acting={acting} member>
      <section className="screen-pad">
        <div className="page-title">
          <span className="eyebrow">{acting.full_name}</span>
          <h1>{t('રસની વિનંતીઓ', 'Introductions')}</h1>
          <p>{t('બંને પરિવારોની સંમતિ પછી જ સંપર્ક દેખાય છે.', 'Contact details appear only after both families agree.')}</p>
        </div>

        <div className="chips">
          {BOXES.map((value) => (
            <Link
              key={value}
              className={`chip ${box === value ? 'on' : ''}`}
              href={`/interests?box=${value}`}
            >
              {label[value]}
            </Link>
          ))}
        </div>

        {/* Photo requests are a separate permission from contact consent, so
            they get their own section rather than looking like introductions. */}
        {pendingPhotos.length > 0 && (
          <>
            <div className="section-head">
              <h2>{t('ફોટો વિનંતીઓ', 'Photo requests')}</h2>
              <span>{pendingPhotos.length}</span>
            </div>
            {pendingPhotos.map((request) => (
              <div className="card row-card" key={request.id}>
                <span className="avatar"><Eye size={18} /></span>
                <div>
                  <b>{t('એક પરિવારે ફોટો જોવાની વિનંતી કરી છે', 'A family has asked to see photos')}</b>
                  <small>{timeAgo(request.created_at, lang)}</small>
                  {request.message && <small>{request.message}</small>}
                  <PhotoRequestReply lang={lang} requestId={request.id} />
                </div>
              </div>
            ))}
          </>
        )}

        {interests.length === 0 ? (
          <div className="empty">
            <HeartHandshake size={40} strokeWidth={1.4} />
            <h3>
              {box === 'received'
                ? t('હજી કોઈ વિનંતી નથી.', 'No introductions yet.')
                : box === 'sent'
                  ? t('તમે હજી કોઈ પરિચય મોકલ્યો નથી.', 'You haven’t sent an introduction yet.')
                  : t('હજી કોઈ સ્વીકારાયેલો પરિચય નથી.', 'No accepted introductions yet.')}
            </h3>
            <p>
              {acting.discoverable
                ? t('પ્રોફાઇલ જુઓ અને યોગ્ય લાગે ત્યાં પરિચય મોકલો.', 'Browse profiles and introduce yourself where it feels right.')
                : t('તમારો બાયોડેટા મંજૂર થયા પછી પરિચય મોકલી શકશો.', 'Once your biodata is approved you will be able to send introductions.')}
            </p>
            <Link className="primary" href={acting.discoverable ? '/discover' : '/biodata'}>
              {acting.discoverable ? t('પ્રોફાઇલ શોધો', 'Explore profiles') : t('બાયોડેટા પૂર્ણ કરો', 'Complete biodata')}
              <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          interests.map((interest) => (
            <article className="card row-card" key={interest.id}>
              <span className="avatar">{interest.counterpart.fullName.charAt(0)}</span>
              <div>
                <b>{interest.counterpart.fullName}</b>
                <small>
                  {interest.counterpart.publicCode}
                  {interest.counterpart.age ? ` · ${interest.counterpart.age} ${t('વર્ષ', 'yrs')}` : ''}
                  {interest.counterpart.city ? ` · ${interest.counterpart.city}` : ''}
                  {' · '}
                  {timeAgo(interest.createdAt, lang)}
                </small>

                {interest.message && <small>“{interest.message}”</small>}

                {interest.contactVisible && (
                  <small className="inline-icon">
                    <Phone size={12} />
                    {t('સંપર્ક ઉપલબ્ધ છે', 'Contact details available')}
                  </small>
                )}

                {box === 'received' && interest.status === 'pending' && (
                  <InterestReply lang={lang} interestId={interest.id} />
                )}

                <Link className="text-button" href={`/discover/${interest.counterpart.id}`}>
                  {t('પ્રોફાઇલ જુઓ', 'View profile')}
                  <ArrowRight size={15} />
                </Link>
              </div>
            </article>
          ))
        )}
      </section>
    </AppShell>
  );
}
