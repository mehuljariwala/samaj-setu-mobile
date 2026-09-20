import Link from 'next/link';
import { ArrowLeft, Check, LockKeyhole, MapPin, ShieldCheck } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { loadPublicPage } from '@/lib/data/guards';
import { translator } from '@/lib/i18n';
import { TRUST } from '@/lib/org';

/**
 * Reachable signed out, because spec §2 allows "essential policy and support
 * information" in every access state — including rejected and suspended.
 */
export default async function SupportPage() {
  const { context, lang, acting } = await loadPublicPage();
  const t = translator(lang);
  const member = context.access_state === 'approved';

  // The trust is who a member writes to when the app itself cannot help, so its
  // details belong on this screen. Rows with nothing filled in are dropped.
  const address = t(TRUST.address.gu, TRUST.address.en);
  const contactRows: [string, string][] = [
    [t('ટ્રસ્ટ', 'Trust'), t(TRUST.name.gu, TRUST.name.en)],
    [t('રજિ. નં.', 'Reg. No.'), TRUST.registrationNumber],
    [t('ફોન', 'Phone'), TRUST.phone && `+91 ${TRUST.phone}`],
    [t('ઈમેલ', 'Email'), TRUST.email],
  ];

  return (
    <AppShell lang={lang} context={context} acting={acting} member={member}>
      <section className="screen-pad">
        <Link className="back-link" href={member ? '/home' : '/'}>
          <ArrowLeft size={17} />
          {t('પાછા', 'Back')}
        </Link>

        <div className="page-title">
          <span className="eyebrow">{t('ગોપનીયતા અને મદદ', 'Privacy & help')}</span>
          <h1>{t('અમે મદદ માટે છીએ', 'We’re here to help')}</h1>
        </div>

        <div className="trust-card flush">
          <ShieldCheck size={26} strokeWidth={1.5} />
          <div>
            <h3>{t('ખાનગી શરૂઆત, વિશ્વાસ સાથે.', 'A private start, built on trust.')}</h3>
            <p>{t('પ્રમાણપત્ર ફક્ત એડમિન માટે. ફોટા તમારી મંજૂરીથી. સંપર્ક પરસ્પર સંમતિથી.', 'Certificates are for admins only. Photos need your permission. Contacts need mutual consent.')}</p>
          </div>
        </div>

        <div className="detail-list spaced">
          <div>
            <span>{t('તમારો મોબાઇલ નંબર', 'Your mobile number')}</span>
            <b>{t('OTP મોકલાતો નથી; એડમિન પ્રમાણપત્રથી ઓળખ ચકાસે છે.', 'No OTP is sent; an admin verifies you from the certificate.')}</b>
          </div>
          <div>
            <span>{t('જન્મ પ્રમાણપત્ર', 'Birth certificate')}</span>
            <b>{t('ફક્ત ચકાસણી એડમિન જોઈ શકે — તમે પણ નહીં.', 'Only verification admins can open it — not even you.')}</b>
          </div>
          <div>
            <span>{t('ફોટા', 'Photographs')}</span>
            <b>{t('તમે જેને મંજૂરી આપો તેને જ. મંજૂરી ગમે ત્યારે પાછી ખેંચી શકાય.', 'Only people you approve. Approval can be withdrawn at any time.')}</b>
          </div>
          <div>
            <span>{t('સંપર્ક નંબર', 'Contact numbers')}</span>
            <b>{t('પરિચય સ્વીકારાયા પછી જ, અને તમારી પસંદગી હોય તો જ.', 'Only after an introduction is accepted, and only if you allow it.')}</b>
          </div>
        </div>

        <div className="note">
          <LockKeyhole size={19} />
          <p>
            {t(
              'મંજૂરી પાછી ખેંચવાથી આગળની ઍક્સેસ બંધ થાય છે. જે કોઈએ પહેલેથી જોઈ કે સાચવી લીધું હોય તે પાછું લઈ શકાતું નથી — સ્ક્રીનશૉટ રોકી શકાતા નથી.',
              'Withdrawing permission stops future access. It cannot recall what someone has already seen or saved — screenshots cannot be prevented.',
            )}
          </p>
        </div>

        <div className="note brand">
          <Check size={19} />
          <p>{t('મુખ્ય સેવાઓ સમાજ માટે હંમેશાં નિઃશુલ્ક છે.', 'The core service is, and stays, free for our community.')}</p>
        </div>

        <div className="section-head">
          <h2>{t('સંપર્ક', 'Contact')}</h2>
        </div>
        <div className="detail-list spaced">
          {contactRows
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <b>{value}</b>
              </div>
            ))}
          {address && (
            <div>
              <span className="inline-icon">
                <MapPin size={13} />
                {t('સરનામું', 'Address')}
              </span>
              <b className="address">{address}</b>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
