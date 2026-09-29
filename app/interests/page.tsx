import Link from 'next/link';
import { ArrowRight, ChevronRight, Eye, HeartHandshake, Phone } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { InterestReply, PhotoRequestReply } from '@/components/app/interest-actions';
import { InterestsEmptyArt } from '@/components/onboarding/art';
import { interestStatusLabel } from '@/lib/admin-labels';
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
    received: t('મળેલા', 'Received'),
    sent: t('મોકલેલા', 'Sent'),
    accepted: t('સ્વીકાર્યા', 'Accepted'),
  };
  const waiting = acting.pending_interests + acting.pending_photo_requests;

  return (
    <AppShell lang={lang} context={context} acting={acting} member>
      <section className={`member-screen tone-${waiting > 0 ? 'gold' : 'rose'}`}>
        <div className="member-hero">
          <div className="admin-hero-copy">
            <span className="admin-hello">
              <HeartHandshake size={15} />
              {t('પરિચય', 'Introductions')}
            </span>
            <h1>
              {waiting === 0
                ? t('નવું કંઈ નથી', 'Nothing new for now')
                : waiting === 1
                  ? t('1 પરિવાર જવાબની રાહ જુએ છે', '1 family is waiting to hear back')
                  : t(`${waiting} પરિવાર જવાબની રાહ જુએ છે`, `${waiting} families are waiting to hear back`)}
            </h1>
            <p>{t('બંને પરિવારો હા પાડે પછી જ સંપર્ક દેખાય છે.', 'Contact details appear only after both families say yes.')}</p>
          </div>
          <span className="admin-dial" aria-hidden="true">
            {waiting > 0 && <span className="art-ripple" />}
            <b>{waiting}</b>
            <small>{t('નવા', 'new')}</small>
          </span>
        </div>

        <nav className="admin-tabs member-tabs" aria-label={t('પરિચય ફિલ્ટર', 'Introductions filter')}>
          {BOXES.map((value) => (
            <Link
              key={value}
              className={box === value ? 'on' : undefined}
              aria-current={box === value ? 'page' : undefined}
              href={value === 'received' ? '/interests' : `/interests?box=${value}`}
            >
              {label[value]}
              {value === 'received' && acting.pending_interests > 0 ? <i>{acting.pending_interests}</i> : null}
            </Link>
          ))}
        </nav>

        {/* Photo requests are a separate permission from contact consent, so
            they get their own section rather than looking like introductions. */}
        {pendingPhotos.length > 0 && (
          <>
            <div className="admin-h2 with-count">
              <h2>{t('ફોટો વિનંતીઓ', 'Photo requests')}</h2>
              <span className="gold">{pendingPhotos.length}</span>
            </div>
            <ul className="member-cards">
              {pendingPhotos.map((request, i) => (
                <li key={request.id} style={{ '--i': i } as React.CSSProperties}>
                  <article className="member-card">
                    <div className="admin-row-top">
                      <span className="avatar gold"><Eye size={19} /></span>
                      <span className="admin-row-name">
                        <b>{t('ફોટો જોવાની વિનંતી', 'Wants to see photos')}</b>
                        <small>{timeAgo(request.created_at, lang)}</small>
                      </span>
                    </div>
                    {request.message && <p className="member-quote">“{request.message}”</p>}
                    <PhotoRequestReply lang={lang} requestId={request.id} />
                  </article>
                </li>
              ))}
            </ul>
          </>
        )}

        {interests.length === 0 ? (
          <div className="admin-empty member-empty">
            <div className="admin-empty-stage"><InterestsEmptyArt /></div>
            <h2>
              {box === 'received'
                ? t('હજી કોઈ પરિચય નથી', 'No introductions yet')
                : box === 'sent'
                  ? t('તમે હજી કોઈ પરિચય મોકલ્યો નથી', 'You haven’t sent one yet')
                  : t('હજી કોઈ સ્વીકારાયો નથી', 'None accepted yet')}
            </h2>
            <p>
              {acting.discoverable
                ? t('પ્રોફાઇલ જુઓ અને યોગ્ય લાગે ત્યાં પરિચય મોકલો.', 'Browse profiles and introduce yourself where it feels right.')
                : t('તમારો બાયોડેટા મંજૂર થયા પછી પરિચય મોકલી શકશો.', 'Once your biodata is approved you can send introductions.')}
            </p>
            <Link className="cta member-cta" href={acting.discoverable ? '/discover' : '/biodata'}>
              {acting.discoverable ? t('પ્રોફાઇલ શોધો', 'Explore profiles') : t('બાયોડેટા પૂર્ણ કરો', 'Complete biodata')}
              <ArrowRight size={20} />
            </Link>
          </div>
        ) : (
          <ul className="member-cards">
            {interests.map((interest, i) => (
              <li key={interest.id} style={{ '--i': Math.min(i, 6) } as React.CSSProperties}>
                <article className={`member-card is-${interest.status}`}>
                  <Link className="admin-row-top" href={`/discover/${interest.counterpart.id}`}>
                    <span className="avatar">{interest.counterpart.fullName.charAt(0)}</span>
                    <span className="admin-row-name">
                      <b>{interest.counterpart.fullName}</b>
                      <small>
                        {[
                          interest.counterpart.age ? `${interest.counterpart.age} ${t('વર્ષ', 'yrs')}` : null,
                          interest.counterpart.city,
                          timeAgo(interest.createdAt, lang),
                        ].filter(Boolean).join(' · ')}
                      </small>
                    </span>
                    <span className="member-status">{interestStatusLabel(t, interest.status, interest.outgoing)}</span>
                    <ChevronRight size={19} className="admin-row-go" />
                  </Link>

                  {interest.message && <p className="member-quote">“{interest.message}”</p>}

                  {interest.contactVisible && (
                    <Link className="member-contact" href={`/discover/${interest.counterpart.id}`}>
                      <Phone size={15} />
                      {t('સંપર્ક નંબર જુઓ', 'See contact numbers')}
                    </Link>
                  )}

                  {box === 'received' && interest.status === 'pending' && (
                    <InterestReply lang={lang} interestId={interest.id} />
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
