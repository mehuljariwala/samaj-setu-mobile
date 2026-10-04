import { allFields, displayValue } from '@/components/biodata/model';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * A biodata as the admin reads it: every filled field in the form's own order
 * and words, not the database's keys. Contact fields are included because a
 * reviewer checks them; members only ever see the directory copy, which
 * strips them.
 *
 * `flagged` marks the fields an admin has asked to be fixed.
 */
export function BiodataView({
  lang,
  data,
  flagged = [],
}: {
  lang: Lang;
  data: Record<string, string>;
  flagged?: string[];
}) {
  const t = translator(lang);
  const en = lang === 'en';
  const filled = allFields.filter((field) => data[field.key]?.trim());

  if (filled.length === 0) {
    return <p className="admin-privacy">{t('બાયોડેટા હજી ભર્યો નથી.', 'No biodata filled in yet.')}</p>;
  }

  return (
    <div className="detail-list spaced">
      {filled.map((field) => (
        <div key={field.key} className={flagged.includes(field.key) ? 'flagged' : undefined}>
          <span>{t(field.gu, field.en)}</span>
          <b>{displayValue(field, data[field.key], en)}</b>
        </div>
      ))}
    </div>
  );
}
