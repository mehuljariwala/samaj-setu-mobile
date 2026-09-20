/**
 * The charitable trust that supports Samaj Setu.
 *
 * Its credit line closes every screen and its postal address is printed on the
 * support screen, so the details live here rather than being retyped into each
 * place that shows them — a registration number printed two different ways is
 * worse than not printing it at all.
 *
 * Any field left empty is simply left out of the screens that use it.
 */
type TrustDetails = {
  name: { gu: string; en: string };
  /** Public charity registration number, printed under the credit line. */
  registrationNumber: string;
  /** Postal address. Line breaks are preserved as written. */
  address: { gu: string; en: string };
  /** Landline or mobile, digits only, without the +91. */
  phone: string;
  email: string;
};

export const TRUST: TrustDetails = {
  name: { gu: 'ચંદન ચેરીટેબલ ટ્રસ્ટ', en: 'Chandan Charitable Trust' },
  registrationNumber: '',
  address: { gu: '', en: '' },
  phone: '',
  email: '',
};
