import { displayValue, fieldByKey } from '@/components/biodata/model';
import { formatDate } from '@/lib/age';
import type { Lang, T } from '@/lib/i18n';

export type BiodataChange = { label: string; before: string; after: string };

/**
 * What a change to an approved profile changes, for the admin deciding it:
 * registration details first, as those are checked against the documents,
 * then the biodata's own fields, in the form's words rather than its keys.
 */
export function whatChanged(t: T, lang: Lang, { revision, candidate, published }: {
  revision: { data: Record<string, string>; detail_changes: Record<string, string> };
  candidate: { full_name: string; date_of_birth: string; gender: string; father_name: string | null; city: string | null };
  published: { data: Record<string, string> } | null;
}): BiodataChange[] {
  const en = lang === 'en';
  const asDate = (value: string) => (value ? formatDate(value, lang) : '');
  const asGender = (value: string) =>
    value === 'male' ? t('પુરુષ', 'Male') : value === 'female' ? t('સ્ત્રી', 'Female') : value;
  const asIs = (value: string) => value;

  const registration: [string, string, string, (value: string) => string][] = [
    ['full_name', t('પૂરું નામ', 'Full name'), candidate.full_name, asIs],
    ['date_of_birth', t('જન્મ તારીખ', 'Date of birth'), candidate.date_of_birth, asDate],
    ['gender', t('લિંગ', 'Gender'), candidate.gender, asGender],
    ['father_name', t('પિતાનું પૂરું નામ', 'Father’s full name'), candidate.father_name ?? '', asIs],
    ['city', t('શહેર', 'City'), candidate.city ?? '', asIs],
  ];
  const rows = registration
    .filter(([key]) => revision.detail_changes[key] !== undefined)
    .map(([key, label, before, show]) => ({ label, before: show(before), after: show(revision.detail_changes[key]) }));

  const before = published?.data ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(revision.data)])]
    // The origin is stamped, not answered; a gender change is listed above.
    .filter((key) => key !== 'origin' && !(key === 'gender' && revision.detail_changes.gender));
  for (const key of keys) {
    const was = (before[key] ?? '').trim();
    const now = (revision.data[key] ?? '').trim();
    if (was === now) continue;
    const field = fieldByKey.get(key);
    const show = (value: string) => (field && value ? displayValue(field, value, en) : value);
    rows.push({ label: field ? (en ? field.en : field.gu) : key, before: show(was), after: show(now) });
  }
  return rows;
}
