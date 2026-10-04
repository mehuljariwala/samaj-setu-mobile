import { Clock3, GraduationCap, Heart, Phone, ShieldCheck, TriangleAlert, UserRound, Users } from 'lucide-react';

import { displayValue, fieldByKey } from '@/components/biodata/model';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';
import { formatPhone } from '@/lib/org';

/**
 * The same six topics the family fills in (components/biodata/guided-form.tsx),
 * so the admin reads the biodata in the order it was written.
 */
const SECTIONS = [
  { id: 'about', gu: 'વ્યક્તિગત', en: 'About', Icon: UserRound, keys: ['gender', 'height', 'marital', 'diet'] },
  { id: 'community', gu: 'સમાજ અને મોસાળ', en: 'Community and mosal', Icon: Users, keys: ['community', 'sect', 'surname', 'mosal'] },
  { id: 'work', gu: 'અભ્યાસ અને કામ', en: 'Studies and work', Icon: GraduationCap, keys: ['education', 'degree', 'work', 'role', 'employer'] },
  { id: 'family', gu: 'પરિવાર', en: 'Family', Icon: Heart, keys: ['mother', 'native', 'brothers', 'sisters'] },
  { id: 'birth', gu: 'જન્મ અને જ્યોતિષ', en: 'Birth and horoscope', Icon: Clock3, keys: ['birthplace', 'birthtime', 'rashi', 'gan', 'mangal'] },
  { id: 'contact', gu: 'સંપર્ક', en: 'Contact', Icon: Phone, keys: ['contactKind', 'phone', 'extraPhone'] },
] as const;

/**
 * A biodata as the admin reads it: one short card per topic, two facts to a
 * row, in the form's own words rather than the database's keys. Contact
 * fields are included because a reviewer checks them; members only ever see
 * the directory copy, which strips them.
 *
 * `flagged` marks the fields an admin has asked to be fixed. `communityConfirmed`
 * says whether the family confirmed the four community details that matching
 * rules read (spec §7); left out, nothing is said. `age` comes from the date of
 * birth, never from the biodata, and leads the first card.
 */
export function BiodataView({
  lang,
  data,
  flagged = [],
  communityConfirmed,
  age,
}: {
  lang: Lang;
  data: Record<string, string>;
  flagged?: string[];
  communityConfirmed?: boolean;
  age?: number | null;
}) {
  const t = translator(lang);
  const en = lang === 'en';

  const value = (key: string) => {
    const raw = data[key];
    if (key === 'height') {
      const inches = Math.round(Number(raw) / 2.54);
      return `${Math.floor(inches / 12)}′ ${inches % 12}″ · ${raw} ${t('સે.મી.', 'cm')}`;
    }
    if (key === 'phone' || key === 'extraPhone') return formatPhone(raw);
    const field = fieldByKey.get(key);
    return field ? displayValue(field, raw, en) : raw;
  };

  return (
    <div className="bio-cards">
      {SECTIONS.map((section) => {
        const filled = section.keys.filter((key) => data[key]?.trim());
        const showAge = section.id === 'about' && age != null;
        return (
          <section key={section.id} className="bio-card">
            <h3>
              <span className="bio-card-icon"><section.Icon size={16} /></span>
              {t(section.gu, section.en)}
              {section.id === 'community' && communityConfirmed !== undefined && (
                <em className={communityConfirmed ? 'ok' : 'warn'}>
                  {communityConfirmed ? <ShieldCheck size={13} /> : <TriangleAlert size={13} />}
                  {communityConfirmed ? t('પુષ્ટિ કરેલ', 'Confirmed') : t('પુષ્ટિ બાકી', 'Not confirmed')}
                </em>
              )}
            </h3>
            {filled.length === 0 && !showAge ? (
              <p className="bio-card-empty">{t('ભર્યું નથી', 'Not filled in')}</p>
            ) : (
              <dl>
                {showAge && (
                  <div>
                    <dt>{t('ઉંમર', 'Age')}</dt>
                    <dd>{t(`${age} વર્ષ`, `${age} yrs`)}</dd>
                  </div>
                )}
                {filled.map((key) => {
                  const field = fieldByKey.get(key);
                  return (
                    <div key={key} className={flagged.includes(key) ? 'flagged' : undefined}>
                      <dt>{field ? t(field.gu, field.en) : key}</dt>
                      <dd>{value(key)}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </section>
        );
      })}
    </div>
  );
}
