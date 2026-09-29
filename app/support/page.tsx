import Link from 'next/link';
import {
  ArrowLeft, BadgeIndianRupee, Camera, ChevronDown, FileLock2, Hash, KeyRound, Landmark, LockKeyhole, Mail,
  MapPin, MessageCircle, Phone, PhoneCall, ShieldCheck,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { SupportArt } from '@/components/onboarding/art';
import { homeFor, loadPublicPage } from '@/lib/data/guards';
import { translator } from '@/lib/i18n';
import { TRUST, formatPhone } from '@/lib/org';

/**
 * Reachable signed out, because spec §2 allows "essential policy and support
 * information" in every access state — including rejected and suspended.
 *
 * The screen leads with people, not policy: the volunteers who pick up the
 * phone come first, each with a call and a WhatsApp button, then the answers
 * families ask those volunteers most, then the trust behind the service.
 */
export default async function SupportPage() {
  const { context, lang, acting } = await loadPublicPage();
  const t = translator(lang);
  const member = context.access_state === 'approved';

  // A little colour per volunteer, so a list of seven names is easy to scan.
  const tones = ['rose', 'gold', 'green', 'blue', 'violet'];

  const promises = [
    {
      Icon: FileLock2,
      title: t('પ્રમાણપત્ર ફક્ત એડમિન માટે', 'Certificates are for admins only'),
      body: t('જન્મ પ્રમાણપત્ર કે લિવિંગ સર્ટિફિકેટ ફક્ત ચકાસણી એડમિન જોઈ શકે — તમે પણ નહીં.', 'Only verification admins can open your birth or leaving certificate — not even you.'),
    },
    {
      Icon: Camera,
      title: t('ફોટા તમારી મંજૂરીથી', 'Photos need your permission'),
      body: t('તમે જેને મંજૂરી આપો તેને જ દેખાય. મંજૂરી ગમે ત્યારે પાછી ખેંચી શકાય.', 'Only people you approve see them, and you can withdraw that at any time.'),
    },
    {
      Icon: PhoneCall,
      title: t('નંબર પરસ્પર સંમતિથી', 'Numbers need mutual consent'),
      body: t('પરિચય સ્વીકારાયા પછી જ, અને તમારી પસંદગી હોય તો જ.', 'Only after an introduction is accepted, and only if you allow it.'),
    },
  ];

  // The questions volunteers are actually rung up about, answered once here.
  const questions = [
    {
      Icon: KeyRound,
      q: t('પાસવર્ડ ભૂલી ગયા છો?', 'Forgot your password?'),
      a: t(
        'તમારા નોંધાયેલા નંબરથી ઉપરના કોઈપણ સ્વયંસેવકને ફોન અથવા WhatsApp કરો. તેઓ નવો પાસવર્ડ સેટ કરીને તમને WhatsApp પર મોકલશે — પછી એનાથી લૉગ ઇન કરો.',
        'Call or WhatsApp any volunteer above from your registered number. They will set a new password and send it to you on WhatsApp — then sign in with it.',
      ),
    },
    {
      Icon: ShieldCheck,
      q: t('મંજૂરીમાં કેટલો સમય લાગે?', 'How long does approval take?'),
      a: t(
        'સામાન્ય રીતે 24 કલાકમાં. વધુ સમય લાગે તો એડમિનને આપોઆપ જાણ થાય છે — તમારે કંઈ કરવાનું નથી.',
        'Usually within 24 hours. If it takes longer an admin is alerted automatically — there is nothing you need to do.',
      ),
    },
    {
      Icon: Phone,
      q: t('OTP કેમ નથી આવતો?', 'Why is there no OTP?'),
      a: t(
        'OTP મોકલાતો નથી. સમાજના એડમિન તમારા જન્મ પ્રમાણપત્ર (અથવા લિવિંગ સર્ટિફિકેટ) અને ઓળખપત્રથી ઓળખ ચકાસે છે.',
        'No OTP is sent. A samaj admin verifies you from your birth or leaving certificate and photo ID instead.',
      ),
    },
    {
      Icon: LockKeyhole,
      q: t('મંજૂરી પાછી ખેંચું તો શું થાય?', 'What if I withdraw permission?'),
      a: t(
        'આગળની ઍક્સેસ તરત બંધ થાય છે. જે કોઈએ પહેલેથી જોઈ કે સાચવી લીધું હોય તે પાછું લઈ શકાતું નથી — સ્ક્રીનશૉટ રોકી શકાતા નથી.',
        'Future access stops at once. It cannot recall what someone has already seen or saved — screenshots cannot be prevented.',
      ),
    },
    {
      Icon: BadgeIndianRupee,
      q: t('કોઈ ચાર્જ છે?', 'Is there any charge?'),
      a: t(
        'ના. મુખ્ય સેવાઓ સમાજ માટે હંમેશાં નિઃશુલ્ક છે. કોઈ પૈસા માંગે તો તરત સ્વયંસેવકને જાણ કરો.',
        'No. The core service is, and stays, free for our community. If anyone asks you for money, tell a volunteer straight away.',
      ),
    },
  ];

  // The trust is who a member writes to when the app itself cannot help, so its
  // details belong on this screen. Rows with nothing filled in are dropped.
  const address = t(TRUST.address.gu, TRUST.address.en);
  const trustRows: [typeof Landmark, string, string][] = [
    [Landmark, t('ટ્રસ્ટ', 'Trust'), t(TRUST.name.gu, TRUST.name.en)],
    [Hash, t('રજી. નં.', 'Reg. No.'), t(TRUST.registrationNumber.gu, TRUST.registrationNumber.en)],
    [Phone, t('ફોન', 'Phone'), TRUST.phone && `+91 ${TRUST.phone}`],
    [Mail, t('ઈમેલ', 'Email'), TRUST.email],
  ];

  return (
    <AppShell lang={lang} context={context} acting={acting} member={member} help={false}>
      <section className="member-screen support-screen tone-rose">
        <div className="admin-detail-top">
          <Link className="round-button" href={homeFor(context)} aria-label={t('પાછા', 'Back')}>
            <ArrowLeft size={20} />
          </Link>
          <span>{t('મદદ અને ગોપનીયતા', 'Help & privacy')}</span>
        </div>

        <div className="review-stage support-stage">
          <SupportArt t={t} />
        </div>

        <div className="review-copy">
          <span className="review-badge">
            <i />
            {t('હંમેશાં નિઃશુલ્ક', 'Always free')}
          </span>
          <h1>{t('અમે મદદ માટે છીએ', 'We’re here to help')}</h1>
          <p>
            {t(
              'કંઈ પણ અટકે તો સમાજના કોઈપણ સ્વયંસેવકને ફોન કે WhatsApp કરો — ગુજરાતીમાં, નિરાંતે.',
              'Stuck on anything? Call or WhatsApp any samaj volunteer — in Gujarati, at your own pace.',
            )}
          </p>
        </div>

        {/* The samaj's own notice lists volunteers rather than one office line,
            so each is a row you can call from — the number is the whole point
            of the section, and on a phone reading it out to dial is absurd. */}
        <div className="admin-h2 with-count">
          <h2>{t('કોને ફોન કરવો', 'Who to call')}</h2>
          <span className="ok">{TRUST.helpline.length}</span>
        </div>
        <ul className="support-people">
          {TRUST.helpline.map((person, i) => {
            const name = t(person.name.gu, person.name.en);
            return (
              <li key={person.phone} className={`tone-${tones[i % tones.length]}`} style={{ '--i': i } as React.CSSProperties}>
                <span className="support-avatar" aria-hidden="true">{name.charAt(0)}</span>
                <span className="support-who">
                  <b>{name}</b>
                  <small>{formatPhone(person.phone)}</small>
                </span>
                <a
                  className="support-act wa"
                  href={`https://wa.me/91${person.phone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t(`${name}ને WhatsApp કરો`, `WhatsApp ${name}`)}
                >
                  <MessageCircle size={19} />
                </a>
                <a className="support-act call" href={`tel:+91${person.phone}`} aria-label={t(`${name}ને ફોન કરો`, `Call ${name}`)}>
                  <Phone size={19} />
                </a>
              </li>
            );
          })}
        </ul>

        <h2 className="admin-h2">{t('અમારાં વચન', 'Our promises')}</h2>
        <ul className="support-promises">
          {promises.map(({ Icon, title, body }, i) => (
            <li key={title} style={{ '--i': i } as React.CSSProperties}>
              <span className="support-promise-icon"><Icon size={20} /></span>
              <span>
                <b>{title}</b>
                <small>{body}</small>
              </span>
            </li>
          ))}
        </ul>

        <h2 className="admin-h2">{t('વારંવાર પૂછાતા પ્રશ્નો', 'Common questions')}</h2>
        <div className="support-faq">
          {questions.map(({ Icon, q, a }) => (
            <details key={q}>
              <summary>
                <span className="support-faq-icon"><Icon size={17} /></span>
                <b>{q}</b>
                <ChevronDown size={18} className="support-faq-chevron" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>

        <h2 className="admin-h2">{t('સેવા પાછળનું ટ્રસ્ટ', 'The trust behind the service')}</h2>
        <dl className="admin-facts-card support-trust">
          {trustRows
            .filter(([, , value]) => value)
            .map(([Icon, label, value]) => (
              <div key={label}>
                <dt><Icon size={16} />{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          {address && (
            <div className="support-address">
              <dt><MapPin size={16} />{t('સરનામું', 'Address')}</dt>
              <dd>{address}</dd>
            </div>
          )}
        </dl>
      </section>
    </AppShell>
  );
}
