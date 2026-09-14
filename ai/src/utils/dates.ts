/**
 * Validate an ISO date string (YYYY-MM-DD).
 */
export function isValidDate(dateStr: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return (
    date.getFullYear() === Number(y) &&
    date.getMonth() === Number(m) - 1 &&
    date.getDate() === Number(d)
  );
}

/**
 * Validate a 24-hour time string (HH:mm:ss or HH:mm).
 */
export function isValidTime(timeStr: string): boolean {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr);
  if (!match) return false;
  const [, h, m, s] = match;
  return Number(h) < 24 && Number(m) < 60 && (s === undefined || Number(s) < 60);
}

/**
 * Normalise a time string to HH:mm:ss.
 */
export function normalizeTime(timeStr: string): string {
  const parts = timeStr.split(':');
  if (parts.length === 2) parts.push('00');
  return parts.map((p) => p.padStart(2, '0')).join(':');
}

/**
 * Validate an IANA timezone string.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
