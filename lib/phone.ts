/**
 * Indian mobile numbers, as people actually write them.
 *
 * The same number turns up as 7874849983, 07874849983, +91 78748 49983 and
 * 917874849983. All four mean one thing; the database stores ten digits and
 * checks `^[6-9][0-9]{9}$`. Normalising on the way in stops a valid number
 * being rejected for the way it was typed — the leading 0 in particular is how
 * most people write it down.
 */
export const LOCAL_PHONE = /^[6-9]\d{9}$/;

export function normalizeLocalPhone(input: string): string {
  let digits = (input ?? '').replace(/\D/g, '');

  // +91 / 0091 country code, then the old STD trunk prefix.
  if (digits.length > 10 && digits.startsWith('0091')) digits = digits.slice(4);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  // Anything still too long is almost certainly a paste with extra digits in
  // front; the subscriber number is the last ten.
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function isValidLocalPhone(input: string): boolean {
  return LOCAL_PHONE.test(normalizeLocalPhone(input));
}

/** GoTrue speaks E.164; the product speaks ten local digits. */
export function toE164(input: string): string {
  return `+91${normalizeLocalPhone(input)}`;
}
