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
  /**
   * The samaj volunteers who take calls, in the order the community's own
   * notice prints them. Ten digits, no +91 — `formatPhone` adds it.
   */
  helpline: { name: { gu: string; en: string }; phone: string }[];
};

export const TRUST: TrustDetails = {
  name: { gu: 'ચંદન ચેરીટેબલ ટ્રસ્ટ', en: 'Chandan Charitable Trust' },
  registrationNumber: '',
  address: { gu: '', en: '' },
  phone: '',
  email: '',
  helpline: [
    { name: { gu: 'મુકેશ પસીયાવાલા', en: 'Mukesh Pasiyawala' }, phone: '9909599945' },
    { name: { gu: 'હિરેન પંડિત', en: 'Hiren Pandit' }, phone: '8460261781' },
    { name: { gu: 'ઉમેશભાઈ બારડોલિયા', en: 'Umeshbhai Bardoliya' }, phone: '9727735380' },
    { name: { gu: 'ભાવિન જરીવાલા', en: 'Bhavin Jariwala' }, phone: '9712979443' },
    { name: { gu: 'રિતેશ બારડોલિયા', en: 'Ritesh Bardoliya' }, phone: '9825035380' },
    { name: { gu: 'મેહુલ જરીવાલા', en: 'Mehul Jariwala' }, phone: '8866669302' },
    { name: { gu: 'સંદીપ પંડિત', en: 'Sandeep Pandit' }, phone: '7567703113' },
  ],
};

/** `9909599945` → `+91 99095 99945`, the way an Indian mobile is read aloud. */
export function formatPhone(phone: string): string {
  return phone.length === 10 ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : `+91 ${phone}`;
}
