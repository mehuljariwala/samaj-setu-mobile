import type { Lang } from '@/lib/i18n';

/**
 * Age is never stored or typed in: it is worked out from the date of birth
 * the family gave at registration, so it can never disagree with it and
 * stays right as birthdays pass.
 */

/** Whole years since a YYYY-MM-DD birth date, or null when it cannot be read. */
export function ageFrom(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const born = new Date(iso);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) age -= 1;
  return age;
}

/** A date the way families write it: "12 Apr 1996". */
export function formatDate(iso: string, lang: Lang): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(lang === 'gu' ? 'gu-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
