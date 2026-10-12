import { Gauge } from 'lucide-react';

import type { FreePlanUsage } from '@/lib/data/admin';
import { timeAgo, translator, type Lang } from '@/lib/i18n';

const MB = 1024 * 1024;
const GB = 1024 * MB;
/** Supabase's free plan as of October 2026. */
const STORAGE_LIMIT = GB;
const DATABASE_LIMIT = 500 * MB;
const MONTHLY_EGRESS = 5 * GB;

const size = (bytes: number) =>
  bytes >= GB ? `${Number((bytes / GB).toFixed(1))} GB` : `${Math.round(bytes / MB)} MB`;

/**
 * How close the platform is to the free plan's limits, on the admin home.
 *
 * The trust cannot pay, and Supabase switches a free project off for the rest
 * of the month once it passes a limit — it did in October 2026. One closed
 * line normally; open, and coloured, once anything passes 70%, so a volunteer
 * notices weeks before it matters.
 */
export function FreePlanUsageCard({
  lang,
  usage,
  photoAllowance,
}: {
  lang: Lang;
  usage: FreePlanUsage;
  /** Bytes /media may fetch from storage in a day. */
  photoAllowance: number;
}) {
  const t = translator(lang);
  const rows = [
    { key: 'files', label: t('ફાઇલો', 'Files'), used: usage.storage_bytes, limit: STORAGE_LIMIT },
    { key: 'database', label: t('ડેટાબેઝ', 'Database'), used: usage.database_bytes, limit: DATABASE_LIMIT },
    { key: 'photos', label: t('આજના ફોટા', 'Photos today'), used: usage.photo_bytes_today, limit: photoAllowance },
  ];
  const share = (used: number, limit: number) => Math.min(100, Math.round((used / limit) * 100));
  const worst = Math.max(...rows.map((row) => share(row.used, row.limit)));

  return (
    <details className={`usage-card${worst >= 90 ? ' bad' : worst >= 70 ? ' warn' : ''}`} open={worst >= 70}>
      <summary>
        <span className="admin-account-icon"><Gauge size={18} /></span>
        <span>
          <b>{t('મફત પ્લાન', 'Free plan')}</b>
          <small>{rows.map((row) => `${row.label} ${share(row.used, row.limit)}%`).join(' · ')}</small>
        </span>
      </summary>

      <dl>
        {rows.map((row) => (
          <div key={row.key}>
            <dt>{row.label}</dt>
            <dd>
              <meter
                min={0}
                max={row.limit}
                low={row.limit * 0.7}
                high={row.limit * 0.9}
                optimum={0}
                value={Math.min(row.used, row.limit)}
              />
              <small>{size(row.used)} / {size(row.limit)}</small>
            </dd>
          </div>
        ))}
      </dl>

      <p className="field-hint">
        {t(
          `આજની ફોટા મર્યાદા પૂરી થાય તો કાલ સુધી ફોટાની જગ્યાએ સાદું ચોરસ દેખાશે. છેલ્લા 30 દિવસમાં ફોટા: ${size(usage.photo_bytes_30_days)} (મહિનાની કુલ મર્યાદા ${size(MONTHLY_EGRESS)}). 70% થી વધુ થાય તો સાઇટ સંભાળનારને જણાવો.`,
          `When today’s photo allowance is used up, photos show as plain tiles until tomorrow. Photos in the last 30 days: ${size(usage.photo_bytes_30_days)} of the ${size(MONTHLY_EGRESS)} monthly limit. Past 70%, tell whoever looks after the site.`,
        )}
        {' '}
        {usage.last_maintenance
          ? t(
            `છેલ્લી રાત્રિ સફાઈ (${timeAgo(usage.last_maintenance.ran_at, lang)}): ${usage.last_maintenance.files} ન વપરાતી ફાઇલો, ${size(usage.last_maintenance.file_bytes)}.`,
            `Last nightly clean-up (${timeAgo(usage.last_maintenance.ran_at, lang)}): ${usage.last_maintenance.files} unused files, ${size(usage.last_maintenance.file_bytes)}.`,
          )
          : t('રાત્રિ સફાઈ હજી ચાલી નથી.', 'The nightly clean-up has not run yet.')}
      </p>
    </details>
  );
}
