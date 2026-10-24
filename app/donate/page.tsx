import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft, Building2, Download, Hash, HeartHandshake, Info, Landmark, MapPin, PhoneCall, QrCode, UserRound,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { CopyText } from '@/components/app/copy-text';
import { homeFor, loadPublicPage } from '@/lib/data/guards';
import { translator } from '@/lib/i18n';
import { TRUST } from '@/lib/org';

const QR = '/donate/chandan-trust-upi-qr.png';

/**
 * Giving to Chandan Charitable Trust, which runs Samaj Setu: the bank's own
 * UPI QR and the account for a bank transfer. Open to anyone, signed in or not.
 *
 * Help tells families the service is free and that anyone asking for money
 * should be reported, so this screen says first that giving is voluntary and
 * changes nothing about a profile.
 */
export default async function DonatePage() {
  const { context, lang, acting } = await loadPublicPage();
  const t = translator(lang);
  const member = context.access_state === 'approved';
  const give = TRUST.donation;

  const bankRows: { Icon: typeof Landmark; label: string; value: string; copy?: string }[] = [
    { Icon: UserRound, label: t('ખાતાનું નામ', 'Account name'), value: give.accountName },
    { Icon: Landmark, label: t('બેંક', 'Bank'), value: t(give.bank.gu, give.bank.en) },
    { Icon: MapPin, label: t('શાખા', 'Branch'), value: t(give.branch.gu, give.branch.en) },
    { Icon: Hash, label: t('ખાતા નંબર', 'Account number'), value: give.accountNumber, copy: t('ખાતા નંબર', 'account number') },
    { Icon: Building2, label: 'IFSC', value: give.ifsc, copy: 'IFSC' },
  ];

  return (
    <AppShell lang={lang} context={context} acting={acting} member={member}>
      <section className="member-screen donate-screen tone-gold">
        <div className="admin-detail-top">
          <Link className="round-button" href={homeFor(context)} aria-label={t('પાછા', 'Back')}>
            <ArrowLeft size={20} />
          </Link>
          <span>{t('દાન', 'Donate')}</span>
        </div>

        <div className="donate-hero">
          <span className="donate-hero-icon"><HeartHandshake size={30} strokeWidth={1.8} /></span>
          <span className="review-badge"><i />{t('સ્વૈચ્છિક દાન', 'A voluntary gift')}</span>
          <h1>{t('સમાજ સેતુને સહયોગ આપો', 'Support Samaj Setu')}</h1>
          <p>
            {t(
              `સમાજ સેતુ ${TRUST.name.gu}ના સહયોગથી ચાલે છે. તમારું દાન ટ્રસ્ટને આ સેવા સમાજ માટે ચાલુ રાખવામાં મદદ કરે છે.`,
              `Samaj Setu is run with the support of ${TRUST.name.en}. Your gift helps the trust keep this service going for the samaj.`,
            )}
          </p>
        </div>

        <p className="donate-free">
          <Info size={18} />
          <span>
            {t(
              'દાન ફરજિયાત નથી. સમાજ સેતુ વાપરવાનો કોઈ ચાર્જ નથી, અને દાનથી કોઈ પ્રોફાઇલ કે મંજૂરી પર અસર થતી નથી.',
              'Giving is never required. Samaj Setu has no charge, and a gift makes no difference to any profile or approval.',
            )}
          </span>
        </p>

        <h2 className="admin-h2">{t('UPI થી', 'By UPI')}</h2>
        <div className="donate-qr-card">
          <div className="donate-qr-head">
            <small>{t(give.bank.gu, give.bank.en)}</small>
            <b>{give.accountName}</b>
            <span><QrCode size={15} />{t('સ્કૅન કરો અને દાન આપો', 'Scan and pay')}</span>
          </div>
          <div className="donate-qr-frame">
            {/* The bank's own QR, served as it is: resizing could blur a module. */}
            <Image src={QR} width={232} height={232} unoptimized alt={t(`${TRUST.name.gu}નો UPI QR કોડ`, `${TRUST.name.en} UPI QR code`)} />
          </div>
          <div className="donate-upi">
            <span>
              <small>UPI ID</small>
              <code>{give.upiId}</code>
            </span>
            <CopyText lang={lang} value={give.upiId} label="UPI ID" />
          </div>
          <p className="donate-apps">
            {t('Google Pay, PhonePe, Paytm, BHIM કે કોઈ પણ UPI એપથી.', 'With Google Pay, PhonePe, Paytm, BHIM or any UPI app.')}
          </p>
          <a className="text-button bordered donate-save" href={QR} download="chandan-charitable-trust-upi-qr.png">
            <Download size={17} />{t('QR ફોનમાં સાચવો', 'Save the QR to your phone')}
          </a>
          <p className="donate-hint">
            {t(
              'આ જ ફોનથી આપવું હોય તો QR સાચવો, પછી UPI એપમાં “ગૅલેરીમાંથી સ્કૅન” વડે ખોલો.',
              'Giving from this same phone? Save the QR, then open it in your UPI app with “scan from gallery”.',
            )}
          </p>
        </div>

        <h2 className="admin-h2">{t('બેંક ટ્રાન્સફરથી', 'By bank transfer')}</h2>
        <dl className="admin-facts-card donate-bank">
          {bankRows.map(({ Icon, label, value, copy }) => (
            <div key={label}>
              <dt><Icon size={16} />{label}</dt>
              <dd>
                <span>{value}</span>
                {copy && <CopyText lang={lang} value={value} label={copy} />}
              </dd>
            </div>
          ))}
        </dl>

        <Link className="donate-ask" href="/support">
          <PhoneCall size={18} />
          <span>
            {t('દાન વિશે કંઈ પૂછવું છે? કોઈ પણ સ્વયંસેવકને ફોન કરો.', 'A question about giving? Call any volunteer.')}
          </span>
        </Link>
      </section>
    </AppShell>
  );
}
