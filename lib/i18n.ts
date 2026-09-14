/**
 * Gujarati is the default; English is a switch that must preserve progress
 * (spec §11). Keeping the choice in a cookie rather than localStorage means the
 * server already knows it when it renders, so there is no flash of the wrong
 * language and no hydration mismatch.
 *
 * For a signed-in member the cookie is mirrored into `accounts.preferred_language`,
 * so the choice follows them to a new device.
 */
export type Lang = 'gu' | 'en';

export const LANG_COOKIE = 'samaj-setu-lang';

/** Which candidate the member is currently acting for (spec §6). */
export const CANDIDATE_COOKIE = 'samaj-setu-candidate';

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLang(value: unknown): value is Lang {
  return value === 'gu' || value === 'en';
}

export type T = (gu: string, en: string) => string;

/** `t('ગુજરાતી', 'English')` — the same shape the prototype used throughout. */
export function translator(lang: Lang): T {
  return (gu, en) => (lang === 'en' ? en : gu);
}

/* --------------------------------------------------------------- formatting */

export function timeAgo(iso: string | null, lang: Lang): string {
  if (!iso) return lang === 'en' ? 'just now' : 'હમણાં જ';

  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return lang === 'en' ? 'just now' : 'હમણાં જ';
  if (minutes < 60) return lang === 'en' ? `${minutes} min ago` : `${minutes} મિનિટ પહેલાં`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return lang === 'en' ? `${hours} hr ago` : `${hours} કલાક પહેલાં`;

  const days = Math.floor(hours / 24);
  return lang === 'en' ? `${days}d ago` : `${days} દિવસ પહેલાં`;
}

export function centimetresToFeet(value: string | undefined): string | null {
  const cm = Number(value);
  if (!Number.isFinite(cm) || cm < 100 || cm > 250) return null;
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
}
